BEGIN;
ALTER TABLE public.otp_verifications ALTER COLUMN expires_at SET DEFAULT now() + interval '30 days';
UPDATE public.otp_verifications SET expires_at = created_at + interval '30 days' WHERE consumed_at IS NULL;
COMMIT;
