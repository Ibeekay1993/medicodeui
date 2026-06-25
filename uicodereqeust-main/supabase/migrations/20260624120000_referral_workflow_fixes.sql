BEGIN;

-- =============================================================================
-- Migration: Referral Workflow Fixes
-- Fixes:
--   1. enforce_referral_state_transitions: add pending_referral → referral_approved
--      as an explicitly allowed transition (prevents trigger from blocking it)
--   2. check_single_active_referral: fire on UPDATE too (not just INSERT)
--      so a referral assigned after creation is also uniqueness-checked
--   3. Backfill: for any existing pending_referral records where
--      referred_hospital_id is set but claiming_hospital_id is null, set it
--   4. Add referral_visibility function: used for audit trail checks
-- =============================================================================

-- 1. Replace the enforce_referral_state_transitions trigger function
--    to explicitly allow pending_referral → referral_approved transitions
--    and to handle NULL current_hosp_id gracefully for nurse/admin roles.
CREATE OR REPLACE FUNCTION public.enforce_referral_state_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_hosp_id UUID;
BEGIN
  -- Determine current hospital ID for user (only applies to hospital role)
  IF public.has_role(auth.uid(), 'hospital') THEN
    SELECT id INTO current_hosp_id FROM public.hospitals WHERE user_id = auth.uid() LIMIT 1;
  END IF;

  -- ── Expiry Checks ─────────────────────────────────────────────────────────

  -- 1. Pending Referral Expiry (30 Days)
  IF OLD.status = 'pending_referral' AND OLD.created_at < now() - INTERVAL '30 days' THEN
    NEW.status := 'referral_expired';
  END IF;

  -- 2. Accepted Referral Expiry (48 Hours service submission deadline)
  IF OLD.status = 'referral_accepted'
     AND OLD.updated_at < now() - INTERVAL '48 hours'
     AND NEW.status = 'pending_authorization' THEN
    NEW.status := 'accepted_referral_expired';
  END IF;

  -- ── Locked Status Guards ──────────────────────────────────────────────────

  IF OLD.status IN ('referral_expired', 'REFERRAL_EXPIRED', 'accepted_referral_expired', 'ACCEPTED_REFERRAL_EXPIRED') THEN
    RAISE EXCEPTION 'This referral has expired and cannot be processed further.';
  END IF;

  IF OLD.status IN ('referral_declined', 'REFERRAL_DECLINED') THEN
    RAISE EXCEPTION 'Referral has been declined. No further updates or claims permitted.';
  END IF;

  -- ── Allowed Transition: pending_referral → referral_approved ─────────────
  -- This transition is performed by the insurer/nurse (not hospital role).
  -- Allow it unconditionally when the actor has nurse/admin/claims role.
  IF OLD.status = 'pending_referral' AND NEW.status = 'referral_approved' THEN
    -- Allowed — no restrictions for insurer approval
    NEW.updated_at = now();
    RETURN NEW;
  END IF;

  -- ── Allowed Transition: pending → referral_approved ──────────────────────
  IF OLD.status = 'pending' AND NEW.status = 'referral_approved' THEN
    NEW.updated_at = now();
    RETURN NEW;
  END IF;

  -- ── Ownership Validation: referral_approved → referral_accepted ──────────
  -- Hospital B must be the assigned receiving hospital to accept.
  IF NEW.status = 'referral_accepted' AND OLD.status = 'referral_approved' THEN
    IF current_hosp_id IS NOT NULL
       AND OLD.referred_hospital_id IS NOT NULL
       AND OLD.referred_hospital_id IS DISTINCT FROM current_hosp_id THEN
      RAISE EXCEPTION 'Referral ownership mismatch: your hospital is not the assigned receiving hospital for this referral.';
    END IF;
  END IF;

  -- ── Lock on Acceptance ────────────────────────────────────────────────────
  -- Once accepted, the referred_hospital_id cannot be changed.
  IF OLD.status = 'referral_accepted'
     AND NEW.referred_hospital_id IS DISTINCT FROM OLD.referred_hospital_id THEN
    RAISE EXCEPTION 'Once a referral is accepted it is permanently locked — the receiving hospital cannot be changed.';
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Re-create trigger (drop first to avoid duplicate)
DROP TRIGGER IF EXISTS trg_enforce_referral_state_transitions ON public.authorization_requests;
CREATE TRIGGER trg_enforce_referral_state_transitions
  BEFORE UPDATE ON public.authorization_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_referral_state_transitions();


-- =============================================================================
-- 2. Also fire single-active-referral check on UPDATE
--    (covers the case where a referral hospital is assigned after creation)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.check_single_active_referral()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.referred_hospital_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.authorization_requests
      WHERE policy_number = NEW.policy_number
        AND status IN (
          'pending_referral', 'referral_approved',
          'referral_accepted', 'pending_authorization'
        )
        AND id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'A patient case may only have one active referral at any time. An active referral already exists for this policy number.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_single_active_referral ON public.authorization_requests;
CREATE TRIGGER trg_check_single_active_referral
  BEFORE INSERT OR UPDATE ON public.authorization_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.check_single_active_referral();


-- =============================================================================
-- 3. Backfill: for existing pending_referral records where claiming_hospital_id
--    is NULL but referred_hospital_id is set, fix claiming_hospital_id.
--    This ensures old records surface in Hospital B's queue immediately.
-- =============================================================================
UPDATE public.authorization_requests
SET
  claiming_hospital_id   = COALESCE(claiming_hospital_id,   referred_hospital_id),
  claiming_hospital_name = COALESCE(claiming_hospital_name, referred_hospital_name),
  requesting_hospital_id   = COALESCE(requesting_hospital_id,   hospital_id),
  requesting_hospital_name = COALESCE(requesting_hospital_name, hospital_name),
  referring_hospital_id    = COALESCE(referring_hospital_id,    hospital_id),
  referring_hospital_name  = COALESCE(referring_hospital_name,  hospital_name),
  updated_at = now()
WHERE
  status IN ('pending_referral', 'referral_approved', 'referral_accepted')
  AND referred_hospital_id IS NOT NULL
  AND (
    claiming_hospital_id IS NULL
    OR requesting_hospital_id IS NULL
    OR referring_hospital_id IS NULL
  );


-- =============================================================================
-- 4. Referral audit helper: get_referral_visibility_log
--    Returns a quick summary of a request's referral assignment chain.
--    Use this in the Supabase dashboard to debug visibility issues.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_referral_visibility_log(p_request_id UUID)
RETURNS TABLE(
  field       TEXT,
  value       TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'nurse') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'claims')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT col, val FROM (
    SELECT 'status'::TEXT                   AS col, status::TEXT                               AS val FROM public.authorization_requests WHERE id = p_request_id
    UNION ALL
    SELECT 'hospital_id',                   hospital_id::TEXT                                         FROM public.authorization_requests WHERE id = p_request_id
    UNION ALL
    SELECT 'hospital_name',                 hospital_name                                             FROM public.authorization_requests WHERE id = p_request_id
    UNION ALL
    SELECT 'requesting_hospital_id',        requesting_hospital_id::TEXT                              FROM public.authorization_requests WHERE id = p_request_id
    UNION ALL
    SELECT 'requesting_hospital_name',      requesting_hospital_name                                  FROM public.authorization_requests WHERE id = p_request_id
    UNION ALL
    SELECT 'referring_hospital_id',         referring_hospital_id::TEXT                               FROM public.authorization_requests WHERE id = p_request_id
    UNION ALL
    SELECT 'referring_hospital_name',       referring_hospital_name                                   FROM public.authorization_requests WHERE id = p_request_id
    UNION ALL
    SELECT 'referred_hospital_id',          referred_hospital_id::TEXT                                FROM public.authorization_requests WHERE id = p_request_id
    UNION ALL
    SELECT 'referred_hospital_name',        referred_hospital_name                                    FROM public.authorization_requests WHERE id = p_request_id
    UNION ALL
    SELECT 'claiming_hospital_id',          claiming_hospital_id::TEXT                                FROM public.authorization_requests WHERE id = p_request_id
    UNION ALL
    SELECT 'claiming_hospital_name',        claiming_hospital_name                                    FROM public.authorization_requests WHERE id = p_request_id
  ) sub;
END;
$$;


-- =============================================================================
-- 5. RLS: ensure Hospital Data Isolation policy covers all referral statuses.
--    Drop and recreate to guarantee the policy is current.
-- =============================================================================
DROP POLICY IF EXISTS "Hospital Data Isolation - View" ON public.authorization_requests;
CREATE POLICY "Hospital Data Isolation - View"
  ON public.authorization_requests FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'nurse') OR
    public.has_role(auth.uid(), 'claims') OR
    (
      public.has_role(auth.uid(), 'hospital') AND (
        submitted_by = auth.uid() OR
        hospital_id            IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid()) OR
        requesting_hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid()) OR
        referring_hospital_id  IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid()) OR
        referred_hospital_id   IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid()) OR
        claiming_hospital_id   IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
      )
    )
  );

COMMIT;
