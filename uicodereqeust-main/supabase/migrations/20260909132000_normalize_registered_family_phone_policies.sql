-- Normalize existing phone registrations and compare family policies canonically.
UPDATE public.policy_phone_registry r
SET family_policy_number = (
  SELECT s.base_policy
  FROM public.split_family_policy(r.family_policy_number) s
)
WHERE r.family_policy_number IS DISTINCT FROM (
  SELECT s.base_policy
  FROM public.split_family_policy(r.family_policy_number) s
);

CREATE OR REPLACE FUNCTION public.validate_policy_phone(
  p_phone text,
  p_family_policy text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  normalized_phone text := public.normalize_patient_phone(p_phone);
  family_policy text;
  existing_family text;
BEGIN
  SELECT s.base_policy INTO family_policy
  FROM public.split_family_policy(trim(coalesce(p_family_policy, ''))) s;

  IF normalized_phone IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Please provide a valid patient phone number.');
  END IF;
  IF coalesce(family_policy, '') = '' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'A valid policy number is required before registering a phone number.');
  END IF;

  SELECT s.base_policy INTO existing_family
  FROM public.policy_phone_registry r
  CROSS JOIN LATERAL public.split_family_policy(r.family_policy_number) s
  WHERE r.phone = normalized_phone;

  IF existing_family IS NULL OR existing_family = family_policy THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', CASE WHEN existing_family = family_policy THEN 'same_family' ELSE NULL END,
      'normalized_phone', normalized_phone
    );
  END IF;
  RETURN jsonb_build_object(
    'allowed', false,
    'reason', E'⚠️ Request Not Submitted\n\nThe patient phone number provided has already been registered for a different family policy and therefore cannot be used for two different family policies.\n\nPlease check the patient''s details and resubmit the request using the correct patient phone number.\n\nIf the patient does not have access to that number, please provide another valid phone number belonging to the patient or the patient''s family.\n\nIf you believe the number has been incorrectly associated with another family, please contact Ronsberger HMO support for assistance.\n\nNo authorization request has been created.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.register_policy_phone(
  p_phone text,
  p_family_policy text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  normalized_phone text := public.normalize_patient_phone(p_phone);
  family_policy text;
  existing_family text;
BEGIN
  SELECT s.base_policy INTO family_policy
  FROM public.split_family_policy(trim(coalesce(p_family_policy, ''))) s;

  IF normalized_phone IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Please provide a valid patient phone number.');
  END IF;
  IF coalesce(family_policy, '') = '' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'A valid policy number is required before registering a phone number.');
  END IF;

  INSERT INTO public.policy_phone_registry(phone, family_policy_number)
  VALUES (normalized_phone, family_policy)
  ON CONFLICT (phone) DO NOTHING;

  SELECT s.base_policy INTO existing_family
  FROM public.policy_phone_registry r
  CROSS JOIN LATERAL public.split_family_policy(r.family_policy_number) s
  WHERE r.phone = normalized_phone;

  IF existing_family = family_policy THEN
    RETURN jsonb_build_object('allowed', true, 'normalized_phone', normalized_phone);
  END IF;
  RETURN jsonb_build_object(
    'allowed', false,
    'reason', E'⚠️ Request Not Submitted\n\nThe patient phone number provided has already been registered for a different family policy and therefore cannot be used for two different family policies.\n\nPlease check the patient''s details and resubmit the request using the correct patient phone number.\n\nIf the patient does not have access to that number, please provide another valid phone number belonging to the patient or the patient''s family.\n\nIf you believe the number has been incorrectly associated with another family, please contact Ronsberger HMO support for assistance.\n\nNo authorization request has been created.'
  );
END;
$$;
