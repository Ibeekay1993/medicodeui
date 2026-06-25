BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_conversations_one_request_support_thread
  ON public.support_conversations(linked_request_id)
  WHERE ticket_type = 'request_support'
    AND linked_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.link_support_conversation_to_request(_conversation_id uuid, _request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conversation_row public.support_conversations%rowtype;
  existing_row public.support_conversations%rowtype;
  request_meta jsonb;
  request_ref text;
BEGIN
  request_meta := public.request_support_ticket_metadata(_request_id);
  IF request_meta IS NULL THEN
    RAISE EXCEPTION 'Authorization request not found';
  END IF;

  request_ref := request_meta->>'request_reference';

  SELECT * INTO existing_row
  FROM public.support_conversations
  WHERE linked_request_id = _request_id
    AND ticket_type = 'request_support'
  ORDER BY created_at DESC
  LIMIT 1;

  IF existing_row.id IS NOT NULL AND existing_row.id <> _conversation_id THEN
    RAISE EXCEPTION 'This request already has one support thread. Open the existing request support conversation instead of creating another.';
  END IF;

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
