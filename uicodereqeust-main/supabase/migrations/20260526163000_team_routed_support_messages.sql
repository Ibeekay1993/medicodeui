BEGIN;

CREATE OR REPLACE FUNCTION public.support_conversation_visible_to_current_user(
  _hospital_user_id uuid,
  _created_by uuid,
  _nurse_user_id uuid,
  _assigned_to uuid,
  _department text,
  _tags text[]
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tag_values text[] := COALESCE(_tags, '{}'::text[]);
  code_values text[];
BEGIN
  SELECT COALESCE(array_agg(lower(trim(split_part(tag, ':', 2)))), '{}'::text[])
  INTO code_values
  FROM unnest(tag_values) AS tag
  WHERE lower(tag) LIKE 'code:%'
    AND NULLIF(trim(split_part(tag, ':', 2)), '') IS NOT NULL;

  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN true;
  END IF;

  IF auth.uid() = _hospital_user_id OR auth.uid() = _created_by THEN
    RETURN true;
  END IF;

  IF public.has_role(auth.uid(), 'nurse') THEN
    RETURN COALESCE(_assigned_to = auth.uid(), false)
      OR COALESCE(_nurse_user_id = auth.uid(), false)
      OR lower(COALESCE(_department, '')) ~ '(nurs|auth|pre[- ]?auth|preauthorization|prior|clinical|code)'
      OR EXISTS (
        SELECT 1
        FROM unnest(tag_values) AS tag
        WHERE lower(tag) LIKE 'request:%'
      )
      OR EXISTS (
        SELECT 1
        FROM unnest(tag_values) AS tag
        WHERE lower(tag) ~ '^(nurs|auth|pre[-_ ]?auth|preauthorization|prior|clinical|code)'
      )
      OR EXISTS (
        SELECT 1
        FROM public.authorization_requests ar
        WHERE lower(COALESCE(ar.authorization_code, '')) = ANY(code_values)
           OR lower(COALESCE(ar.request_id, '')) = ANY(code_values)
           OR lower(ar.id::text) = ANY(code_values)
      );
  END IF;

  IF public.has_role(auth.uid(), 'claims') THEN
    RETURN COALESCE(_assigned_to = auth.uid(), false)
      OR lower(COALESCE(_department, '')) ~ '(claim|billing|bill|finance|payment|reimburse|tariff)'
      OR EXISTS (
        SELECT 1
        FROM unnest(tag_values) AS tag
        WHERE lower(tag) LIKE 'claim:%'
      )
      OR EXISTS (
        SELECT 1
        FROM unnest(tag_values) AS tag
        WHERE lower(tag) ~ '^(claim|billing|bill|finance|payment|reimburse|tariff)'
      )
      OR EXISTS (
        SELECT 1
        FROM public.hospital_claims hc
        WHERE lower(COALESCE(hc.auth_code, '')) = ANY(code_values)
           OR lower(COALESCE(hc.claim_number, '')) = ANY(code_values)
           OR lower(hc.id::text) = ANY(code_values)
           OR lower(COALESCE(hc.request_id::text, '')) = ANY(code_values)
      );
  END IF;

  RETURN false;
END;
$$;

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
      AND public.support_conversation_visible_to_current_user(
        sc.hospital_user_id,
        sc.created_by,
        sc.nurse_user_id,
        sc.assigned_to,
        sc.department,
        sc.tags
      )
      AND (
        _allow_internal = false
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'nurse')
        OR public.has_role(auth.uid(), 'claims')
      )
  );
$$;

DROP POLICY IF EXISTS "Support roles can read conversations" ON public.support_conversations;
CREATE POLICY "Support roles can read conversations"
  ON public.support_conversations
  FOR SELECT
  TO authenticated
  USING (
    public.support_conversation_visible_to_current_user(
      hospital_user_id,
      created_by,
      nurse_user_id,
      assigned_to,
      department,
      tags
    )
  );

DROP POLICY IF EXISTS "Support roles can update conversations" ON public.support_conversations;
CREATE POLICY "Support roles can update conversations"
  ON public.support_conversations
  FOR UPDATE
  TO authenticated
  USING (
    public.support_conversation_visible_to_current_user(
      hospital_user_id,
      created_by,
      nurse_user_id,
      assigned_to,
      department,
      tags
    )
  )
  WITH CHECK (
    public.support_conversation_visible_to_current_user(
      hospital_user_id,
      created_by,
      nurse_user_id,
      assigned_to,
      department,
      tags
    )
  );

DROP POLICY IF EXISTS "Support participants can read messages" ON public.support_messages;
CREATE POLICY "Support participants can read messages"
  ON public.support_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.support_conversations sc
      WHERE sc.id = conversation_id
        AND public.support_conversation_visible_to_current_user(
          sc.hospital_user_id,
          sc.created_by,
          sc.nurse_user_id,
          sc.assigned_to,
          sc.department,
          sc.tags
        )
        AND (
          is_internal = false
          OR public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'nurse')
          OR public.has_role(auth.uid(), 'claims')
        )
    )
  );

DROP POLICY IF EXISTS "Support participants can create messages" ON public.support_messages;
CREATE POLICY "Support participants can create messages"
  ON public.support_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.support_conversations sc
      WHERE sc.id = conversation_id
        AND sc.status NOT IN ('closed', 'resolved')
        AND public.support_conversation_visible_to_current_user(
          sc.hospital_user_id,
          sc.created_by,
          sc.nurse_user_id,
          sc.assigned_to,
          sc.department,
          sc.tags
        )
        AND (
          is_internal = false
          OR public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'nurse')
          OR public.has_role(auth.uid(), 'claims')
        )
    )
  );

DROP POLICY IF EXISTS "Support participants can update read state" ON public.support_messages;
CREATE POLICY "Support participants can update read state"
  ON public.support_messages
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.support_conversations sc
      WHERE sc.id = conversation_id
        AND public.support_conversation_visible_to_current_user(
          sc.hospital_user_id,
          sc.created_by,
          sc.nurse_user_id,
          sc.assigned_to,
          sc.department,
          sc.tags
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.support_conversations sc
      WHERE sc.id = conversation_id
        AND public.support_conversation_visible_to_current_user(
          sc.hospital_user_id,
          sc.created_by,
          sc.nurse_user_id,
          sc.assigned_to,
          sc.department,
          sc.tags
        )
    )
  );

GRANT EXECUTE ON FUNCTION public.support_conversation_visible_to_current_user(uuid, uuid, uuid, uuid, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_support_participant(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
