BEGIN;

-- Aggregate dashboard finance and claims metrics in Postgres. This avoids
-- fetching a capped sample of claim and batch rows into the browser.
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
    AND ur.account_setup_required IS FALSE;

  IF v_role IS NULL OR v_role::text NOT IN ('admin', 'finance') THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  WITH claim_totals AS (
    SELECT
      count(*) FILTER (
        WHERE c.payment_batch_id IS NULL
          AND (
            c.status = 'approved'
            OR (
              c.status = 'partially_approved'
              AND (
                c.payment_status = 'awaiting_payment'
                OR (c.contest_deadline IS NOT NULL AND c.contest_deadline < now())
              )
            )
          )
      ) AS awaiting_count,
      coalesce(sum(
        CASE
          WHEN c.payment_batch_id IS NULL
            AND (
              c.status = 'approved'
              OR (
                c.status = 'partially_approved'
                AND (
                  c.payment_status = 'awaiting_payment'
                  OR (c.contest_deadline IS NOT NULL AND c.contest_deadline < now())
                )
              )
            )
          THEN coalesce(nullif(c.approved_amount, 0), nullif(c.total_amount, 0), 0)
          ELSE 0
        END
      ), 0)::numeric AS awaiting_value,
      count(*) FILTER (WHERE c.status = 'paid') AS paid_count,
      coalesce(sum(
        CASE WHEN c.status = 'paid'
          THEN coalesce(nullif(c.approved_amount, 0), nullif(c.total_amount, 0), 0)
          ELSE 0
        END
      ), 0)::numeric AS paid_value,
      count(*) FILTER (WHERE c.status IN ('submitted', 'pending', 'under_review')) AS submitted,
      count(*) FILTER (WHERE c.status = 'approved') AS approved,
      count(*) FILTER (WHERE c.status = 'partially_approved') AS partially_approved,
      count(*) FILTER (WHERE c.status IN ('rejected', 'declined', 'denied')) AS rejected,
      count(*) FILTER (WHERE c.status IN ('contested', 'under_contest')) AS contested,
      coalesce(sum(c.total_amount), 0)::numeric AS claimed_value,
      coalesce(sum(c.approved_amount), 0)::numeric AS approved_value,
      coalesce(sum(c.declined_amount), 0)::numeric AS declined_value
    FROM public.hospital_claims c
  ),
  batch_totals AS (
    SELECT
      count(*) FILTER (WHERE b.status = 'draft') AS draft_batches,
      count(*) FILTER (WHERE b.status = 'ready') AS ready_batches,
      count(*) FILTER (WHERE b.status = 'paid') AS paid_batches,
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
GRANT EXECUTE ON FUNCTION public.get_dashboard_finance_stats() TO authenticated, service_role;

COMMIT;
