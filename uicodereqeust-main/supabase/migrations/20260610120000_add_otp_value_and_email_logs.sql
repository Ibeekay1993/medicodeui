BEGIN;

-- =============================================================================
-- Migration: Add OTP plaintext storage + Email logs for Resend integration
-- =============================================================================

-- 1. Add otp_value column to store encrypted OTP plaintext (for nurse display)
ALTER TABLE public.otp_verifications
  ADD COLUMN IF NOT EXISTS otp_value TEXT;

-- 2. Add email_logs table for delivery tracking
CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'brevo',
  recipient TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  response_id TEXT,
  error_message TEXT,
  authorization_id UUID REFERENCES public.authorization_requests(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON public.email_logs(recipient);
CREATE INDEX IF NOT EXISTS idx_email_logs_auth_id ON public.email_logs(authorization_id);

-- 3. RLS for email_logs (nurses, admins, claims can read)
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view email logs" ON public.email_logs;
CREATE POLICY "Staff can view email logs"
  ON public.email_logs FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'nurse') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'claims')
  );

DROP POLICY IF EXISTS "System can insert email logs" ON public.email_logs;
CREATE POLICY "System can insert email logs"
  ON public.email_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Add a get_otp_value function that returns plaintext OTP for authorized roles
CREATE OR REPLACE FUNCTION public.get_otp_value(p_request_id UUID)
RETURNS TABLE(otp_value TEXT, email TEXT, expires_at TIMESTAMPTZ, verified BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only nurses and admins can see OTP values
  IF NOT (
    public.has_role(auth.uid(), 'nurse') OR
    public.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: only nurses and administrators can view OTP values';
  END IF;

  RETURN QUERY
  SELECT
    ov.otp_value,
    ov.email,
    ov.expires_at,
    ov.verified
  FROM public.otp_verifications ov
  WHERE ov.authorization_id = p_request_id
  ORDER BY ov.created_at DESC
  LIMIT 1;
END;
$$;

COMMIT;