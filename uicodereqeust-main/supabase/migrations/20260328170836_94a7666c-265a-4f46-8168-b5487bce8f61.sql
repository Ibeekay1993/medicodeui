
CREATE OR REPLACE FUNCTION public.verify_nhis(_policy_number text, _patient_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSONB;
  members JSONB;
  principal_name TEXT;
  member_count INT;
BEGIN
  SELECT count(*) INTO member_count
  FROM public.nhis_beneficiaries
  WHERE policy_number = _policy_number;

  IF member_count = 0 THEN
    RETURN jsonb_build_object('found', false, 'message', 'Policy not found in NHIS accredited list');
  END IF;

  SELECT full_name INTO principal_name
  FROM public.nhis_beneficiaries
  WHERE policy_number = _policy_number AND member_type = 'PRINCIPAL'
  LIMIT 1;

  SELECT jsonb_agg(jsonb_build_object(
    'member_type', member_type,
    'full_name', full_name,
    'gender', gender,
    'dob', dob
  )) INTO members
  FROM public.nhis_beneficiaries
  WHERE policy_number = _policy_number;

  RETURN jsonb_build_object(
    'found', true,
    'principal', principal_name,
    'member_count', member_count,
    'members', members,
    'patient_match', CASE 
      WHEN _patient_name IS NOT NULL THEN EXISTS(
        SELECT 1 FROM public.nhis_beneficiaries
        WHERE policy_number = _policy_number
        AND (full_name ILIKE '%' || _patient_name || '%' 
             OR _patient_name ILIKE '%' || surname || '%')
      )
      ELSE NULL
    END
  );
END;
$$;
