BEGIN;

-- Canonical patient contact values. Hospital WhatsApp sender numbers are not
-- stored here because they identify providers, not patient families.
CREATE OR REPLACE FUNCTION public.normalize_patient_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
BEGIN
  IF digits LIKE '00%' THEN
    digits := substr(digits, 3);
  END IF;
  IF digits LIKE '0%' AND length(digits) = 11 THEN
    digits := '234' || substr(digits, 2);
  END IF;
  IF digits !~ '^[1-9][0-9]{9,14}$' THEN
    RETURN NULL;
  END IF;
  RETURN digits;
END;
$$;

CREATE TABLE IF NOT EXISTS public.policy_phone_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  family_policy_number text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(phone)
);

CREATE INDEX IF NOT EXISTS idx_policy_phone_registry_phone
  ON public.policy_phone_registry(phone);

ALTER TABLE public.policy_phone_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read phone registry"
  ON public.policy_phone_registry;
DROP POLICY IF EXISTS "Authenticated can insert phone registry"
  ON public.policy_phone_registry;

-- Do not expose the fraud registry to clients. Validation and registration are
-- atomic security-definer operations below.
REVOKE ALL ON TABLE public.policy_phone_registry FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Authenticated can read registry"
  ON public.policy_email_registry;
DROP POLICY IF EXISTS "Authenticated can insert registry"
  ON public.policy_email_registry;
REVOKE ALL ON TABLE public.policy_email_registry FROM PUBLIC, anon, authenticated;

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
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'Please provide a valid patient phone number.'
    );
  END IF;
  IF coalesce(family_policy, '') = '' THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'A valid policy number is required before registering a phone number.'
    );
  END IF;

  SELECT family_policy_number INTO existing_family
  FROM public.policy_phone_registry
  WHERE phone = normalized_phone;

  IF existing_family IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'normalized_phone', normalized_phone);
  END IF;
  IF existing_family = family_policy THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', 'same_family',
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
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'Please provide a valid patient phone number.'
    );
  END IF;
  IF coalesce(family_policy, '') = '' THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'A valid policy number is required before registering a phone number.'
    );
  END IF;

  INSERT INTO public.policy_phone_registry(phone, family_policy_number)
  VALUES (normalized_phone, family_policy)
  ON CONFLICT (phone) DO NOTHING;

  SELECT family_policy_number INTO existing_family
  FROM public.policy_phone_registry
  WHERE phone = normalized_phone;

  IF existing_family = family_policy THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'normalized_phone', normalized_phone
    );
  END IF;
  RETURN jsonb_build_object(
    'allowed', false,
    'reason', E'⚠️ Request Not Submitted\n\nThe patient phone number provided has already been registered for a different family policy and therefore cannot be used for two different family policies.\n\nPlease check the patient''s details and resubmit the request using the correct patient phone number.\n\nIf the patient does not have access to that number, please provide another valid phone number belonging to the patient or the patient''s family.\n\nIf you believe the number has been incorrectly associated with another family, please contact Ronsberger HMO support for assistance.\n\nNo authorization request has been created.'
  );
END;
$$;

-- Harden the existing email rule with the same canonical family semantics.
CREATE UNIQUE INDEX IF NOT EXISTS policy_email_registry_normalized_unique
  ON public.policy_email_registry (lower(btrim(email)));

CREATE OR REPLACE FUNCTION public.validate_policy_email(
  p_email text,
  p_family_policy text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  normalized_email text := lower(btrim(coalesce(p_email, '')));
  family_policy text;
  existing_family text;
BEGIN
  SELECT s.base_policy INTO family_policy
  FROM public.split_family_policy(trim(coalesce(p_family_policy, ''))) s;
  IF normalized_email = '' OR normalized_email = 'no-email@medicode.com' THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'not_provided');
  END IF;
  SELECT family_policy_number INTO existing_family
  FROM public.policy_email_registry
  WHERE lower(btrim(email)) = normalized_email;
  IF existing_family IS NULL OR existing_family = family_policy THEN
    RETURN jsonb_build_object('allowed', true, 'reason',
      CASE WHEN existing_family IS NULL THEN 'available' ELSE 'same_family' END);
  END IF;
  RETURN jsonb_build_object(
    'allowed', false,
    'reason', 'This email address is already associated with another policy family.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.register_policy_email(
  p_email text,
  p_family_policy text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  normalized_email text := lower(btrim(coalesce(p_email, '')));
  family_policy text;
  existing_family text;
BEGIN
  SELECT s.base_policy INTO family_policy
  FROM public.split_family_policy(trim(coalesce(p_family_policy, ''))) s;
  IF normalized_email = '' OR normalized_email = 'no-email@medicode.com' THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'not_provided');
  END IF;
  IF normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Please provide a valid email address.');
  END IF;

  INSERT INTO public.policy_email_registry(email, family_policy_number)
  VALUES (normalized_email, family_policy)
  ON CONFLICT DO NOTHING;

  SELECT family_policy_number INTO existing_family
  FROM public.policy_email_registry
  WHERE lower(btrim(email)) = normalized_email;
  IF existing_family = family_policy THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'same_family');
  END IF;
  RETURN jsonb_build_object(
    'allowed', false,
    'reason', 'This email address is already associated with another policy family.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_policy_phone(text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_policy_phone(text, text)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.register_policy_phone(text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_policy_phone(text, text)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.register_policy_email(text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_policy_email(text, text)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_policy_email(text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_policy_email(text, text)
  TO authenticated, service_role;

COMMIT;
