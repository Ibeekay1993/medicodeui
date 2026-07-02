-- Align OTP expiration with the updated one-hour policy.
ALTER TABLE public.otp_verifications
  ALTER COLUMN expires_at SET DEFAULT now() + interval '1 hour';
