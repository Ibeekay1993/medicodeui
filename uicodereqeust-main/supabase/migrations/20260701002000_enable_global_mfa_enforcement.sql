-- Enforce MFA globally by default so dashboard access requires setup or verification.
INSERT INTO public.global_policies (key, value)
VALUES ('enforce_mfa', '{"enforced": true}'::jsonb)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = now();
