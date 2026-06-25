BEGIN;

-- =============================================================================
-- Migration: Patient Email, OTP Verification, Policy Email Registry & Referral Status
-- Epic 2: OTP Verification for Referrals
-- Epic 3: Referral Claim Transfer Enforcement
-- Epic 6: Policy Email Registry (Fraud Prevention)
-- =============================================================================

-- 1. Add patient_email to authorization_requests
ALTER TABLE public.authorization_requests
  ADD COLUMN IF NOT EXISTS patient_email TEXT;

-- 2. Add referral_status for lifecycle tracking
ALTER TABLE public.authorization_requests
  ADD COLUMN IF NOT EXISTS referral_status TEXT
    DEFAULT 'none'
    CHECK (referral_status IN ('none', 'referred', 'transferred', 'closed'));

-- 3. OTP Verifications Table
CREATE TABLE IF NOT EXISTS public.otp_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_id UUID NOT NULL REFERENCES public.authorization_requests(id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '10 minutes',
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  viewed_by_nurse_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_otp_auth_id ON public.otp_verifications(authorization_id);

-- 4. Policy Email Registry (Fraud Control - Epic 6)
CREATE TABLE IF NOT EXISTS public.policy_email_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  family_policy_number TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email)
);

CREATE INDEX IF NOT EXISTS idx_policy_email ON public.policy_email_registry(email);

-- =============================================================================
-- RLS Policies
-- =============================================================================

-- OTP Verifications: Only nurses, admins, claims can see OTPs
ALTER TABLE public.otp_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Nurses and admins can view OTPs" ON public.otp_verifications;
CREATE POLICY "Nurses and admins can view OTPs"
  ON public.otp_verifications FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'nurse') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'claims')
  );

DROP POLICY IF EXISTS "Insert OTP" ON public.otp_verifications;
CREATE POLICY "Insert OTP"
  ON public.otp_verifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Policy Email Registry
ALTER TABLE public.policy_email_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read registry" ON public.policy_email_registry;
CREATE POLICY "Authenticated can read registry"
  ON public.policy_email_registry FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can insert registry" ON public.policy_email_registry;
CREATE POLICY "Authenticated can insert registry"
  ON public.policy_email_registry FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- =============================================================================
-- RPC: validate_policy_email - check email not used by another family
-- =============================================================================
CREATE OR REPLACE FUNCTION public.validate_policy_email(p_email TEXT, p_family_policy TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing RECORD;
BEGIN
  SELECT * INTO existing FROM public.policy_email_registry WHERE email = p_email;

  IF FOUND THEN
    IF existing.family_policy_number = p_family_policy THEN
      RETURN jsonb_build_object('allowed', true, 'reason', 'same_family');
    ELSE
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'This email address is already associated with another policy family.'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true);
END;
$$;

-- =============================================================================
-- RPC: get_otp_for_request - fetch OTP for a request (nurse/admin only)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_otp_for_request(p_request_id UUID)
RETURNS TABLE(
  otp_id UUID,
  otp_hash TEXT,
  email TEXT,
  expires_at TIMESTAMPTZ,
  verified BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only allow nurses, admins, claims to read OTPs
  IF NOT (
    public.has_role(auth.uid(), 'nurse') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'claims')
  ) THEN
    RAISE EXCEPTION 'Access denied: only nurses and administrators can view OTPs';
  END IF;

  -- Mark as viewed by nurse
  UPDATE public.otp_verifications
  SET viewed_by_nurse_at = COALESCE(viewed_by_nurse_at, now())
  WHERE authorization_id = p_request_id;

  RETURN QUERY
  SELECT
    ov.id AS otp_id,
    ov.otp_hash,
    ov.email,
    ov.expires_at,
    ov.verified,
    ov.created_at
  FROM public.otp_verifications ov
  WHERE ov.authorization_id = p_request_id
  ORDER BY ov.created_at DESC
  LIMIT 1;
END;
$$;

-- =============================================================================
-- RPC: verify_otp - mark OTP as verified by matching plaintext
-- =============================================================================
CREATE OR REPLACE FUNCTION public.verify_otp(p_request_id UUID, p_otp_plaintext TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  otp_record RECORD;
  otp_plaintext_local TEXT;
BEGIN
  -- Only nurses, admins, claims can verify OTPs
  IF NOT (
    public.has_role(auth.uid(), 'nurse') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'claims')
  ) THEN
    RETURN jsonb_build_object('verified', false, 'error', 'Access denied');
  END IF;

  -- Get the latest OTP for this request
  SELECT * INTO otp_record
  FROM public.otp_verifications
  WHERE authorization_id = p_request_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('verified', false, 'error', 'No OTP found for this request');
  END IF;

  IF otp_record.verified THEN
    RETURN jsonb_build_object('verified', true, 'error', null, 'message', 'OTP already verified');
  END IF;

  IF otp_record.expires_at < now() THEN
    RETURN jsonb_build_object('verified', false, 'error', 'OTP has expired');
  END IF;

  -- Compare using SHA-256
  otp_plaintext_local := encode(digest(p_otp_plaintext, 'sha256'), 'hex');

  IF otp_record.otp_hash = otp_plaintext_local THEN
    UPDATE public.otp_verifications
    SET verified = TRUE
    WHERE id = otp_record.id;

    RETURN jsonb_build_object('verified', true, 'error', null);
  ELSE
    RETURN jsonb_build_object('verified', false, 'error', 'Invalid OTP');
  END IF;
END;
$$;

-- =============================================================================
-- RPC: transfer_referral - mark request as transferred after approval
-- =============================================================================
CREATE OR REPLACE FUNCTION public.transfer_referral(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  req RECORD;
BEGIN
  SELECT * INTO req FROM public.authorization_requests WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF req.status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only approved requests can be transferred');
  END IF;

  IF req.referred_hospital_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No receiving hospital specified');
  END IF;

  UPDATE public.authorization_requests
  SET referral_status = 'transferred'
  WHERE id = p_request_id;

  -- Log audit event
  INSERT INTO public.audit_logs (action, user_id, details, severity)
  VALUES (
    'referral_transferred',
    auth.uid(),
    jsonb_build_object(
      'request_id', p_request_id,
      'patient_name', req.patient_name,
      'referred_hospital_id', req.referred_hospital_id,
      'referred_hospital_name', req.referred_hospital_name
    ),
    'info'
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- =============================================================================
-- RPC: create_audit_log - centralized audit logging
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_audit_log(
  p_action TEXT,
  p_details JSONB DEFAULT '{}'::jsonb,
  p_severity TEXT DEFAULT 'info'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO public.audit_logs (action, user_id, details, severity)
  VALUES (p_action, auth.uid(), p_details, p_severity)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- =============================================================================
-- RLS: Add referral_status check to hospital_claims INSERT policy
-- Drop and recreate the policy to block claims after referral transfer
-- =============================================================================
DROP POLICY IF EXISTS "Hospitals can create own claims" ON public.hospital_claims;
CREATE POLICY "Hospitals can create own claims"
  ON public.hospital_claims
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'hospital')
    AND created_by = auth.uid()
    AND status = 'draft'
    AND hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
    AND hospital_name = (
      SELECT h.name
      FROM public.hospitals h
      WHERE h.id = hospital_id
    )
    AND request_id IN (
      SELECT ar.id
      FROM public.authorization_requests ar
      WHERE ar.status = 'approved'
        AND COALESCE(ar.referral_status, 'none') != 'transferred'
        AND COALESCE(ar.claiming_hospital_id, ar.referred_hospital_id, ar.hospital_id) IN (
          SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid()
        )
        AND COALESCE(ar.claiming_hospital_id, ar.referred_hospital_id, ar.hospital_id) = hospital_id
    )
  );

COMMIT;