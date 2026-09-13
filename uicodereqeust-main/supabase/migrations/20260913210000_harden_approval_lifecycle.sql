-- Approval lifecycle hardening:
-- * partially approved authorizations may be claimed;
-- * claim creation and authorization claiming are one transaction;
-- * finalized decisions cannot be stale-overwritten and their item totals are
--   derived from the protected NHIA catalog;
-- * referral approvals use the same durable WhatsApp notification path.

BEGIN;

CREATE OR REPLACE FUNCTION public.protect_authorization_decision_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item JSONB;
  catalog RECORD;
  normalized JSONB;
  quantity NUMERIC;
  item_total NUMERIC;
BEGIN
  IF OLD.status IN ('approved', 'partially_approved', 'rejected', 'referral_approved')
     AND NEW.status IN ('approved', 'partially_approved', 'rejected', 'referral_approved')
     AND NEW.decided_at IS DISTINCT FROM OLD.decided_at THEN
    RAISE EXCEPTION 'A finalized authorization decision cannot be overwritten';
  END IF;

  IF NEW.status IN ('approved', 'partially_approved', 'referral_approved')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin')) THEN
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

  IF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin')) THEN
      RAISE EXCEPTION 'Only authorized clinical staff can finalize an authorization decision';
    END IF;
    IF NEW.decided_at IS NULL OR NEW.decided_by IS NULL
       OR coalesce(nullif(trim(NEW.decision_reason), ''), '') = '' THEN
      RAISE EXCEPTION 'Rejected decisions require a decision user, timestamp, and reason';
    END IF;
  END IF;

  IF OLD.status IN ('approved', 'partially_approved', 'rejected', 'referral_approved')
     AND NEW.status NOT IN ('approved', 'partially_approved', 'rejected', 'referral_approved', 'paid') THEN
    RAISE EXCEPTION 'A finalized authorization decision cannot be reverted';
  END IF;

  -- The browser may submit quantities and codes, but never prices, names, or
  -- totals.  Resolve every item against the server-owned tariff catalog.
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
$$;

DROP TRIGGER IF EXISTS protect_authorization_decision_transition
ON public.authorization_requests;

CREATE TRIGGER protect_authorization_decision_transition
BEFORE UPDATE OF status, approved_items, total_amount, authorization_code, decided_at
ON public.authorization_requests
FOR EACH ROW
EXECUTE FUNCTION public.protect_authorization_decision_transition();

CREATE OR REPLACE FUNCTION public.fn_enqueue_whatsapp_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status IN ('approved', 'partially_approved', 'referral_approved', 'rejected')
     AND NEW.decided_at IS NOT NULL AND NEW.decided_by IS NOT NULL
     AND (NEW.status = 'rejected' OR (NEW.approved_by IS NOT NULL
          AND coalesce(nullif(trim(NEW.authorization_code), ''), '') <> '')) THEN
    INSERT INTO public.whatsapp_notifications
      (authorization_request_id, phone_number, notification_type, status)
    VALUES (
      NEW.id,
      (SELECT phone_number FROM public.whatsapp_messages
       WHERE authorization_request_id = NEW.id ORDER BY received_at ASC LIMIT 1),
      CASE WHEN NEW.status = 'rejected' THEN 'REJECTION' ELSE 'APPROVAL' END,
      'pending'
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_submit_authorization_claim(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  auth_row RECORD;
  hospital RECORD;
  claim_row RECORD;
  item JSONB;
  claim_items JSONB := '[]'::jsonb;
  approved_for TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'hospital') THEN
    RAISE EXCEPTION 'Only hospital users can submit claims';
  END IF;
  SELECT id, name INTO hospital FROM public.hospitals
  WHERE user_id = auth.uid() AND is_active IS DISTINCT FROM false LIMIT 1;
  IF hospital.id IS NULL THEN RAISE EXCEPTION 'Hospital profile not found'; END IF;

  SELECT * INTO auth_row FROM public.authorization_requests
  WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Authorization not found'; END IF;
  IF auth_row.status NOT IN ('approved', 'partially_approved') THEN
    RAISE EXCEPTION 'Authorization is not approved';
  END IF;
  IF coalesce(auth_row.claiming_hospital_id, auth_row.referred_hospital_id, auth_row.hospital_id) <> hospital.id THEN
    RAISE EXCEPTION 'Only the assigned treating hospital can submit this claim';
  END IF;
  IF auth_row.authorization_code IS NULL THEN RAISE EXCEPTION 'Approved authorization code is missing'; END IF;

  SELECT * INTO claim_row FROM public.hospital_claims WHERE request_id = auth_row.id FOR UPDATE;
  IF FOUND THEN RAISE EXCEPTION 'Claim already exists: %', claim_row.claim_number; END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(auth_row.approved_items, '[]'::jsonb))
  LOOP
    IF NOT coalesce((item->>'declined')::boolean, false) THEN
      claim_items := claim_items || jsonb_build_array(item);
    END IF;
  END LOOP;
  SELECT string_agg(coalesce(value->>'code', 'NHIA') || ' - ' || coalesce(value->>'name', 'Approved item'), '; ')
    INTO approved_for FROM jsonb_array_elements(claim_items);

  INSERT INTO public.hospital_claims (
    hospital_id, hospital_name, request_id, claim_number, auth_code, patient_name,
    policy_number, diagnosis, approved_for, approved_items, requesting_hospital_id,
    requesting_hospital_name, referring_hospital_id, referring_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id,
    claiming_hospital_name, status, submitted_at, notes, created_by
  ) VALUES (
    hospital.id, hospital.name, auth_row.id,
    'CLM-' || to_char(now(), 'DDMMYY') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 4)),
    auth_row.authorization_code, auth_row.patient_name, auth_row.policy_number,
    coalesce(auth_row.diagnosis, 'No diagnosis'), coalesce(approved_for, auth_row.treatment),
    claim_items, auth_row.requesting_hospital_id, auth_row.requesting_hospital_name,
    auth_row.referring_hospital_id, auth_row.referring_hospital_name,
    auth_row.referred_hospital_id, auth_row.referred_hospital_name,
    hospital.id, hospital.name, 'submitted', now(), '', auth.uid()
  ) RETURNING * INTO claim_row;

  IF jsonb_array_length(claim_items) > 0 THEN
    INSERT INTO public.hospital_claim_lines (claim_id, description, code, units, charge)
    SELECT claim_row.id, value->>'name', value->>'code',
      greatest(1, coalesce((value->>'quantity')::numeric, 1)),
      coalesce((value->>'unit_price')::numeric, 0)
    FROM jsonb_array_elements(claim_items);
  ELSE
    INSERT INTO public.hospital_claim_lines (claim_id, description, code, units, charge)
    VALUES (claim_row.id, coalesce(auth_row.approved_tariff_name, auth_row.treatment, 'Approved service'),
      coalesce(auth_row.approved_tariff_code, auth_row.authorization_code),
      1, coalesce(auth_row.approved_tariff_amount, auth_row.total_amount, 0));
  END IF;

  UPDATE public.authorization_requests
  SET claimed = true, claim_status = 'submitted', updated_at = now()
  WHERE id = auth_row.id;

  RETURN jsonb_build_object('claim_id', claim_row.id, 'claim_number', claim_row.claim_number, 'status', 'submitted');
END;
$$;

REVOKE ALL ON FUNCTION public.fn_submit_authorization_claim(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_submit_authorization_claim(UUID) TO authenticated;

COMMIT;
