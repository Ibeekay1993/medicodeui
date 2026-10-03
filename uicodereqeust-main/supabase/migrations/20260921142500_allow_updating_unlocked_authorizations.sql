-- Allow updating and revising authorization decisions when the request has been unlocked for revision (is_unlocked = true).

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