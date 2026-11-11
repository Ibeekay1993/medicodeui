BEGIN;

-- Final approval amounts are derived from confirmed line quantities and the
-- active NHIA tariff. This is a database backstop for the review UI and older
-- clients; it does not rewrite or reconcile existing approved rows.
CREATE OR REPLACE FUNCTION public.validate_approved_authorization_amounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item jsonb;
  v_code text;
  v_declined boolean;
  v_quantity numeric;
  v_unit_price numeric;
  v_line_amount numeric;
  v_catalog_price numeric;
  v_calculated_line numeric;
  v_calculated_total numeric := 0;
  v_selected_count integer := 0;
  v_seen_codes text[] := ARRAY[]::text[];
BEGIN
  IF lower(NEW.status::text) NOT IN (
    'approved', 'partially_approved', 'authorization_approved', 'referral_approved'
  ) THEN
    RETURN NEW;
  END IF;

  -- The first referral approval stage may intentionally carry no priced
  -- treatment yet. Permit only that explicit empty, zero-value referral state.
  IF lower(NEW.status::text) = 'referral_approved'
     AND (NEW.approved_items IS NULL OR NEW.approved_items = '[]'::jsonb)
     AND coalesce(NEW.total_amount, 0) = 0 THEN
    RETURN NEW;
  END IF;

  -- Do not force old, untouched approvals to be reconstructed for harmless
  -- metadata updates. Any new decision or financial/cart edit is validated.
  IF TG_OP = 'UPDATE'
     AND lower(OLD.status::text) IN ('approved', 'partially_approved', 'authorization_approved')
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.approved_items IS NOT DISTINCT FROM OLD.approved_items
     AND NEW.total_amount IS NOT DISTINCT FROM OLD.total_amount THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.approved_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Approval requires itemized treatment lines with confirmed quantities and tariffs.'
      USING ERRCODE = '23514';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(NEW.approved_items)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Each approved treatment line must be a JSON object.'
        USING ERRCODE = '23514';
    END IF;

    IF v_item ? 'declined' AND jsonb_typeof(v_item->'declined') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Treatment line declined state must be true or false.'
        USING ERRCODE = '23514';
    END IF;
    v_declined := coalesce((v_item->>'declined')::boolean, false);
    IF v_declined THEN
      CONTINUE;
    END IF;

    v_selected_count := v_selected_count + 1;
    IF v_item->'quantity_requires_review' IS DISTINCT FROM 'false'::jsonb THEN
      RAISE EXCEPTION 'Confirm each treatment quantity from the request or prescription before approval.'
        USING ERRCODE = '23514';
    END IF;
    IF v_item->'price_requires_review' IS DISTINCT FROM 'false'::jsonb THEN
      RAISE EXCEPTION 'Confirm each treatment price against the NHIA tariff before approval.'
        USING ERRCODE = '23514';
    END IF;

    v_code := nullif(btrim(v_item->>'code'), '');
    IF v_code IS NULL THEN
      RAISE EXCEPTION 'Each approved treatment line must include an NHIA tariff code.'
        USING ERRCODE = '23514';
    END IF;
    IF v_code = ANY(v_seen_codes) THEN
      RAISE EXCEPTION 'Duplicate NHIA tariff codes are not allowed in one approval.'
        USING ERRCODE = '23514';
    END IF;
    v_seen_codes := array_append(v_seen_codes, v_code);

    IF jsonb_typeof(v_item->'quantity') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_item->'unit_price') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_item->'amount') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Approved treatment quantity, unit price, and line amount must be numeric.'
        USING ERRCODE = '23514';
    END IF;

    v_quantity := (v_item->>'quantity')::numeric;
    v_unit_price := (v_item->>'unit_price')::numeric;
    v_line_amount := (v_item->>'amount')::numeric;
    IF v_quantity <= 0 OR v_unit_price < 0 OR v_line_amount < 0 THEN
      RAISE EXCEPTION 'Approved quantities must be positive and prices cannot be negative.'
        USING ERRCODE = '23514';
    END IF;

    SELECT ni.amount
      INTO v_catalog_price
      FROM public.nhia_items AS ni
     WHERE ni.code = v_code
       AND ni.is_active IS TRUE
     LIMIT 1;
    IF NOT FOUND OR v_catalog_price IS NULL THEN
      RAISE EXCEPTION 'NHIA tariff code % is missing, inactive, or has no price.', v_code
        USING ERRCODE = '23514';
    END IF;
    IF round(v_unit_price, 2) IS DISTINCT FROM round(v_catalog_price, 2) THEN
      RAISE EXCEPTION 'Unit price for NHIA tariff code % does not match the active catalog.', v_code
        USING ERRCODE = '23514';
    END IF;

    v_calculated_line := round(v_unit_price * v_quantity, 2);
    IF round(v_line_amount, 2) IS DISTINCT FROM v_calculated_line THEN
      RAISE EXCEPTION 'Line amount for NHIA tariff code % must equal unit price multiplied by quantity.', v_code
        USING ERRCODE = '23514';
    END IF;
    v_calculated_total := v_calculated_total + v_calculated_line;
  END LOOP;

  IF v_selected_count = 0 THEN
    RAISE EXCEPTION 'Approval requires at least one selected treatment item.'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.total_amount IS NULL OR NEW.total_amount < 0
     OR round(NEW.total_amount, 2) IS DISTINCT FROM round(v_calculated_total, 2) THEN
    RAISE EXCEPTION 'Authorization total must equal the sum of approved treatment line amounts.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_approved_authorization_amounts()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS z_validate_approved_authorization_amounts
  ON public.authorization_requests;
CREATE TRIGGER z_validate_approved_authorization_amounts
  BEFORE INSERT OR UPDATE OF status, approved_items, total_amount
  ON public.authorization_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_approved_authorization_amounts();

COMMIT;
