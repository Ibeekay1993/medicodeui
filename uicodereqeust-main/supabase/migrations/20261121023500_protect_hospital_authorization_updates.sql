-- ============================================================================
-- Protect Hospital Authorization Updates and Finalized Clinical Items
--
-- 1. Updates trigger trg_protect_authorization_decision_transition so it fires
--    on ALL column updates (BEFORE UPDATE ON authorization_requests), not just
--    on status updates.
-- 2. Prevents hospital accounts (role = 'hospital') from altering approved_items,
--    authorization_code, status, decision metadata, or total amounts.
-- 3. Enforces that approved treatment items and total amounts cannot be modified
--    on finalized authorizations unless explicitly unlocked (is_unlocked = true).
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.protect_authorization_decision_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  item JSONB;
  catalog RECORD;
  normalized JSONB;
  quantity NUMERIC;
  item_total NUMERIC;
BEGIN
  -- Guard: bypass transition and tariff catalog validation for historical imports
  IF coalesce(NEW.is_historical, false) IS TRUE
     OR coalesce(NEW.source, '') = 'historical_import'
     OR coalesce(NEW.request_id, '') LIKE 'REQ-HIST-%' THEN
    RETURN NEW;
  END IF;

  -- 1. Guard against Hospital User Tampering
  -- Hospital users cannot alter status, approval items, codes, or financials
  IF public.has_role(auth.uid(), 'hospital'::public.app_role) THEN
    -- If request is already decided, lock all decision & financial columns
    IF OLD.status IN ('approved', 'partially_approved', 'rejected', 'referral_approved') THEN
      NEW.status := OLD.status;
      NEW.approved_items := OLD.approved_items;
      NEW.total_amount := OLD.total_amount;
      NEW.authorization_code := OLD.authorization_code;
      NEW.decided_at := OLD.decided_at;
      NEW.decided_by := OLD.decided_by;
      NEW.approved_by := OLD.approved_by;
      NEW.decision_reason := OLD.decision_reason;
      NEW.clinical_notes := OLD.clinical_notes;
      NEW.is_unlocked := OLD.is_unlocked;
    ELSE
      -- On pending requests, hospital users cannot approve themselves or set approval codes
      IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'partially_approved', 'rejected', 'referral_approved') THEN
        RAISE EXCEPTION 'Hospitals cannot make authorization decisions' USING ERRCODE = '42501';
      END IF;
      NEW.approved_items := OLD.approved_items;
      NEW.authorization_code := OLD.authorization_code;
      NEW.decided_at := OLD.decided_at;
      NEW.decided_by := OLD.decided_by;
      NEW.approved_by := OLD.approved_by;
      NEW.is_unlocked := OLD.is_unlocked;
    END IF;
  END IF;

  -- 2. Guard Finalized Authorizations for all roles:
  -- Cannot modify approved_items, total_amount, or revert status unless unlocked for revision
  IF coalesce(OLD.is_unlocked, false) IS NOT TRUE THEN
    IF OLD.status IN ('approved', 'partially_approved', 'rejected', 'referral_approved') THEN
      IF NEW.approved_items IS DISTINCT FROM OLD.approved_items THEN
        RAISE EXCEPTION 'Approved treatment items cannot be modified unless the authorization is unlocked for revision';
      END IF;
      IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
        RAISE EXCEPTION 'Total authorization amount cannot be modified unless the authorization is unlocked for revision';
      END IF;
      IF NEW.status IN ('approved', 'partially_approved', 'rejected', 'referral_approved')
         AND NEW.decided_at IS DISTINCT FROM OLD.decided_at THEN
        RAISE EXCEPTION 'A finalized authorization decision cannot be overwritten';
      END IF;
      IF NEW.status NOT IN ('approved', 'partially_approved', 'rejected', 'referral_approved', 'paid') THEN
        RAISE EXCEPTION 'A finalized authorization decision cannot be reverted';
      END IF;
    END IF;
  ELSE
    -- When the record was previously unlocked for revision, relock it upon decision update
    NEW.is_unlocked := false;
  END IF;

  -- 3. Validate approval decision requirements
  IF NEW.status IN ('approved', 'partially_approved', 'referral_approved')
     AND (OLD.status IS DISTINCT FROM NEW.status OR coalesce(OLD.is_unlocked, false) IS TRUE) THEN
    IF NOT (
      public.has_role(auth.uid(), 'nurse')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'utilization_manager')
      OR public.has_role(auth.uid(), 'utilization_manager_lead')
    ) THEN
      RAISE EXCEPTION 'Only authorized clinical staff can finalize an authorization decision' USING ERRCODE = '42501';
    END IF;
    IF NEW.decided_at IS NULL OR NEW.decided_by IS NULL THEN
      RAISE EXCEPTION 'A decision timestamp and decision user are required';
    END IF;
    IF NEW.approved_by IS NULL
       OR coalesce(nullif(trim(NEW.authorization_code), ''), '') = '' THEN
      RAISE EXCEPTION 'Approved decisions require an approver and authorization code';
    END IF;
  END IF;

  -- 4. Validate rejection decision requirements
  IF NEW.status = 'rejected'
     AND (OLD.status IS DISTINCT FROM NEW.status OR coalesce(OLD.is_unlocked, false) IS TRUE) THEN
    IF NOT (
      public.has_role(auth.uid(), 'nurse')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'utilization_manager')
      OR public.has_role(auth.uid(), 'utilization_manager_lead')
    ) THEN
      RAISE EXCEPTION 'Only authorized clinical staff can finalize an authorization decision' USING ERRCODE = '42501';
    END IF;
    IF NEW.decided_at IS NULL OR NEW.decided_by IS NULL
       OR coalesce(nullif(trim(NEW.decision_reason), ''), '') = '' THEN
      RAISE EXCEPTION 'Rejected decisions require a decision user, timestamp, and reason';
    END IF;
  END IF;

  -- 5. Normalize items against tariff catalog when decision is made or unlocked
  IF NEW.status IN ('approved', 'partially_approved', 'referral_approved')
     AND (OLD.status IS DISTINCT FROM NEW.status OR coalesce(OLD.is_unlocked, false) IS TRUE)
     AND jsonb_typeof(NEW.approved_items) = 'array' THEN
    normalized := '[]'::jsonb;
    item_total := 0;
    FOR item IN SELECT value FROM jsonb_array_elements(NEW.approved_items)
    LOOP
      SELECT code, name, category, amount INTO catalog
      FROM public.nhia_items
      WHERE code = NULLIF(item->>'code', '')
      LIMIT 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Approved item is not a valid NHIA catalog item: %', item->>'code';
      END IF;
      quantity := greatest(1, coalesce((item->>'quantity')::numeric, 1));
      item_total := item_total + CASE
        WHEN coalesce((item->>'declined')::boolean, false) THEN 0
        ELSE catalog.amount * quantity
      END;
      normalized := normalized || jsonb_build_array(
        jsonb_build_object(
          'code', catalog.code, 'name', catalog.name, 'category', catalog.category,
          'unit_price', catalog.amount, 'quantity', quantity,
          'amount', catalog.amount * quantity,
          'declined', coalesce((item->>'declined')::boolean, false),
          'decline_reason', item->>'decline_reason',
          'frequency', item->>'frequency', 'duration', item->>'duration'
        )
      );
    END LOOP;
    NEW.approved_items := normalized;
    NEW.total_amount := round(item_total, 2);
  END IF;

  RETURN NEW;
END;
$func$;

-- Re-bind trigger to fire BEFORE UPDATE on ALL columns, not just status
DROP TRIGGER IF EXISTS trg_protect_authorization_decision_transition ON public.authorization_requests;
CREATE TRIGGER trg_protect_authorization_decision_transition
BEFORE UPDATE ON public.authorization_requests
FOR EACH ROW
EXECUTE FUNCTION public.protect_authorization_decision_transition();

COMMIT;
