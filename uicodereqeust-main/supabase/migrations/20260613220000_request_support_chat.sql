BEGIN;

ALTER TABLE public.support_conversations
  ADD COLUMN IF NOT EXISTS linked_request_id UUID REFERENCES public.authorization_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS request_reference TEXT,
  ADD COLUMN IF NOT EXISTS request_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ticket_type TEXT NOT NULL DEFAULT 'general' CHECK (ticket_type IN ('general', 'request_support', 'claim_support')),
  ADD COLUMN IF NOT EXISTS request_ticket_status TEXT NOT NULL DEFAULT 'open' CHECK (request_ticket_status IN ('open', 'awaiting_hospital_response', 'awaiting_insurer_response', 'resolved', 'closed')),
  ADD COLUMN IF NOT EXISTS nurse_alerted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nurse_alert_seen_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.support_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  linked_request_id UUID REFERENCES public.authorization_requests(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_conversations_linked_request
  ON public.support_conversations(linked_request_id);
CREATE INDEX IF NOT EXISTS idx_support_conversations_ticket_type
  ON public.support_conversations(ticket_type, status, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_support_conversations_request_ticket_status
  ON public.support_conversations(request_ticket_status, status);
CREATE INDEX IF NOT EXISTS idx_support_notifications_user_unread
  ON public.support_notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_notifications_conversation
  ON public.support_notifications(conversation_id);

ALTER TABLE public.support_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own support notifications" ON public.support_notifications;
CREATE POLICY "Users can read own support notifications"
  ON public.support_notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can mark own support notifications read" ON public.support_notifications;
CREATE POLICY "Users can mark own support notifications read"
  ON public.support_notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND is_read = true);

GRANT SELECT, UPDATE ON public.support_notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.find_support_assignee(_department text DEFAULT NULL)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.user_id
  FROM public.user_roles ur
  LEFT JOIN public.support_conversations sc
    ON sc.assigned_to = ur.user_id
   AND sc.status NOT IN ('closed', 'resolved')
  WHERE ur.role::text IN (
    CASE
      WHEN lower(COALESCE(_department, '')) IN ('nursing', 'authorization', 'auth request', 'request support', 'pre-auth', 'pre auth', 'prior auth', 'clinical')
        OR lower(COALESCE(_department, '')) ~ '(^|[^a-z])(nurs|auth|pre[-\s]?auth|prior|clinical|code|request)([^a-z]|$)'
      THEN 'nurse'
      WHEN lower(COALESCE(_department, '')) IN ('claims', 'claim support', 'billing')
        OR lower(COALESCE(_department, '')) ~ '(^|[^a-z])(claim|billing|bill|finance|payment|reimburse|tariff)([^a-z]|$)'
      THEN 'claims'
      ELSE 'nurse'
    END,
    'nurse',
    'admin'
  )
  GROUP BY ur.user_id
  ORDER BY count(sc.id), min(ur.user_id::text)
  LIMIT 1;
$$;

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

CREATE OR REPLACE FUNCTION public.create_support_ticket(
  _subject text,
  _department text DEFAULT 'General Support',
  _priority text DEFAULT 'normal',
  _initial_message text DEFAULT '',
  _ticket_type text DEFAULT 'general',
  _linked_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor public.user_roles%rowtype;
  hospital_row public.hospitals%rowtype;
  conversation_row public.support_conversations%rowtype;
  request_for_ticket public.authorization_requests%rowtype;
  request_meta jsonb;
  request_ref text;
  ticket_type_value text := lower(COALESCE(NULLIF(_ticket_type, ''), 'general'));
  request_tags text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO actor
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF actor.user_id IS NULL THEN
    RAISE EXCEPTION 'Only authenticated platform users can create messages';
  END IF;

  IF actor.role = 'hospital' THEN
    SELECT * INTO hospital_row
    FROM public.hospitals
    WHERE user_id = auth.uid()
       OR lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
    LIMIT 1;
  END IF;

  IF ticket_type_value NOT IN ('general', 'request_support', 'claim_support') THEN
    ticket_type_value := 'general';
  END IF;

  IF ticket_type_value = 'request_support' AND _linked_request_id IS NOT NULL THEN
    SELECT * INTO request_for_ticket
    FROM public.authorization_requests
    WHERE id = _linked_request_id;

    IF request_for_ticket.id IS NULL THEN
      RAISE EXCEPTION 'Authorization request not found';
    END IF;

    IF request_for_ticket.status NOT IN ('approved', 'rejected') THEN
      RAISE EXCEPTION 'Request support tickets can only be raised for approved or declined authorization codes';
    END IF;

    IF actor.role = 'hospital' AND NOT (
      request_for_ticket.hospital_id = hospital_row.id
      OR request_for_ticket.requesting_hospital_id = hospital_row.id
      OR request_for_ticket.referring_hospital_id = hospital_row.id
      OR request_for_ticket.referred_hospital_id = hospital_row.id
      OR request_for_ticket.claiming_hospital_id = hospital_row.id
    ) THEN
      RAISE EXCEPTION 'Hospital is not allowed to raise support for this authorization request';
    END IF;
  END IF;

  IF _linked_request_id IS NOT NULL THEN
    request_meta := public.request_support_ticket_metadata(_linked_request_id);
    request_ref := request_meta->>'request_reference';
    request_tags := ARRAY[
      'request:' || (_linked_request_id::text),
      'code:' || COALESCE(request_meta->>'authorization_code', request_ref)
    ];
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
    COALESCE(NULLIF(_subject, ''), 'Support conversation'),
    COALESCE(NULLIF(_department, ''), 'General Support'),
    lower(COALESCE(NULLIF(_priority, ''), 'normal')),
    hospital_row.id,
    CASE WHEN actor.role = 'hospital' THEN auth.uid() ELSE NULL END,
    auth.uid(),
    'new',
    _linked_request_id,
    request_ref,
    COALESCE(request_meta, '{}'::jsonb),
    ticket_type_value,
    CASE WHEN ticket_type_value = 'request_support' THEN 'open' ELSE 'open' END,
    request_tags
  )
  RETURNING * INTO conversation_row;

  IF NULLIF(trim(_initial_message), '') IS NOT NULL THEN
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

  RETURN to_jsonb(conversation_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.link_support_conversation_to_request(_conversation_id uuid, _request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conversation_row public.support_conversations%rowtype;
  request_meta jsonb;
  request_ref text;
BEGIN
  request_meta := public.request_support_ticket_metadata(_request_id);
  IF request_meta IS NULL THEN
    RAISE EXCEPTION 'Authorization request not found';
  END IF;

  request_ref := request_meta->>'request_reference';

  UPDATE public.support_conversations
  SET linked_request_id = _request_id,
      request_reference = request_ref,
      request_metadata = request_meta,
      ticket_type = CASE WHEN ticket_type = 'claim_support' THEN ticket_type ELSE 'request_support' END,
      request_ticket_status = 'open',
      tags = COALESCE(tags, ARRAY[]::text[]) || ARRAY['request:' || _request_id::text, 'code:' || COALESCE(request_meta->>'authorization_code', request_ref)]
  WHERE id = _conversation_id
  RETURNING * INTO conversation_row;

  IF conversation_row.id IS NULL THEN
    RAISE EXCEPTION 'Support conversation not found';
  END IF;

  PERFORM public.write_audit_log(
    'REQUEST_SUPPORT_LINKED',
    'support_conversation',
    _conversation_id::text,
    '{}'::jsonb,
    jsonb_build_object('linked_request_id', _request_id, 'request_reference', request_ref),
    'Support conversation linked to authorization request',
    'info',
    jsonb_build_object('conversation_id', _conversation_id, 'linked_request_id', _request_id)
  );

  RETURN to_jsonb(conversation_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_request_support_ticket(_request_id uuid, _initial_message text, _priority text DEFAULT 'normal')
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

CREATE OR REPLACE FUNCTION public.mark_support_notifications_read(_conversation_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.support_notifications
  SET is_read = true
  WHERE user_id = auth.uid()
    AND conversation_id = _conversation_id
    AND is_read = false;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_nurse_request_support_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_is_nurse boolean;
BEGIN
  IF NEW.ticket_type <> 'request_support' OR NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = NEW.assigned_to
      AND role = 'nurse'
  ) INTO assigned_is_nurse;

  IF NOT assigned_is_nurse THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
     OR (
       TG_OP = 'UPDATE'
       AND (
         OLD.assigned_to IS DISTINCT FROM NEW.assigned_to
         OR OLD.ticket_type IS DISTINCT FROM NEW.ticket_type
         OR OLD.linked_request_id IS DISTINCT FROM NEW.linked_request_id
       )
     ) THEN
    INSERT INTO public.support_notifications (
      user_id,
      conversation_id,
      linked_request_id,
      title,
      message
    )
    VALUES (
      NEW.assigned_to,
      NEW.id,
      NEW.linked_request_id,
      'Request Support Ticket Assigned',
      COALESCE(NEW.request_reference, NEW.subject, 'A request support ticket was assigned to you.')
    );

    UPDATE public.support_conversations
    SET nurse_alerted_at = now()
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_nurse_request_support_ticket_trigger ON public.support_conversations;
CREATE TRIGGER notify_nurse_request_support_ticket_trigger
AFTER INSERT OR UPDATE ON public.support_conversations
FOR EACH ROW
EXECUTE FUNCTION public.notify_nurse_request_support_ticket();

CREATE OR REPLACE FUNCTION public.touch_request_support_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status text;
  assigned_to_value uuid;
  assigned_is_nurse boolean;
BEGIN
  SELECT status, assigned_to INTO current_status, assigned_to_value
  FROM public.support_conversations
  WHERE id = NEW.conversation_id;

  IF current_status IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.support_conversations
  SET status = CASE
    WHEN NEW.sender_role = 'hospital' AND current_status IN ('closed', 'resolved') THEN 'reopened'
    WHEN current_status IN ('closed', 'resolved') THEN current_status
    WHEN NEW.sender_role = 'hospital' AND current_status IN ('pending_customer_response', 'waiting_internal_action', 'pending') THEN 'open'
    WHEN NEW.sender_role IN ('admin', 'nurse', 'claims') AND NOT COALESCE(NEW.is_internal, false) THEN 'pending_customer_response'
    ELSE current_status
  END,
  request_ticket_status = CASE
    WHEN current_status IN ('closed', 'resolved') AND NEW.sender_role <> 'hospital' THEN lower(current_status)
    WHEN NEW.sender_role = 'hospital' THEN 'awaiting_insurer_response'
    WHEN NEW.sender_role IN ('admin', 'nurse', 'claims') AND NOT COALESCE(NEW.is_internal, false) THEN 'awaiting_hospital_response'
    ELSE request_ticket_status
  END
  WHERE id = NEW.conversation_id
    AND ticket_type = 'request_support';

  IF NEW.sender_role = 'hospital' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = assigned_to_value
        AND role = 'nurse'
    ) INTO assigned_is_nurse;

    IF assigned_is_nurse THEN
      INSERT INTO public.support_notifications (
        user_id,
        conversation_id,
        linked_request_id,
        title,
        message
      )
      SELECT assigned_to,
             NEW.conversation_id,
             linked_request_id,
             'Hospital replied on Request Support Ticket',
             COALESCE(request_reference, subject, 'Hospital replied on a request support ticket.')
      FROM public.support_conversations
      WHERE id = NEW.conversation_id
        AND ticket_type = 'request_support'
        AND assigned_to IS NOT NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_request_support_ticket_trigger ON public.support_messages;
CREATE TRIGGER touch_request_support_ticket_trigger
AFTER INSERT ON public.support_messages
FOR EACH ROW
EXECUTE FUNCTION public.touch_request_support_ticket();

COMMIT;
