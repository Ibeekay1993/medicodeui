BEGIN;

ALTER TABLE public.support_conversations
  ADD COLUMN IF NOT EXISTS linked_request_id UUID REFERENCES public.authorization_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS request_reference TEXT,
  ADD COLUMN IF NOT EXISTS request_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ticket_type TEXT NOT NULL DEFAULT 'general' CHECK (ticket_type IN ('general', 'request_support', 'claim_support')),
  ADD COLUMN IF NOT EXISTS request_ticket_status TEXT NOT NULL DEFAULT 'open' CHECK (request_ticket_status IN ('open', 'awaiting_hospital_response', 'awaiting_insurer_response', 'resolved', 'closed')),
  ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT 'General Support',
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS nurse_alerted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nurse_alert_seen_at TIMESTAMPTZ;

ALTER TABLE public.support_conversations
  DROP CONSTRAINT IF EXISTS support_conversations_status_check;

ALTER TABLE public.support_conversations
  ADD CONSTRAINT support_conversations_status_check
  CHECK (status IN ('new', 'open', 'pending_customer_response', 'waiting_internal_action', 'resolved', 'closed', 'reopened', 'pending'));

ALTER TABLE public.support_conversations
  DROP CONSTRAINT IF EXISTS support_conversations_priority_check;

ALTER TABLE public.support_conversations
  ADD CONSTRAINT support_conversations_priority_check
  CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

CREATE INDEX IF NOT EXISTS idx_support_conversations_linked_request
  ON public.support_conversations(linked_request_id);
CREATE INDEX IF NOT EXISTS idx_support_conversations_ticket_type
  ON public.support_conversations(ticket_type, status, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_support_conversations_request_ticket_status
  ON public.support_conversations(request_ticket_status, status);

CREATE OR REPLACE FUNCTION public.request_support_ticket_metadata(_request_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'request_id', ar.request_id,
    'request_uuid', ar.id,
    'request_reference', COALESCE(ar.authorization_code, ar.request_id, ar.id::text),
    'patient_name', ar.patient_name,
    'policy_number', ar.policy_number,
    'diagnosis', ar.diagnosis,
    'treatment', ar.treatment,
    'clinical_notes', ar.clinical_notes,
    'decision_reason', ar.decision_reason,
    'status', ar.status,
    'authorization_code', ar.authorization_code,
    'decided_by', ar.decided_by,
    'decided_at', ar.decided_at,
    'submitted_by', ar.submitted_by,
    'hospital', COALESCE(ar.hospital_name, h.name),
    'hospital_id', ar.hospital_id,
    'hospital_code', h.code,
    'date_created', ar.created_at,
    'referring_hospital_id', ar.referring_hospital_id,
    'referring_hospital_name', ar.referring_hospital_name,
    'referred_hospital_id', ar.referred_hospital_id,
    'referred_hospital_name', ar.referred_hospital_name,
    'claiming_hospital_id', ar.claiming_hospital_id,
    'claiming_hospital_name', ar.claiming_hospital_name
  )
  FROM public.authorization_requests ar
  LEFT JOIN public.hospitals h ON h.id = ar.hospital_id
  WHERE ar.id = _request_id;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_conversations_one_request_support_thread
  ON public.support_conversations(linked_request_id)
  WHERE ticket_type = 'request_support'
    AND linked_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_request_support_ticket(
  _request_id uuid,
  _initial_message text,
  _priority text DEFAULT 'normal'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor public.user_roles%rowtype;
  hospital_row public.hospitals%rowtype;
  request_row public.authorization_requests%rowtype;
  request_meta jsonb;
  request_ref text;
  conversation_row public.support_conversations%rowtype;
  request_tags text[];
BEGIN
  SELECT * INTO actor
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF actor.user_id IS NULL THEN
    RAISE EXCEPTION 'Only authenticated platform users can create messages';
  END IF;

  IF actor.role <> 'hospital' THEN
    RAISE EXCEPTION 'Only hospitals can create request support tickets from authorization requests';
  END IF;

  SELECT * INTO hospital_row
  FROM public.hospitals
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF hospital_row.id IS NULL THEN
    RAISE EXCEPTION 'Hospital account not found';
  END IF;

  SELECT * INTO request_row
  FROM public.authorization_requests
  WHERE id = _request_id;

  IF request_row.id IS NULL THEN
    RAISE EXCEPTION 'Authorization request not found';
  END IF;

  IF request_row.status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Request support tickets can only be raised for approved or declined authorization codes';
  END IF;

  IF COALESCE(request_row.authorization_code, request_row.request_id) IS NULL THEN
    RAISE EXCEPTION 'Authorization request does not have a code or request reference';
  END IF;

  IF NOT (
    request_row.hospital_id = hospital_row.id
    OR request_row.requesting_hospital_id = hospital_row.id
    OR request_row.referring_hospital_id = hospital_row.id
    OR request_row.referred_hospital_id = hospital_row.id
    OR request_row.claiming_hospital_id = hospital_row.id
  ) THEN
    RAISE EXCEPTION 'Hospital is not allowed to raise support for this authorization request';
  END IF;

  request_meta := public.request_support_ticket_metadata(_request_id);
  request_ref := request_meta->>'request_reference';
  request_tags := ARRAY[
    'request:' || _request_id::text,
    'code:' || COALESCE(request_meta->>'authorization_code', request_ref)
  ];

  SELECT * INTO conversation_row
  FROM public.support_conversations
  WHERE linked_request_id = _request_id
    AND ticket_type = 'request_support'
  ORDER BY created_at DESC
  LIMIT 1;

  IF conversation_row.id IS NOT NULL THEN
    IF NULLIF(trim(COALESCE(_initial_message, '')), '') IS NOT NULL THEN
      INSERT INTO public.support_messages (
        conversation_id,
        sender_id,
        sender_role,
        sender_name,
        body
      )
      VALUES (
        conversation_row.id,
        auth.uid(),
        actor.role::text,
        COALESCE(hospital_row.name, actor.full_name, (SELECT email FROM auth.users WHERE id = auth.uid()), actor.role::text),
        trim(_initial_message)
      );
    END IF;

    PERFORM public.write_audit_log(
      'REQUEST_SUPPORT_MESSAGE_ADDED',
      'support_conversation',
      conversation_row.id::text,
      '{}'::jsonb,
      jsonb_build_object('linked_request_id', _request_id, 'request_reference', request_ref),
      'Hospital added a message to existing request support thread',
      'info',
      jsonb_build_object('conversation_id', conversation_row.id, 'linked_request_id', _request_id, 'hospital_id', hospital_row.id)
    );

    RETURN to_jsonb(conversation_row);
  END IF;

  INSERT INTO public.support_conversations (
    subject,
    department,
    priority,
    hospital_id,
    hospital_user_id,
    created_by,
    status,
    linked_request_id,
    request_reference,
    request_metadata,
    ticket_type,
    request_ticket_status,
    tags
  )
  VALUES (
    'Request Support: ' || request_ref,
    'Request Support',
    lower(COALESCE(NULLIF(_priority, ''), 'normal')),
    hospital_row.id,
    auth.uid(),
    auth.uid(),
    'new',
    _request_id,
    request_ref,
    request_meta,
    'request_support',
    'open',
    request_tags
  )
  RETURNING * INTO conversation_row;

  INSERT INTO public.support_messages (
    conversation_id,
    sender_id,
    sender_role,
    sender_name,
    body
  )
  VALUES (
    conversation_row.id,
    auth.uid(),
    actor.role::text,
    COALESCE(hospital_row.name, actor.full_name, (SELECT email FROM auth.users WHERE id = auth.uid()), actor.role::text),
    trim(COALESCE(_initial_message, ''))
  );

  PERFORM public.write_audit_log(
    'REQUEST_SUPPORT_TICKET_CREATED',
    'support_conversation',
    conversation_row.id::text,
    '{}'::jsonb,
    jsonb_build_object('linked_request_id', _request_id, 'request_reference', request_ref),
    'Hospital raised request support ticket',
    'info',
    jsonb_build_object('conversation_id', conversation_row.id, 'linked_request_id', _request_id, 'hospital_id', hospital_row.id)
  );

  RETURN to_jsonb(conversation_row);
END;
$$;

COMMIT;
