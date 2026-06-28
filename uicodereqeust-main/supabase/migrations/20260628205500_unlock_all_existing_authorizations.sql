-- Unlock all existing authorization requests so hospitals are not blocked on old requests.
-- The OTP requirement will only enforce the lock on newly created requests moving forward.
ALTER TABLE public.authorization_requests DISABLE TRIGGER trg_check_single_active_referral;

UPDATE public.authorization_requests
SET is_unlocked = true
WHERE is_unlocked = false OR is_unlocked IS NULL;

ALTER TABLE public.authorization_requests ENABLE TRIGGER trg_check_single_active_referral;
