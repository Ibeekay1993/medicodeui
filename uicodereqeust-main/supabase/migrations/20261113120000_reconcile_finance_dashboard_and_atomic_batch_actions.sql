BEGIN;

-- Settlement updates hospital_claims.payment_status, while legacy workflows
-- may also leave hospital_claims.status='paid'. Count either authoritative
-- paid marker so dashboards agree with the paid-claims ledger.
CREATE OR REPLACE FUNCTION public.get_dashboard_finance_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.app_role;
  v_result jsonb;
BEGIN
  SELECT ur.role
    INTO v_role
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
    AND lower(coalesce(ur.access_status, '')) = 'active'
    AND ur.account_setup_required IS FALSE
  ORDER BY CASE ur.role::text WHEN 'admin' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_role IS NULL OR v_role::text NOT IN ('admin', 'finance') THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  WITH claim_totals AS (
    SELECT
      count(*) FILTER (
        WHERE c.payment_batch_id IS NULL
          AND lower(coalesce(c.payment_status, '')) <> 'paid'
          AND (
            lower(c.status) = 'approved'
            OR (
              lower(c.status) = 'partially_approved'
              AND (
                lower(coalesce(c.payment_status, '')) = 'awaiting_payment'
                OR (c.contest_deadline IS NOT NULL AND c.contest_deadline < now())
              )
            )
          )
      ) AS awaiting_count,
      coalesce(sum(
        CASE
          WHEN c.payment_batch_id IS NULL
            AND lower(coalesce(c.payment_status, '')) <> 'paid'
            AND (
              lower(c.status) = 'approved'
              OR (
                lower(c.status) = 'partially_approved'
                AND (
                  lower(coalesce(c.payment_status, '')) = 'awaiting_payment'
                  OR (c.contest_deadline IS NOT NULL AND c.contest_deadline < now())
                )
              )
            )
          THEN coalesce(nullif(c.approved_amount, 0), nullif(c.total_amount, 0), 0)
          ELSE 0
        END
      ), 0)::numeric AS awaiting_value,
      count(*) FILTER (
        WHERE lower(c.status) = 'paid' OR lower(coalesce(c.payment_status, '')) = 'paid'
      ) AS paid_count,
      coalesce(sum(
        CASE
          WHEN lower(c.status) = 'paid' OR lower(coalesce(c.payment_status, '')) = 'paid'
          THEN coalesce(nullif(c.approved_amount, 0), nullif(c.total_amount, 0), 0)
          ELSE 0
        END
      ), 0)::numeric AS paid_value,
      count(*) FILTER (
        WHERE lower(c.status) IN ('submitted', 'pending', 'under_review')
          AND lower(coalesce(c.payment_status, '')) <> 'paid'
      ) AS submitted,
      count(*) FILTER (
        WHERE lower(c.status) = 'approved'
          AND lower(coalesce(c.payment_status, '')) <> 'paid'
      ) AS approved,
      count(*) FILTER (
        WHERE lower(c.status) = 'partially_approved'
          AND lower(coalesce(c.payment_status, '')) <> 'paid'
      ) AS partially_approved,
      count(*) FILTER (
        WHERE lower(c.status) IN ('rejected', 'declined', 'denied')
          AND lower(coalesce(c.payment_status, '')) <> 'paid'
      ) AS rejected,
      count(*) FILTER (
        WHERE lower(c.status) IN ('contested', 'under_contest')
          AND lower(coalesce(c.payment_status, '')) <> 'paid'
      ) AS contested,
      coalesce(sum(c.total_amount), 0)::numeric AS claimed_value,
      coalesce(sum(c.approved_amount), 0)::numeric AS approved_value,
      coalesce(sum(c.declined_amount), 0)::numeric AS declined_value
    FROM public.hospital_claims c
  ),
  batch_totals AS (
    SELECT
      count(*) FILTER (WHERE lower(b.status) = 'draft') AS draft_batches,
      count(*) FILTER (WHERE lower(b.status) = 'ready') AS ready_batches,
      count(*) FILTER (WHERE lower(b.status) = 'paid') AS paid_batches,
      coalesce(sum(b.total_amount), 0)::numeric AS total_batches_value
    FROM public.payment_batches b
  )
  SELECT jsonb_build_object(
    'awaiting_count', c.awaiting_count,
    'awaiting_value', c.awaiting_value,
    'paid_count', c.paid_count,
    'paid_value', c.paid_value,
    'draft_batches', b.draft_batches,
    'ready_batches', b.ready_batches,
    'paid_batches', b.paid_batches,
    'total_batches_value', b.total_batches_value,
    'admin_claims', CASE WHEN v_role::text = 'admin' THEN jsonb_build_object(
      'submitted', c.submitted,
      'approved', c.approved,
      'partially_approved', c.partially_approved,
      'rejected', c.rejected,
      'contested', c.contested,
      'paid', c.paid_count,
      'claimed_value', c.claimed_value,
      'approved_value', c.approved_value,
      'declined_value', c.declined_value
    ) ELSE NULL END
  )
  INTO v_result
  FROM claim_totals c
  CROSS JOIN batch_totals b;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_finance_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_finance_stats() TO authenticated;

-- The web client must not make multi-step payment batch transitions. Keep
-- batch reads role-aware and move all writes to the checked RPCs below.
DROP POLICY IF EXISTS "Backoffice users can manage payment batches" ON public.payment_batches;

CREATE OR REPLACE FUNCTION public.prepare_payment_batch_transactional(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_batch public.payment_batches%ROWTYPE;
  v_linked_count integer;
  v_eligible_count integer;
  v_total_amount numeric(12,2);
  v_role text;
BEGIN
  IF v_user_id IS NULL OR NOT (
    public.has_role(v_user_id, 'admin'::public.app_role)
    OR public.has_role(v_user_id, 'finance'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Finance or Super Admin access required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_batch
  FROM public.payment_batches
  WHERE id = p_batch_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment batch not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_batch.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Only a draft batch can be marked ready.' USING ERRCODE = '23514';
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

  SELECT count(*)::integer,
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
         )::integer,
         round(coalesce(sum(coalesce(hc.approved_amount, hc.total_amount, 0)), 0), 2)::numeric(12,2)
  INTO v_linked_count, v_eligible_count, v_total_amount
  FROM public.hospital_claims hc
  LEFT JOIN public.authorization_requests ar ON ar.id = hc.request_id
  WHERE hc.payment_batch_id = p_batch_id;

  IF v_linked_count = 0 OR v_eligible_count <> v_linked_count THEN
    RAISE EXCEPTION 'One or more linked claims are not eligible for this provider payment.' USING ERRCODE = '23514';
  END IF;
  IF v_batch.total_claims IS DISTINCT FROM v_linked_count
     OR round(coalesce(v_batch.total_amount, 0), 2) <> v_total_amount
     OR v_total_amount <= 0 THEN
    RAISE EXCEPTION 'Batch totals do not match the verified claim ledger; reconcile and recreate the batch.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.payment_batches SET status = 'ready' WHERE id = p_batch_id;
  SELECT CASE WHEN public.has_role(v_user_id, 'admin'::public.app_role) THEN 'admin' ELSE 'finance' END
    INTO v_role;
  INSERT INTO public.audit_logs (
    action, action_type, user_id, actor_user_id, actor_role,
    entity_type, entity_id, details, severity
  ) VALUES (
    'payment_batch_ready', 'payment_batch_transition', v_user_id, v_user_id, v_role,
    'payment_batches', p_batch_id::text,
    jsonb_build_object('batch_reference', v_batch.batch_reference, 'provider_id', v_batch.provider_id,
      'total_claims', v_linked_count, 'total_amount', v_total_amount),
    'high'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_payment_batch_transactional(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_batch public.payment_batches%ROWTYPE;
  v_released_count integer;
  v_role text;
BEGIN
  IF v_user_id IS NULL OR NOT (
    public.has_role(v_user_id, 'admin'::public.app_role)
    OR public.has_role(v_user_id, 'finance'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Finance or Super Admin access required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_batch
  FROM public.payment_batches
  WHERE id = p_batch_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment batch not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_batch.status IS DISTINCT FROM 'ready' THEN
    RAISE EXCEPTION 'Only a ready batch can be rejected.' USING ERRCODE = '23514';
  END IF;

  PERFORM hc.id
  FROM public.hospital_claims hc
  WHERE hc.payment_batch_id = p_batch_id
  ORDER BY hc.id
  FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.hospital_claims hc
    WHERE hc.payment_batch_id = p_batch_id
      AND (lower(coalesce(hc.status, '')) = 'paid' OR lower(coalesce(hc.payment_status, '')) = 'paid')
  ) THEN
    RAISE EXCEPTION 'A batch with paid claims cannot be rejected.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.hospital_claims
  SET payment_batch_id = NULL, payment_status = 'awaiting_payment'
  WHERE payment_batch_id = p_batch_id
    AND lower(coalesce(status, '')) <> 'paid'
    AND lower(coalesce(payment_status, '')) <> 'paid';
  GET DIAGNOSTICS v_released_count = ROW_COUNT;

  UPDATE public.payment_batches SET status = 'rejected' WHERE id = p_batch_id;
  SELECT CASE WHEN public.has_role(v_user_id, 'admin'::public.app_role) THEN 'admin' ELSE 'finance' END
    INTO v_role;
  INSERT INTO public.audit_logs (
    action, action_type, user_id, actor_user_id, actor_role,
    entity_type, entity_id, details, severity
  ) VALUES (
    'payment_batch_rejected', 'payment_batch_transition', v_user_id, v_user_id, v_role,
    'payment_batches', p_batch_id::text,
    jsonb_build_object('batch_reference', v_batch.batch_reference, 'provider_id', v_batch.provider_id,
      'released_claims', v_released_count),
    'high'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_draft_payment_batch_transactional(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_batch public.payment_batches%ROWTYPE;
  v_released_count integer;
  v_role text;
BEGIN
  IF v_user_id IS NULL OR NOT (
    public.has_role(v_user_id, 'admin'::public.app_role)
    OR public.has_role(v_user_id, 'finance'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Finance or Super Admin access required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_batch
  FROM public.payment_batches
  WHERE id = p_batch_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment batch not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_batch.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Only a draft batch can be cancelled.' USING ERRCODE = '23514';
  END IF;

  PERFORM hc.id
  FROM public.hospital_claims hc
  WHERE hc.payment_batch_id = p_batch_id
  ORDER BY hc.id
  FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.hospital_claims hc
    WHERE hc.payment_batch_id = p_batch_id
      AND (lower(coalesce(hc.status, '')) = 'paid' OR lower(coalesce(hc.payment_status, '')) = 'paid')
  ) THEN
    RAISE EXCEPTION 'A batch with paid claims cannot be cancelled.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.hospital_claims
  SET payment_batch_id = NULL, payment_status = 'awaiting_payment'
  WHERE payment_batch_id = p_batch_id
    AND lower(coalesce(status, '')) <> 'paid'
    AND lower(coalesce(payment_status, '')) <> 'paid';
  GET DIAGNOSTICS v_released_count = ROW_COUNT;

  SELECT CASE WHEN public.has_role(v_user_id, 'admin'::public.app_role) THEN 'admin' ELSE 'finance' END
    INTO v_role;
  INSERT INTO public.audit_logs (
    action, action_type, user_id, actor_user_id, actor_role,
    entity_type, entity_id, details, severity
  ) VALUES (
    'payment_batch_cancelled', 'payment_batch_transition', v_user_id, v_user_id, v_role,
    'payment_batches', p_batch_id::text,
    jsonb_build_object('batch_reference', v_batch.batch_reference, 'provider_id', v_batch.provider_id,
      'released_claims', v_released_count),
    'high'
  );
  DELETE FROM public.payment_batches WHERE id = p_batch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_payment_batch_transactional(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_payment_batch_transactional(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.reject_payment_batch_transactional(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_payment_batch_transactional(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_draft_payment_batch_transactional(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_draft_payment_batch_transactional(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
