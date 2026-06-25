-- Migration: backfill_onboarding_completed
BEGIN;

-- Backfill onboarding_completed = true and invite_status = 'completed' for users who have already signed in
UPDATE public.user_roles
SET 
  onboarding_completed = true,
  invite_status = 'completed'
WHERE last_sign_in IS NOT NULL;

COMMIT;
