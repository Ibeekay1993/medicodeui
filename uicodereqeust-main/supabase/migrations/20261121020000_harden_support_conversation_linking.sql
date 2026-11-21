-- ============================================================================
-- Harden Support Conversation Linking (Tenant & Caller Validation)
--
-- Replaces public.link_support_conversation_to_request to:
-- 1. Enforce authentication (auth.uid() IS NOT NULL)
-- 2. Allow platform clinical staff (admin, nurse, utilization_manager) to link
-- 3. Restrict hospital callers so they can ONLY link conversations belonging
--    to their own hospital, to requests belonging to their own hospital.
-- 4. Prevent cross-tenant linking or information disclosure.
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.link_support_conversation_to_request(_conversation_id uuid, _request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conversation_row public.support_conversations%rowtype;
  existing_row public.support_conversations%rowtype;
  request_row public.authorization_requests%rowtype;
  request_meta jsonb;
  request_ref text;
  caller_role public.app_role;
  caller_hospital_id uuid;
BEGIN
  -- 1. Ensure authenticated session
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- 2. Verify authorization request exists
  SELECT * INTO request_row
  FROM public.authorization_requests
  WHERE id = _request_id;

  IF request_row.id IS NULL THEN
    RAISE EXCEPTION 'Authorization request not found';
  END IF;

  -- 3. Verify support conversation exists
  SELECT * INTO conversation_row
  FROM public.support_conversations
  WHERE id = _conversation_id;

  IF conversation_row.id IS NULL THEN
    RAISE EXCEPTION 'Support conversation not found';
  END IF;

  -- 4. Check permissions: staff or tenant hospital owner
  SELECT role, hospital_id INTO caller_role, caller_hospital_id
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  -- If hospital user: enforce tenant ownership on both conversation and request
  IF caller_role = 'hospital'::public.app_role THEN
    IF caller_hospital_id IS NULL THEN
      SELECT id INTO caller_hospital_id FROM public.hospitals WHERE user_id = auth.uid() LIMIT 1;
    END IF;

    IF caller_hospital_id IS NULL THEN
      RAISE EXCEPTION 'Hospital account not found' USING ERRCODE = '42501';
    END IF;

    -- Caller must own or be assigned to the conversation
    IF conversation_row.hospital_id IS NOT NULL AND conversation_row.hospital_id <> caller_hospital_id THEN
      RAISE EXCEPTION 'You can only link support conversations belonging to your hospital' USING ERRCODE = '42501';
    END IF;

    -- The request must belong to this hospital (direct, requesting, referring, referred, or claiming)
    IF NOT (
      request_row.hospital_id = caller_hospital_id
      OR request_row.requesting_hospital_id = caller_hospital_id
      OR request_row.referring_hospital_id = caller_hospital_id
      OR request_row.referred_hospital_id = caller_hospital_id
      OR request_row.claiming_hospital_id = caller_hospital_id
    ) THEN
      RAISE EXCEPTION 'Authorization request does not belong to your hospital' USING ERRCODE = '42501';
    END IF;
  ELSIF caller_role NOT IN ('admin'::public.app_role, 'nurse'::public.app_role, 'utilization_manager'::public.app_role, 'utilization_manager_lead'::public.app_role) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to link support conversations' USING ERRCODE = '42501';
  END IF;

  -- 5. Check if another request support conversation is already linked to this request
  SELECT * INTO existing_row
  FROM public.support_conversations
  WHERE linked_request_id = _request_id
    AND ticket_type = 'request_support'
  ORDER BY created_at DESC
  LIMIT 1;

  IF existing_row.id IS NOT NULL AND existing_row.id <> _conversation_id THEN
    RAISE EXCEPTION 'This request already has one support thread. Open the existing request support conversation instead of creating another.';
  END IF;

  request_meta := public.request_support_ticket_metadata(_request_id);
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

REVOKE ALL ON FUNCTION public.link_support_conversation_to_request(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_support_conversation_to_request(uuid, uuid) TO authenticated, service_role;

COMMIT;
