-- ─────────────────────────────────────────────────────────
-- Deny hospital users delete and update access on authorization_requests
-- to ensure they cannot delete, edit, or tamper with authorizations.
-- ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Hospitals can delete their own requests" ON public.authorization_requests;
DROP POLICY IF EXISTS "Hospitals can update their own requests" ON public.authorization_requests;
