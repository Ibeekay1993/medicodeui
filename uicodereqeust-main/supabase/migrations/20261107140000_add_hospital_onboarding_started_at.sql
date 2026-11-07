-- Preserve the portal onboarding cutoff used to scope hospital-visible history.
-- NULL intentionally means onboarding has not been started; do not backfill
-- existing hospitals without an approved onboarding timestamp.
ALTER TABLE public.hospitals
  ADD COLUMN IF NOT EXISTS onboarding_started_at timestamptz;

COMMENT ON COLUMN public.hospitals.onboarding_started_at IS
  'Timestamp when this hospital portal was officially onboarded; NULL keeps its portal history hidden.';
