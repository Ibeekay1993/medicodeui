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
  normalized_tags text[] := '{}'::text[];
  normalized_department text := regexp_replace(lower(COALESCE(_department, '')), '[^a-z0-9]+', ' ', 'g');
  code_values text[];
BEGIN
  SELECT COALESCE(array_agg(trim(regexp_replace(lower(tag), '[^a-z0-9/ -]+', ' ', 'g'))), '{}'::text[])
  INTO normalized_tags
  FROM unnest(tag_values) AS tag;

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
      OR normalized_department ~ '(^| )(nurs|nursing|auth|authorization|pre ?auth|preauthorization|prior|clinical|code)( |$)'
      OR EXISTS (
        SELECT 1
        FROM unnest(tag_values) AS tag
        WHERE lower(tag) LIKE 'request:%'
      )
      OR EXISTS (
        SELECT 1
        FROM unnest(normalized_tags) AS tag
        WHERE tag ~ '(^| )(nurs|nursing|auth|authorization|pre ?auth|preauthorization|prior|clinical|code)( |$)'
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
      OR normalized_department ~ '(^| )(claim|claims|billing|bill|finance|payment|reimburse|reimbursement|tariff)( |$)'
      OR EXISTS (
        SELECT 1
        FROM unnest(tag_values) AS tag
        WHERE lower(tag) LIKE 'claim:%'
      )
      OR EXISTS (
        SELECT 1
        FROM unnest(normalized_tags) AS tag
        WHERE tag ~ '(^| )(claim|claims|billing|bill|finance|payment|reimburse|reimbursement|tariff)( |$)'
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

NOTIFY pgrst, 'reload schema';

COMMIT;
