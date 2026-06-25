BEGIN;

-- 1. Extend otp_verifications with type and hospital binding
ALTER TABLE public.otp_verifications
  ADD COLUMN IF NOT EXISTS otp_type VARCHAR(20) DEFAULT 'ARRIVAL',
  ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL;

-- 2. Create Referral Code sequence and generator function
CREATE TABLE IF NOT EXISTS public.referral_code_sequence (
  id INT PRIMARY KEY,
  current_value BIGINT NOT NULL DEFAULT 0
);

INSERT INTO public.referral_code_sequence (id, current_value)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.generate_referral_code(nurse_initials TEXT DEFAULT 'AG')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_val BIGINT;
  clean_initials TEXT;
  current_year INT;
BEGIN
  clean_initials := upper(regexp_replace(coalesce(nurse_initials, 'AG'), '[^A-Za-z]', '', 'g'));
  clean_initials := left(clean_initials, 4);
  IF clean_initials = '' THEN
    clean_initials := 'AG';
  END IF;

  current_year := EXTRACT(YEAR FROM now())::INT;

  UPDATE public.referral_code_sequence
  SET current_value = current_value + 1
  WHERE id = 1
  RETURNING current_value INTO next_val;

  RETURN 'REF/' || current_year || '/' || LPAD(next_val::TEXT, 6, '0');
END;
$$;

-- 3. Enhance verify_otp to bind to request, type, and hospital
CREATE OR REPLACE FUNCTION public.verify_otp(
  p_request_id UUID, 
  p_otp_plaintext TEXT, 
  p_otp_type TEXT, 
  p_hospital_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  otp_record RECORD;
  otp_plaintext_local TEXT;
BEGIN
  -- Validate user role
  IF NOT (
    public.has_role(auth.uid(), 'nurse') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'claims') OR
    public.has_role(auth.uid(), 'hospital')
  ) THEN
    RETURN jsonb_build_object('verified', false, 'error', 'Access denied');
  END IF;

  -- Get the latest active OTP for this request, type, and hospital
  SELECT * INTO otp_record
  FROM public.otp_verifications
  WHERE authorization_id = p_request_id
    AND otp_type = p_otp_type
    AND (hospital_id IS NULL OR hospital_id = p_hospital_id)
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('verified', false, 'error', 'No valid OTP found matching criteria');
  END IF;

  IF otp_record.verified THEN
    RETURN jsonb_build_object('verified', false, 'error', 'OTP already consumed');
  END IF;

  IF otp_record.expires_at < now() THEN
    RETURN jsonb_build_object('verified', false, 'error', 'OTP has expired');
  END IF;

  otp_plaintext_local := encode(digest(p_otp_plaintext, 'sha256'), 'hex');

  IF otp_record.otp_hash = otp_plaintext_local THEN
    UPDATE public.otp_verifications
    SET verified = TRUE
    WHERE id = otp_record.id;

    RETURN jsonb_build_object('verified', true, 'error', null);
  END IF;

  RETURN jsonb_build_object('verified', false, 'error', 'Invalid OTP');
END;
$$;

-- 4. Centralized triggers to enforce referral rules, expiry, and locks
CREATE OR REPLACE FUNCTION public.enforce_referral_state_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_hosp_id UUID;
BEGIN
  -- Determine current hospital ID for user (if role is hospital)
  IF public.has_role(auth.uid(), 'hospital') THEN
    SELECT id INTO current_hosp_id FROM public.hospitals WHERE user_id = auth.uid() LIMIT 1;
  END IF;

  -- Verify Expirations
  -- 1. Pending Referral Expiry (30 Days)
  IF OLD.status = 'pending_referral' AND OLD.created_at < now() - INTERVAL '30 days' THEN
    NEW.status := 'REFERRAL_EXPIRED';
  END IF;

  -- 2. Accepted Referral Expiry (24-48 Hours Service Submission Deadline)
  IF OLD.status = 'referral_accepted' AND OLD.updated_at < now() - INTERVAL '48 hours' AND NEW.status = 'pending_authorization' THEN
    NEW.status := 'ACCEPTED_REFERRAL_EXPIRED';
  END IF;

  -- Locked status check (REFERRAL EXPIRED / ACCEPTED REFERRAL EXPIRED)
  IF OLD.status IN ('REFERRAL_EXPIRED', 'ACCEPTED_REFERRAL_EXPIRED') THEN
    RAISE EXCEPTION 'This referral has expired and cannot be processed further.';
  END IF;

  -- Locked status check (REFERRAL DECLINED)
  IF OLD.status = 'referral_declined' THEN
    RAISE EXCEPTION 'Referral has been declined by this hospital. No updates or claims permitted.';
  END IF;

  -- Validate Ownership on Acceptance
  IF NEW.status = 'referral_accepted' AND OLD.status = 'referral_approved' THEN
    IF current_hosp_id IS NOT NULL AND OLD.referred_hospital_id IS DISTINCT FROM current_hosp_id THEN
      RAISE EXCEPTION 'Referral ownership mismatch: Current hospital is not assigned to this referral.';
    END IF;
  END IF;

  -- Lock on acceptance
  IF OLD.status = 'referral_accepted' AND NEW.referred_hospital_id IS DISTINCT FROM OLD.referred_hospital_id THEN
    RAISE EXCEPTION 'Once a referral is accepted, it is permanently locked and cannot be reassigned or accepted by another provider.';
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_referral_state_transitions ON public.authorization_requests;
CREATE TRIGGER trg_enforce_referral_state_transitions
  BEFORE UPDATE ON public.authorization_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_referral_state_transitions();

-- 5. Trigger for Single Active Referral Rule
CREATE OR REPLACE FUNCTION public.check_single_active_referral()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.referred_hospital_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 
      FROM public.authorization_requests
      WHERE policy_number = NEW.policy_number
        AND status IN ('pending_referral', 'referral_approved', 'referral_accepted', 'pending_authorization')
        AND id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'A patient case may only have one active referral at any time. An active referral already exists for this policy number.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_single_active_referral ON public.authorization_requests;
CREATE TRIGGER trg_check_single_active_referral
  BEFORE INSERT ON public.authorization_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.check_single_active_referral();

COMMIT;
