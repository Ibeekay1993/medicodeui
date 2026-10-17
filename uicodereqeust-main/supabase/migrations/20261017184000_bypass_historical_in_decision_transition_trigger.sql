-- Migration: 20261017184000_bypass_historical_in_decision_transition_trigger.sql
-- Description:
-- 1. Guard `protect_authorization_decision_transition` so historical imported authorisations
--    (is_historical = true or source = 'historical_import' or request_id LIKE 'REQ-HIST-%')
--    bypass live intake transition rules and tariff catalog price recalculation.
-- 2. Add legacy NHIA dental/procedure catalog codes to public.nhia_items (ON CONFLICT DO NOTHING).

BEGIN;

-- 1. Add historical/legacy procedure codes to nhia_items catalog
INSERT INTO public.nhia_items (code, name, category, amount)
VALUES
  ('NHIA-070-001', 'Scaling and Polishing (Routine)', 'procedure', 5000.0),
  ('NHIA-070-004', 'Simple Tooth Extraction', 'procedure', 4000.0),
  ('NHIA-070-006', 'Composite Restoration (Light Cure)', 'procedure', 6000.0),
  ('NHIA-070-008', 'Root Canal Treatment', 'procedure', 15000.0),
  ('NHIA-070-022', 'Removable Partial Denture', 'procedure', 25000.0),
  ('NHIA-870-022', 'Removable Partial Denture', 'procedure', 25000.0)
ON CONFLICT (code) DO NOTHING;

-- 2. Update protect_authorization_decision_transition trigger function
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

  -- If NOT unlocked for revision, block overwriting or reverting finalized decisions
  IF coalesce(OLD.is_unlocked, false) IS NOT TRUE THEN
    IF OLD.status IN ('approved', 'partially_approved', 'rejected', 'referral_approved')
       AND NEW.status IN ('approved', 'partially_approved', 'rejected', 'referral_approved')
       AND NEW.decided_at IS DISTINCT FROM OLD.decided_at THEN
      RAISE EXCEPTION 'A finalized authorization decision cannot be overwritten';
    END IF;

    IF OLD.status IN ('approved', 'partially_approved', 'rejected', 'referral_approved')
       AND NEW.status NOT IN ('approved', 'partially_approved', 'rejected', 'referral_approved', 'paid') THEN
      RAISE EXCEPTION 'A finalized authorization decision cannot be reverted';
    END IF;
  ELSE
    -- When the record was previously unlocked for revision, relock it upon decision update
    NEW.is_unlocked := false;
  END IF;

  -- Validate approval decision requirements
  IF NEW.status IN ('approved', 'partially_approved', 'referral_approved')
     AND (OLD.status IS DISTINCT FROM NEW.status OR coalesce(OLD.is_unlocked, false) IS TRUE) THEN
    IF NOT (
      public.has_role(auth.uid(), 'nurse')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'utilization_manager')
    ) THEN
      RAISE EXCEPTION 'Only authorized clinical staff can finalize an authorization decision';
    END IF;
    IF NEW.decided_at IS NULL OR NEW.decided_by IS NULL THEN
      RAISE EXCEPTION 'A decision timestamp and decision user are required';
    END IF;
    IF NEW.approved_by IS NULL
       OR coalesce(nullif(trim(NEW.authorization_code), ''), '') = '' THEN
      RAISE EXCEPTION 'Approved decisions require an approver and authorization code';
    END IF;
  END IF;

  -- Validate rejection decision requirements
  IF NEW.status = 'rejected'
     AND (OLD.status IS DISTINCT FROM NEW.status OR coalesce(OLD.is_unlocked, false) IS TRUE) THEN
    IF NOT (
      public.has_role(auth.uid(), 'nurse')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'utilization_manager')
    ) THEN
      RAISE EXCEPTION 'Only authorized clinical staff can finalize an authorization decision';
    END IF;
    IF NEW.decided_at IS NULL OR NEW.decided_by IS NULL
       OR coalesce(nullif(trim(NEW.decision_reason), ''), '') = '' THEN
      RAISE EXCEPTION 'Rejected decisions require a decision user, timestamp, and reason';
    END IF;
  END IF;

  -- The browser may submit quantities and codes, but never prices, names, or
  -- totals. Resolve every item against the server-owned tariff catalog.
  IF NEW.status IN ('approved', 'partially_approved', 'referral_approved')
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

COMMIT;
