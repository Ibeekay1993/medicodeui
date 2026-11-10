BEGIN;

-- A claim must be created through the server-side authorization RPC. The
-- authenticated INSERT fallback in older clients allowed client-owned values
-- to reach the ledger and masked RPC failures.
DROP POLICY IF EXISTS "Hospitals can create own claims" ON public.hospital_claims;
REVOKE INSERT ON TABLE public.hospital_claims FROM PUBLIC, anon, authenticated;

-- Keep the database uniqueness backstop even if an earlier environment missed
-- the original index migration. This index is keyed to one authorization
-- request, not a policy number shared by a family.
CREATE UNIQUE INDEX IF NOT EXISTS hospital_claims_request_id_key
  ON public.hospital_claims(request_id);

-- Authorization codes also identify one approved service authorization. If
-- legacy duplicate codes exist, this fails safely and requires reconciliation.
CREATE UNIQUE INDEX IF NOT EXISTS hospital_claims_auth_code_key
  ON public.hospital_claims (lower(btrim(auth_code)))
  WHERE auth_code IS NOT NULL AND btrim(auth_code) <> '';

-- Existing code zeroed financial values on every insert. Inserts are now
-- authoritative only through rpc_submit_new_hospital_claim; protect money and
-- audit details from direct authenticated UPDATEs instead.
CREATE OR REPLACE FUNCTION public.protect_hospital_claims_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claim_financial_rpc BOOLEAN :=
    current_setting('medcode.claim_financial_rpc', true) = 'true';
  v_claim_contest_rpc BOOLEAN :=
    current_setting('medcode.claim_contest_rpc', true) = 'true';
  v_claim_unlock_rpc BOOLEAN :=
    current_setting('medcode.claim_unlock_rpc', true) = 'true';
  v_payment_settlement_rpc BOOLEAN :=
    current_setting('medcode.payment_settlement_rpc', true) = 'true';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF public.has_role(auth.uid(), 'hospital'::public.app_role)
       AND NOT (v_claim_financial_rpc OR v_claim_unlock_rpc) THEN
      NEW.total_amount := OLD.total_amount;
      NEW.original_amount := OLD.original_amount;
      NEW.approved_amount := OLD.approved_amount;
      NEW.declined_amount := OLD.declined_amount;
      NEW.approved_items := OLD.approved_items;
      NEW.audit_items := OLD.audit_items;
      NEW.line_items := OLD.line_items;
      NEW.payment_status := OLD.payment_status;
      NEW.payment_batch_id := OLD.payment_batch_id;
      IF NOT (v_claim_contest_rpc OR v_claim_unlock_rpc) THEN
        NEW.status := OLD.status;
        NEW.under_contest_amount := OLD.under_contest_amount;
        NEW.audit_summary := OLD.audit_summary;
      END IF;
    ELSIF auth.uid() IS NOT NULL AND NOT v_claim_financial_rpc AND (
      NEW.total_amount IS DISTINCT FROM OLD.total_amount OR
      NEW.original_amount IS DISTINCT FROM OLD.original_amount OR
      NEW.approved_amount IS DISTINCT FROM OLD.approved_amount OR
      NEW.declined_amount IS DISTINCT FROM OLD.declined_amount OR
      NEW.approved_items IS DISTINCT FROM OLD.approved_items OR
      NEW.audit_items IS DISTINCT FROM OLD.audit_items OR
      NEW.line_items IS DISTINCT FROM OLD.line_items OR
      NEW.audit_summary IS DISTINCT FROM OLD.audit_summary
    ) THEN
      RAISE EXCEPTION 'Claim financial and audit values must be changed through the authorized claim RPC.'
        USING ERRCODE = '42501';
    END IF;

    IF auth.uid() IS NOT NULL
       AND NEW.status IS DISTINCT FROM OLD.status
       AND NOT (v_claim_financial_rpc OR v_claim_unlock_rpc OR v_claim_contest_rpc) THEN
      RAISE EXCEPTION 'Claim status must be changed through an authorized workflow RPC.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.payment_status = 'paid'
       AND OLD.payment_status IS DISTINCT FROM 'paid'
       AND NOT v_payment_settlement_rpc THEN
      RAISE EXCEPTION 'Claims can only be marked paid by transactional batch settlement.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Contests are accepted only through the ownership/deadline-checked RPC.
DROP POLICY IF EXISTS "Hospitals can contest audited claims" ON public.hospital_claims;

-- Preserve the existing claim transition rules while allowing only the two
-- audited workflow RPCs to perform their explicitly permitted exceptions.
CREATE OR REPLACE FUNCTION public.set_hospital_claims_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contest_rpc BOOLEAN := current_setting('medcode.claim_contest_rpc', true) = 'true';
  v_unlock_rpc BOOLEAN := current_setting('medcode.claim_unlock_rpc', true) = 'true';
BEGIN
  NEW.updated_at := now();

  IF NEW.hospital_id IS DISTINCT FROM OLD.hospital_id
     OR NEW.request_id IS DISTINCT FROM OLD.request_id
     OR NEW.auth_code IS DISTINCT FROM OLD.auth_code
     OR NEW.patient_name IS DISTINCT FROM OLD.patient_name
     OR NEW.policy_number IS DISTINCT FROM OLD.policy_number
     OR NEW.diagnosis IS DISTINCT FROM OLD.diagnosis
     OR NEW.approved_for IS DISTINCT FROM OLD.approved_for
     OR NEW.claim_number IS DISTINCT FROM OLD.claim_number
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Core claim fields cannot be changed.' USING ERRCODE = '42501';
  END IF;

  IF OLD.status <> 'draft' AND NOT (
       public.has_role(auth.uid(), 'claims'::public.app_role)
       OR public.has_role(auth.uid(), 'claims_lead'::public.app_role)
       OR public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'finance'::public.app_role)
       OR v_contest_rpc OR v_unlock_rpc
     ) THEN
    RAISE EXCEPTION 'Claim is locked after submission.' USING ERRCODE = '42501';
  END IF;

  IF OLD.status <> 'draft' AND NOT (v_contest_rpc OR v_unlock_rpc)
     AND (public.has_role(auth.uid(), 'claims'::public.app_role)
       OR public.has_role(auth.uid(), 'claims_lead'::public.app_role)
       OR public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'finance'::public.app_role)) THEN
    IF OLD.status = 'submitted' AND NEW.status NOT IN ('submitted', 'under_review', 'approved', 'rejected', 'partially_approved') THEN
      RAISE EXCEPTION 'Submitted claims can only be investigated, approved, partially approved, or rejected.';
    ELSIF OLD.status = 'under_review' AND NEW.status NOT IN ('under_review', 'approved', 'rejected', 'partially_approved') THEN
      RAISE EXCEPTION 'Investigated claims can only be approved, partially approved, or rejected.';
    ELSIF OLD.status IN ('approved', 'partially_approved') AND NEW.status NOT IN ('approved', 'partially_approved', 'rejected', 'contested') THEN
      RAISE EXCEPTION 'Approved claims can only be contested or re-audited through the workflow.';
    END IF;

    IF OLD.status IN ('approved', 'partially_approved')
       AND (NEW.total_amount IS DISTINCT FROM OLD.total_amount
         OR NEW.approved_items IS DISTINCT FROM OLD.approved_items) THEN
      RAISE EXCEPTION 'Claims team cannot alter approved billing items or totals.';
    END IF;

    IF NEW.status IN ('approved', 'partially_approved') AND OLD.status NOT IN ('approved', 'partially_approved') THEN
      NEW.approved_by := auth.uid();
      NEW.approved_at := now();
    END IF;
    IF NEW.status = 'paid' AND OLD.status <> 'paid' THEN
      IF OLD.status NOT IN ('approved', 'partially_approved') THEN
        RAISE EXCEPTION 'Only approved claims can be paid.';
      END IF;
      NEW.paid_by := auth.uid();
      NEW.paid_at := now();
    END IF;
    IF NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
      RAISE EXCEPTION 'Submitted timestamp cannot be changed.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Auditing is a server-side calculation. Client-supplied total/original/
-- declined values are ignored. The authoritative authorization amount is the
-- ceiling, and item decisions must map positionally to the authorized cart.
CREATE OR REPLACE FUNCTION public.rpc_update_claim_status(
  p_claim_id UUID,
  p_status TEXT,
  p_details JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role TEXT;
  v_claim public.hospital_claims%ROWTYPE;
  v_auth public.authorization_requests%ROWTYPE;
  v_original_amount NUMERIC(14,2);
  v_approved_amount NUMERIC(14,2);
  v_declined_amount NUMERIC(14,2);
  v_items_total NUMERIC(14,2) := 0;
  v_auth_item JSONB;
  v_audit_item JSONB;
  v_auth_item_count INTEGER := 0;
  v_audit_item_count INTEGER := 0;
  v_approved_item_count INTEGER := 0;
  v_declined_item_count INTEGER := 0;
  v_index INTEGER;
  v_auth_code TEXT;
  v_audit_code TEXT;
  v_auth_quantity NUMERIC(12,2);
  v_audit_quantity NUMERIC(12,2);
  v_auth_unit_price NUMERIC(12,2);
  v_audit_unit_price NUMERIC(12,2);
  v_line_total NUMERIC(14,2);
  v_declined BOOLEAN;
  v_audit_summary JSONB;
  v_previous_guard TEXT;
  v_contest_deadline TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL OR NOT (
    public.has_role(v_user_id, 'admin'::public.app_role) OR
    public.has_role(v_user_id, 'claims'::public.app_role) OR
    public.has_role(v_user_id, 'claims_lead'::public.app_role) OR
    public.has_role(v_user_id, 'finance'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only admin, claims, or finance officers can update claim status.'
      USING ERRCODE = '42501';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('approved', 'partially_approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid claim decision status.' USING ERRCODE = '22023';
  END IF;
  IF p_details IS NULL OR jsonb_typeof(p_details) <> 'object'
     OR octet_length(p_details::TEXT) > 262144 THEN
    RAISE EXCEPTION 'Claim audit details are missing, invalid, or too large.'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_details->'approved_amount') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'A numeric audited approved amount is required.'
      USING ERRCODE = '22023';
  END IF;
  IF p_details ? 'audit_items' AND jsonb_typeof(p_details->'audit_items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Audited claim items must be an array.' USING ERRCODE = '22023';
  END IF;
  IF p_details ? 'line_items' AND jsonb_typeof(p_details->'line_items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Claim line items must be an array.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_claim
  FROM public.hospital_claims
  WHERE id = p_claim_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim not found.' USING ERRCODE = 'P0002';
  END IF;
  IF lower(coalesce(v_claim.status, '')) = 'paid'
     OR lower(coalesce(v_claim.payment_status, '')) = 'paid' THEN
    RAISE EXCEPTION 'A paid claim cannot be audited again.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_auth
  FROM public.authorization_requests
  WHERE id = v_claim.request_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The linked authorization is missing; hold this claim for manual reconciliation.'
      USING ERRCODE = '23514';
  END IF;
  IF lower(trim(coalesce(v_claim.auth_code, ''))) <> lower(trim(coalesce(v_auth.authorization_code, ''))) THEN
    RAISE EXCEPTION 'Claim authorization code does not match its linked authorization.'
      USING ERRCODE = '23514';
  END IF;
  IF COALESCE(v_auth.referred_hospital_id, v_auth.claiming_hospital_id, v_auth.hospital_id) IS NOT NULL
     AND COALESCE(v_claim.claiming_hospital_id, v_claim.hospital_id)
       IS DISTINCT FROM COALESCE(v_auth.referred_hospital_id, v_auth.claiming_hospital_id, v_auth.hospital_id) THEN
    RAISE EXCEPTION 'Claim provider does not match the hospital authorized to provide the service.'
      USING ERRCODE = '23514';
  END IF;

  IF v_auth.total_amount IS NULL THEN
    RAISE EXCEPTION 'The linked authorization has no authoritative amount; hold for manual reconciliation.'
      USING ERRCODE = '23514';
  END IF;
  v_original_amount := round(v_auth.total_amount, 2);
  IF v_original_amount < 0 THEN
    RAISE EXCEPTION 'The linked authorization has an invalid negative amount.' USING ERRCODE = '23514';
  END IF;
  IF v_auth.approved_items IS NOT NULL
     AND jsonb_typeof(v_auth.approved_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'The linked authorization has malformed approved items; hold for manual reconciliation.'
      USING ERRCODE = '23514';
  END IF;
  IF (v_claim.original_amount IS NOT NULL
      AND round(v_claim.original_amount, 2) <> v_original_amount)
     OR (v_claim.original_amount IS NULL
         AND round(coalesce(v_claim.total_amount, 0), 2) <> v_original_amount) THEN
    RAISE EXCEPTION 'Claim amount does not match the authorization amount; hold for manual reconciliation.'
      USING ERRCODE = '23514';
  END IF;

  v_approved_amount := round((p_details->>'approved_amount')::NUMERIC, 2);
  IF v_approved_amount < 0 OR v_approved_amount > v_original_amount THEN
    RAISE EXCEPTION 'Audited amount must be between zero and the authorized amount.'
      USING ERRCODE = '23514';
  END IF;
  IF p_status = 'rejected' AND v_approved_amount <> 0 THEN
    RAISE EXCEPTION 'A rejected claim must have zero approved amount.' USING ERRCODE = '23514';
  END IF;
  IF p_status = 'approved' AND v_approved_amount <> v_original_amount THEN
    RAISE EXCEPTION 'A fully approved claim must equal the authorized amount; use partial approval for a reduction.'
      USING ERRCODE = '23514';
  END IF;
  IF p_status = 'partially_approved' AND (v_approved_amount <= 0 OR v_approved_amount > v_original_amount) THEN
    RAISE EXCEPTION 'A partially approved claim must have a positive amount no greater than the authorization.'
      USING ERRCODE = '23514';
  END IF;

  IF jsonb_typeof(v_auth.approved_items) = 'array' THEN
    v_auth_item_count := jsonb_array_length(v_auth.approved_items);
  END IF;
  IF jsonb_typeof(p_details->'audit_items') = 'array' THEN
    v_audit_item_count := jsonb_array_length(p_details->'audit_items');
  END IF;

  IF v_auth_item_count > 0 THEN
    IF v_audit_item_count <> v_auth_item_count THEN
      RAISE EXCEPTION 'Audited items do not match the authorized item list.' USING ERRCODE = '23514';
    END IF;

    FOR v_index IN 0..(v_auth_item_count - 1) LOOP
      v_auth_item := v_auth.approved_items->v_index;
      v_audit_item := p_details->'audit_items'->v_index;
      IF jsonb_typeof(v_auth_item) <> 'object' OR jsonb_typeof(v_audit_item) <> 'object' THEN
        RAISE EXCEPTION 'Authorized and audited line items must be objects.' USING ERRCODE = '23514';
      END IF;

      v_auth_code := coalesce(nullif(btrim(v_auth_item->>'code'), ''), nullif(btrim(v_auth_item->>'name'), ''), v_index::TEXT);
      v_audit_code := coalesce(nullif(btrim(v_audit_item->>'code'), ''), nullif(btrim(v_audit_item->>'name'), ''), v_index::TEXT);
      IF v_auth_code IS DISTINCT FROM v_audit_code THEN
        RAISE EXCEPTION 'Audited line items must preserve the authorized item identity and order.' USING ERRCODE = '23514';
      END IF;

      v_auth_quantity := coalesce(nullif(v_auth_item->>'quantity', '')::NUMERIC, 1);
      v_auth_unit_price := round(coalesce(
        nullif(v_auth_item->>'unit_price', '')::NUMERIC,
        nullif(v_auth_item->>'price', '')::NUMERIC,
        0
      ), 2);
      IF jsonb_typeof(v_audit_item->'approved_quantity') IS DISTINCT FROM 'number'
         OR jsonb_typeof(v_audit_item->'unit_price') IS DISTINCT FROM 'number'
         OR jsonb_typeof(v_audit_item->'approved_total') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'Audited quantity, unit price, and line total must be numeric.' USING ERRCODE = '22023';
      END IF;

      v_audit_quantity := round((v_audit_item->>'approved_quantity')::NUMERIC, 2);
      v_audit_unit_price := round((v_audit_item->>'unit_price')::NUMERIC, 2);
      v_line_total := round(v_audit_quantity * v_audit_unit_price, 2);
      v_declined := lower(coalesce(v_auth_item->>'declined', 'false')) IN ('true', 't', '1');

      IF v_auth_quantity <= 0
         OR v_audit_quantity < 0 OR v_audit_quantity > v_auth_quantity
         OR v_audit_unit_price < 0 OR v_audit_unit_price > v_auth_unit_price
         OR round((v_audit_item->>'approved_total')::NUMERIC, 2) <> v_line_total
         OR (v_declined AND v_audit_quantity <> 0) THEN
        RAISE EXCEPTION 'Audited line item exceeds or conflicts with its authorized quantity or tariff.'
          USING ERRCODE = '23514';
      END IF;
      v_items_total := v_items_total + v_line_total;
      IF v_audit_quantity > 0 AND NOT v_declined THEN
        v_approved_item_count := v_approved_item_count + 1;
      ELSE
        v_declined_item_count := v_declined_item_count + 1;
      END IF;
    END LOOP;

    IF round(v_items_total, 2) <> v_approved_amount THEN
      RAISE EXCEPTION 'Audited line-item totals do not equal the audited claim amount.'
        USING ERRCODE = '23514';
    END IF;
  ELSIF v_audit_item_count > 0 THEN
    RAISE EXCEPTION 'Audited items cannot be added when the authorization has no approved item list.'
      USING ERRCODE = '23514';
  END IF;

  v_declined_amount := round(v_original_amount - v_approved_amount, 2);
  v_audit_summary := coalesce(p_details->'audit_summary', '{}'::JSONB);
  IF jsonb_typeof(v_audit_summary) <> 'object' THEN
    RAISE EXCEPTION 'Claim audit summary must be an object.' USING ERRCODE = '22023';
  END IF;
  v_audit_summary := v_audit_summary || jsonb_build_object(
    'original', v_original_amount,
    'approved', v_approved_amount,
    'declined', v_declined_amount,
    'savings', v_declined_amount,
    'approvedCount', v_approved_item_count,
    'declinedCount', v_declined_item_count,
    'finalStatus', p_status
  );

  IF p_status = 'partially_approved' THEN
    v_contest_deadline := now() + interval '7 days';
  END IF;

  v_previous_guard := current_setting('medcode.claim_financial_rpc', true);
  PERFORM set_config('medcode.claim_financial_rpc', 'true', true);

  UPDATE public.hospital_claims
  SET status = p_status,
      original_amount = v_original_amount,
      approved_amount = v_approved_amount,
      declined_amount = v_declined_amount,
      audit_note = coalesce(p_details->>'audit_note', audit_note),
      notes = coalesce(p_details->>'notes', notes),
      audit_items = CASE WHEN p_details ? 'audit_items' THEN p_details->'audit_items' ELSE audit_items END,
      audit_summary = v_audit_summary,
      line_items = CASE WHEN p_details ? 'audit_items' THEN p_details->'audit_items' ELSE line_items END,
      payment_status = CASE
        WHEN lower(coalesce(v_claim.status, '')) IN ('contested', 'under_contest')
             AND p_status IN ('approved', 'partially_approved')
          THEN 'awaiting_payment'
        ELSE v_claim.payment_status
      END,
      contest_deadline = coalesce(v_contest_deadline, contest_deadline),
      audited_by = v_user_id,
      audited_at = now(),
      updated_at = now()
  WHERE id = p_claim_id;

  PERFORM set_config('medcode.claim_financial_rpc', coalesce(v_previous_guard, ''), true);

  UPDATE public.authorization_requests
  SET claim_status = p_status,
      updated_at = now()
  WHERE id = v_claim.request_id;

  SELECT role::TEXT INTO v_role
  FROM public.user_roles
  WHERE user_id = v_user_id
  ORDER BY CASE role::TEXT WHEN 'admin' THEN 1 WHEN 'claims' THEN 2 ELSE 3 END
  LIMIT 1;

  INSERT INTO public.audit_logs (
    action, action_type, user_id, actor_user_id, actor_role,
    entity_type, entity_id, details, severity
  ) VALUES (
    'claim_audit_updated', 'claim_audit', v_user_id, v_user_id, coalesce(v_role, 'unknown'),
    'hospital_claims', p_claim_id::TEXT,
    jsonb_build_object(
      'status', p_status,
      'original_amount', v_original_amount,
      'approved_amount', v_approved_amount,
      'declined_amount', v_declined_amount,
      'request_id', v_claim.request_id
    ),
    'info'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_claim_status(UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_claim_status(UUID, TEXT, JSONB) TO authenticated, service_role;

-- Do not allow a client-side UPDATE to mark a payment batch paid. Settlement
-- must pass through the transactional RPC below.
CREATE OR REPLACE FUNCTION public.enforce_payment_batch_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'paid' THEN
      RAISE EXCEPTION 'A paid payment batch cannot be deleted.' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IS DISTINCT FROM 'paid' AND NEW.status = 'paid'
     AND current_setting('medcode.payment_settlement_rpc', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Payment batches can only be settled through the transactional settlement RPC.'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'paid' AND (
    NEW.status IS DISTINCT FROM 'paid' OR
    NEW.provider_id IS DISTINCT FROM OLD.provider_id OR
    NEW.total_amount IS DISTINCT FROM OLD.total_amount OR
    NEW.total_claims IS DISTINCT FROM OLD.total_claims OR
    NEW.batch_reference IS DISTINCT FROM OLD.batch_reference OR
    NEW.month IS DISTINCT FROM OLD.month OR
    NEW.paid_by IS DISTINCT FROM OLD.paid_by OR
    NEW.paid_at IS DISTINCT FROM OLD.paid_at OR
    NEW.bank_reference IS DISTINCT FROM OLD.bank_reference OR
    NEW.receipt_url IS DISTINCT FROM OLD.receipt_url OR
    NEW.receipt_name IS DISTINCT FROM OLD.receipt_name
  ) THEN
    RAISE EXCEPTION 'Financial details of a paid batch are immutable.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Recompute and compare the payable ledger at settlement time; never trust a
-- batch total supplied or edited by the client. All changes remain atomic.
CREATE OR REPLACE FUNCTION public.settle_payment_batch_transactional(
  p_batch_id UUID,
  p_payload JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_batch public.payment_batches%ROWTYPE;
  v_linked_count INTEGER;
  v_eligible_count INTEGER;
  v_total_amount NUMERIC(12,2);
  v_previous_guard TEXT;
  v_role TEXT;
BEGIN
  IF v_user_id IS NULL OR NOT (
    public.has_role(v_user_id, 'admin'::public.app_role) OR
    public.has_role(v_user_id, 'finance'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Finance or Super Admin access required.' USING ERRCODE = '42501';
  END IF;
  IF p_payload IS NULL OR p_payload->>'status' IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'This operation only supports payment batch settlement.' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_payload->>'bank_reference', '')) > 200
     OR length(coalesce(p_payload->>'receipt_url', '')) > 1024
     OR length(coalesce(p_payload->>'receipt_name', '')) > 255 THEN
    RAISE EXCEPTION 'Payment reference or receipt metadata exceeds its allowed length.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_batch
  FROM public.payment_batches
  WHERE id = p_batch_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment batch not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_batch.status IS DISTINCT FROM 'ready' THEN
    RAISE EXCEPTION 'Only a ready payment batch can be settled.' USING ERRCODE = '23514';
  END IF;

  PERFORM hc.id
  FROM public.hospital_claims hc
  WHERE hc.payment_batch_id = p_batch_id
  ORDER BY hc.id
  FOR UPDATE;

  PERFORM ar.id
  FROM public.authorization_requests ar
  JOIN public.hospital_claims hc ON hc.request_id = ar.id
  WHERE hc.payment_batch_id = p_batch_id
  ORDER BY ar.id
  FOR SHARE OF ar;

  SELECT count(*)::INTEGER,
         count(*) FILTER (
           WHERE hc.hospital_id = v_batch.provider_id
             AND hc.status IN ('approved', 'partially_approved')
             AND hc.payment_status = 'batched'
             AND hc.payment_batch_id = p_batch_id
             AND ar.id IS NOT NULL
             AND lower(btrim(coalesce(hc.auth_code, ''))) = lower(btrim(coalesce(ar.authorization_code, '')))
             AND coalesce(ar.referred_hospital_id, ar.claiming_hospital_id, ar.hospital_id) = v_batch.provider_id
             AND coalesce(hc.approved_amount, hc.total_amount, 0) >= 0
             AND coalesce(hc.approved_amount, hc.total_amount, 0) <= ar.total_amount
             AND (hc.status <> 'approved'
               OR round(coalesce(hc.approved_amount, hc.total_amount, 0), 2) = round(ar.total_amount, 2))
         )::INTEGER,
         round(coalesce(sum(coalesce(hc.approved_amount, hc.total_amount, 0)), 0), 2)::NUMERIC(12,2)
  INTO v_linked_count, v_eligible_count, v_total_amount
  FROM public.hospital_claims hc
  LEFT JOIN public.authorization_requests ar ON ar.id = hc.request_id
  WHERE hc.payment_batch_id = p_batch_id;

  IF v_linked_count = 0 OR v_eligible_count <> v_linked_count THEN
    RAISE EXCEPTION 'One or more linked claims are not eligible for this provider payment.' USING ERRCODE = '23514';
  END IF;
  IF v_batch.total_claims IS DISTINCT FROM v_linked_count
     OR round(coalesce(v_batch.total_amount, 0), 2) <> v_total_amount THEN
    RAISE EXCEPTION 'Payment batch totals do not match the locked claim ledger; reconcile and recreate the batch.'
      USING ERRCODE = '23514';
  END IF;
  IF v_total_amount <= 0 THEN
    RAISE EXCEPTION 'A payment batch must have a positive verified total.' USING ERRCODE = '23514';
  END IF;

  v_previous_guard := current_setting('medcode.payment_settlement_rpc', true);
  PERFORM set_config('medcode.payment_settlement_rpc', 'true', true);

  UPDATE public.payment_batches
  SET status = 'paid',
      paid_at = now(),
      bank_reference = CASE WHEN p_payload ? 'bank_reference' THEN p_payload->>'bank_reference' ELSE bank_reference END,
      paid_by = v_user_id,
      receipt_url = CASE WHEN p_payload ? 'receipt_url' THEN p_payload->>'receipt_url' ELSE receipt_url END,
      receipt_name = CASE WHEN p_payload ? 'receipt_name' THEN p_payload->>'receipt_name' ELSE receipt_name END
  WHERE id = p_batch_id;

  UPDATE public.hospital_claims
  SET payment_status = 'paid'
  WHERE payment_batch_id = p_batch_id;

  PERFORM set_config('medcode.payment_settlement_rpc', coalesce(v_previous_guard, ''), true);

  SELECT role::TEXT INTO v_role
  FROM public.user_roles
  WHERE user_id = v_user_id
  ORDER BY CASE role::TEXT WHEN 'admin' THEN 1 ELSE 2 END
  LIMIT 1;

  INSERT INTO public.audit_logs (
    action, action_type, user_id, actor_user_id, actor_role,
    entity_type, entity_id, details, severity
  ) VALUES (
    'payment_batch_settled', 'payment_settlement', v_user_id, v_user_id, coalesce(v_role, 'unknown'),
    'payment_batches', p_batch_id::TEXT,
    jsonb_build_object(
      'batch_reference', v_batch.batch_reference,
      'provider_id', v_batch.provider_id,
      'total_claims', v_linked_count,
      'total_amount', v_total_amount
    ),
    'high'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_payment_batch_transactional(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_payment_batch_transactional(UUID, JSONB) TO authenticated, service_role;

-- Keep the existing hospital contest flow, but make the privileged update
-- distinguishable from ordinary hospital table updates to the guard trigger.
CREATE OR REPLACE FUNCTION public.rpc_submit_claim_contest(
  p_claim_id UUID,
  p_reason TEXT,
  p_documents JSONB DEFAULT '[]'::JSONB,
  p_under_contest_amount NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_hospital_id UUID;
  v_claim public.hospital_claims%ROWTYPE;
  v_reason TEXT := nullif(btrim(p_reason), '');
  v_max_contestable NUMERIC(14,2);
  v_previous_guard TEXT;
  v_audit_summary JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Sign in to contest a claim.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(v_uid, 'hospital'::public.app_role) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only active hospital users may contest a claim.' USING ERRCODE = '42501';
  END IF;
  SELECT hospital_id INTO v_hospital_id
  FROM public.user_roles
  WHERE user_id = v_uid AND role = 'hospital'::public.app_role
    AND (is_active IS NULL OR is_active = TRUE)
    AND lower(coalesce(access_status, '')) = 'active'
  ORDER BY hospital_id
  LIMIT 1;
  IF v_hospital_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only active hospital users may contest a claim.' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) > 5000 THEN
    RAISE EXCEPTION 'A contest reason between 1 and 5000 characters is required.' USING ERRCODE = '22023';
  END IF;
  IF p_documents IS NULL OR jsonb_typeof(p_documents) <> 'array'
     OR octet_length(p_documents::TEXT) > 5242880 THEN
    RAISE EXCEPTION 'Contest documents must be a JSON array no larger than 5 MB.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_claim
  FROM public.hospital_claims
  WHERE id = p_claim_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Claim does not exist.' USING ERRCODE = 'P0002';
  END IF;
  IF v_claim.hospital_id IS DISTINCT FROM v_hospital_id
     AND coalesce(v_claim.claiming_hospital_id, v_claim.hospital_id) IS DISTINCT FROM v_hospital_id THEN
    RAISE EXCEPTION 'FORBIDDEN: This claim does not belong to your hospital.' USING ERRCODE = '42501';
  END IF;
  IF lower(coalesce(v_claim.status, '')) NOT IN ('partially_approved', 'rejected', 'declined', 'denied', 'adjusted') THEN
    RAISE EXCEPTION 'INVALID_STATE: This claim cannot be contested in its current state.' USING ERRCODE = '23514';
  END IF;
  IF coalesce(v_claim.payment_status, '') = 'paid' OR v_claim.payment_batch_id IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_STATE: A paid or batched claim cannot be contested.' USING ERRCODE = '23514';
  END IF;
  IF coalesce(v_claim.under_contest_amount, 0) > 0
     OR nullif(btrim(coalesce(v_claim.contest_note, '')), '') IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICATE: This claim already has a contest.' USING ERRCODE = '23505';
  END IF;
  IF v_claim.contest_deadline IS NOT NULL AND v_claim.contest_deadline < now() THEN
    RAISE EXCEPTION 'DEADLINE_EXPIRED: The contest window has closed.' USING ERRCODE = '23514';
  END IF;

  v_max_contestable := round(coalesce(v_claim.original_amount, v_claim.total_amount, 0), 2);
  IF p_under_contest_amount IS NULL OR p_under_contest_amount <= 0
     OR p_under_contest_amount > v_max_contestable THEN
    RAISE EXCEPTION 'The disputed amount must be positive and no greater than the original claim amount.'
      USING ERRCODE = '23514';
  END IF;

  v_audit_summary := coalesce(v_claim.audit_summary, '{}'::JSONB);
  IF jsonb_typeof(v_audit_summary) <> 'object' THEN
    RAISE EXCEPTION 'Existing claim audit data requires manual reconciliation.' USING ERRCODE = '23514';
  END IF;
  v_audit_summary := v_audit_summary || jsonb_build_object(
    'contest', jsonb_build_object(
      'status', 'awaiting_reaudit',
      'hospital_note', v_reason,
      'amount_under_contest', round(p_under_contest_amount, 2),
      'documents', p_documents,
      'submitted_at', now(),
      'submitted_by_uid', v_uid
    )
  );

  v_previous_guard := current_setting('medcode.claim_contest_rpc', true);
  PERFORM set_config('medcode.claim_contest_rpc', 'true', true);
  UPDATE public.hospital_claims
  SET status = 'contested',
      notes = coalesce(notes, '') || E'\n\n[HOSPITAL CONTEST APPEAL SUBMITTED on '
        || to_char(now() AT TIME ZONE 'Africa/Lagos', 'DD/MM/YYYY') || ']\nJustification: ' || v_reason,
      contest_note = v_reason,
      contest_documents = p_documents,
      under_contest_amount = round(p_under_contest_amount, 2),
      contest_submitted_at = now(),
      audit_summary = v_audit_summary,
      updated_at = now()
  WHERE id = p_claim_id;
  PERFORM set_config('medcode.claim_contest_rpc', coalesce(v_previous_guard, ''), true);

  RETURN jsonb_build_object(
    'success', true,
    'claim_id', p_claim_id,
    'under_contest_amount', round(p_under_contest_amount, 2),
    'submitted_at', now()
  );
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_submit_claim_contest(UUID, TEXT, JSONB, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_submit_claim_contest(UUID, TEXT, JSONB, NUMERIC) TO authenticated;

-- The former client UPDATE used the browser for identity and audit text.
-- Restrict unlocking to claims leads/admin and record the authenticated actor.
CREATE OR REPLACE FUNCTION public.rpc_unlock_hospital_claim(p_claim_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT;
  v_actor_name TEXT;
  v_claim public.hospital_claims%ROWTYPE;
  v_mfa_enforced BOOLEAN := FALSE;
  v_mfa_exempt BOOLEAN := FALSE;
  v_previous_guard TEXT;
BEGIN
  IF v_uid IS NULL OR NOT (
    public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_role(v_uid, 'claims_lead'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = v_uid AND ur.role = 'claims'::public.app_role
        AND coalesce(ur.is_team_lead, false)
        AND lower(coalesce(ur.access_status, '')) = 'active'
        AND (ur.is_active IS NULL OR ur.is_active = TRUE)
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Claims Lead or Admin access required.' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(gp.value @> '{"enforced": true}'::jsonb, false)
  INTO v_mfa_enforced FROM public.global_policies gp WHERE gp.key = 'enforce_mfa';
  SELECT coalesce(bool_and(coalesce(ur.mfa_exempt, false)), false)
  INTO v_mfa_exempt FROM public.user_roles ur WHERE ur.user_id = v_uid;
  IF coalesce(v_mfa_enforced, false) AND NOT coalesce(v_mfa_exempt, false)
     AND (auth.jwt() ->> 'aal') IS DISTINCT FROM 'aal2' THEN
    RAISE EXCEPTION 'MFA verification is required to unlock a claim.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_claim FROM public.hospital_claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Claim not found.' USING ERRCODE = 'P0002'; END IF;
  IF coalesce(v_claim.status, '') = 'paid' OR coalesce(v_claim.payment_status, '') = 'paid'
     OR v_claim.payment_batch_id IS NOT NULL THEN
    RAISE EXCEPTION 'Paid or batched claims cannot be unlocked.' USING ERRCODE = '23514';
  END IF;

  SELECT role::TEXT, full_name INTO v_role, v_actor_name
  FROM public.user_roles WHERE user_id = v_uid
  ORDER BY CASE role::TEXT WHEN 'admin' THEN 1 WHEN 'claims_lead' THEN 2 ELSE 3 END
  LIMIT 1;

  v_previous_guard := current_setting('medcode.claim_unlock_rpc', true);
  PERFORM set_config('medcode.claim_unlock_rpc', 'true', true);
  UPDATE public.hospital_claims
  SET status = 'submitted',
      payment_status = NULL,
      audit_note = '[CLAIM UNLOCKED BY CLAIMS LEAD]' || E'\nUnlocked by: '
        || coalesce(v_actor_name, v_role, 'Claims Lead') || E'\nDate: '
        || to_char(now() AT TIME ZONE 'Africa/Lagos', 'DD/MM/YYYY HH24:MI')
        || E'\nPrevious status: ' || coalesce(v_claim.status, 'unknown') || E'\n\n'
        || coalesce(v_claim.audit_note, ''),
      updated_at = now()
  WHERE id = p_claim_id;
  PERFORM set_config('medcode.claim_unlock_rpc', coalesce(v_previous_guard, ''), true);

  INSERT INTO public.audit_logs (
    action, action_type, user_id, actor_user_id, actor_role,
    entity_type, entity_id, details, severity
  ) VALUES (
    'claim_unlocked', 'claim_unlock', v_uid, v_uid, coalesce(v_role, 'claims_lead'),
    'hospital_claims', p_claim_id::TEXT,
    jsonb_build_object('previous_status', v_claim.status, 'request_id', v_claim.request_id),
    'high'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_unlock_hospital_claim(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_unlock_hospital_claim(UUID) TO authenticated;

COMMIT;
