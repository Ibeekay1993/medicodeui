-- Disable dashboard MFA enforcement gate (MFA remains available at login and in Settings)
BEGIN;

INSERT INTO public.global_policies (key, value)
VALUES ('enforce_mfa', '{"enforced": false}'::jsonb)
ON CONFLICT (key) DO UPDATE
SET value = '{"enforced": false}'::jsonb;

COMMIT;
