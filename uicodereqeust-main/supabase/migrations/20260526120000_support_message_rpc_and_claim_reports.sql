BEGIN;

CREATE OR REPLACE FUNCTION public.assert_support_participant(_conversation_id uuid, _allow_internal boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.support_conversations sc
    WHERE sc.id = _conversation_id
      AND sc.status NOT IN ('closed', 'resolved')
      AND (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'nurse')
        OR public.has_role(auth.uid(), 'claims')
        OR (
          _allow_internal = false
          AND (sc.hospital_user_id = auth.uid() OR sc.created_by = auth.uid())
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.create_support_ticket(
  _subject text,
  _department text DEFAULT 'General Support',
  _priority text DEFAULT 'normal',
  _initial_message text DEFAULT ''
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

  INSERT INTO public.support_conversations (
    subject,
    department,
    priority,
    hospital_id,
    hospital_user_id,
    created_by,
    status
  )
  VALUES (
    COALESCE(NULLIF(_subject, ''), 'Support conversation'),
    COALESCE(NULLIF(_department, ''), 'General Support'),
    lower(COALESCE(NULLIF(_priority, ''), 'normal')),
    hospital_row.id,
    CASE WHEN actor.role = 'hospital' THEN auth.uid() ELSE NULL END,
    auth.uid(),
    'new'
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

CREATE OR REPLACE FUNCTION public.send_support_message(
  _conversation_id uuid,
  _body text,
  _is_internal boolean DEFAULT false,
  _attachment_url text DEFAULT NULL,
  _attachment_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_row public.user_roles%rowtype;
  hospital_name text;
  message_row public.support_messages%rowtype;
BEGIN
  IF NULLIF(trim(COALESCE(_body, '')), '') IS NULL AND _attachment_url IS NULL THEN
    RAISE EXCEPTION 'Message body or attachment is required';
  END IF;

  SELECT * INTO role_row
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF role_row.user_id IS NULL THEN
    RAISE EXCEPTION 'Only authenticated platform users can send messages';
  END IF;

  IF _is_internal AND role_row.role::text NOT IN ('admin', 'nurse', 'claims') THEN
    RAISE EXCEPTION 'Only internal users can add internal notes';
  END IF;

  IF NOT public.assert_support_participant(_conversation_id, _is_internal) THEN
    RAISE EXCEPTION 'You do not have access to this open conversation';
  END IF;

  SELECT h.name INTO hospital_name
  FROM public.hospitals h
  WHERE h.user_id = auth.uid()
  LIMIT 1;

  INSERT INTO public.support_messages (
    conversation_id,
    sender_id,
    sender_role,
    sender_name,
    body,
    attachment_url,
    attachment_name,
    is_internal,
    message_type
  )
  VALUES (
    _conversation_id,
    auth.uid(),
    role_row.role::text,
    COALESCE(hospital_name, role_row.full_name, (SELECT email FROM auth.users WHERE id = auth.uid()), role_row.role::text),
    trim(COALESCE(_body, '')),
    _attachment_url,
    _attachment_name,
    _is_internal,
    CASE WHEN _is_internal THEN 'internal_note' ELSE 'message' END
  )
  RETURNING * INTO message_row;

  RETURN to_jsonb(message_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.claims_report_export(
  _status text DEFAULT 'all',
  _hospital_id uuid DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  claim_id uuid,
  claim_number text,
  created_at timestamptz,
  submitted_at timestamptz,
  hospital_name text,
  patient_name text,
  policy_number text,
  auth_code text,
  status text,
  original_amount numeric,
  approved_amount numeric,
  declined_amount numeric,
  total_amount numeric,
  audit_note text,
  payment_note text,
  paid_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    hc.id,
    hc.claim_number,
    hc.created_at,
    hc.submitted_at,
    hc.hospital_name,
    hc.patient_name,
    hc.policy_number,
    hc.auth_code,
    hc.status,
    COALESCE(hc.original_amount, hc.total_amount),
    COALESCE(hc.approved_amount, CASE WHEN lower(hc.status) IN ('approved', 'paid') THEN hc.total_amount ELSE 0 END),
    COALESCE(hc.declined_amount, 0),
    hc.total_amount,
    hc.audit_note,
    hc.payment_note,
    hc.paid_at
  FROM public.hospital_claims hc
  WHERE (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'claims')
    )
    AND (_status = 'all' OR lower(hc.status) = lower(_status))
    AND (_hospital_id IS NULL OR hc.hospital_id = _hospital_id)
    AND (_from IS NULL OR hc.created_at >= _from)
    AND (_to IS NULL OR hc.created_at <= _to)
  ORDER BY hc.created_at DESC;
$$;

COMMIT;
