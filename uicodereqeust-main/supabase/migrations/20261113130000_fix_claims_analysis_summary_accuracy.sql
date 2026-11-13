BEGIN;

-- Keep the claims analysis role-restricted while returning real payment and
-- decision totals instead of the previous hospital-only placeholder counts.
CREATE OR REPLACE FUNCTION public.rpc_get_claims_analysis_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR NOT (
    public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_role(v_uid, 'claims'::public.app_role)
    OR public.has_role(v_uid, 'claims_lead'::public.app_role)
    OR public.has_role(v_uid, 'finance'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied: Claims analysis is restricted to authorized staff.'
      USING ERRCODE = '42501';
  END IF;

  WITH claim_source AS (
    SELECT
      c.id,
      c.hospital_id,
      c.hospital_name,
      c.created_at,
      c.created_at::date AS claim_date,
      coalesce(c.total_amount, 0)::numeric AS total_amount,
      coalesce(c.approved_amount, 0)::numeric AS approved_amount,
      coalesce(c.declined_amount, 0)::numeric AS declined_amount,
      coalesce(c.under_contest_amount, 0)::numeric AS under_contest_amount,
      CASE
        WHEN lower(btrim(coalesce(c.status, ''))) = 'paid'
          OR lower(btrim(coalesce(c.payment_status, ''))) = 'paid' THEN 'paid'
        ELSE regexp_replace(lower(btrim(coalesce(c.status, 'pending'))), '[[:space:]-]+', '_', 'g')
      END AS effective_status
    FROM public.hospital_claims c
  ), classified AS (
    SELECT
      cs.*,
      CASE
        WHEN cs.effective_status IN ('submitted', 'pending', 'under_investigation', 'under_review', 'pending_audit', 'audit') THEN 'pending'
        WHEN cs.effective_status IN ('approved', 'partially_approved') THEN 'approved'
        WHEN cs.effective_status IN ('rejected', 'declined', 'denied') THEN 'rejected'
        WHEN cs.effective_status IN ('contested', 'under_contest') THEN 'contested'
        WHEN cs.effective_status = 'paid' THEN 'paid'
        ELSE 'other'
      END AS status_bucket
    FROM claim_source cs
  ), by_status AS (
    SELECT
      effective_status AS status,
      count(*) AS count,
      coalesce(sum(total_amount), 0) AS total_amount,
      coalesce(sum(CASE WHEN status_bucket = 'pending' THEN total_amount ELSE 0 END), 0) AS pending_amount,
      coalesce(sum(CASE WHEN status_bucket = 'approved' THEN coalesce(nullif(approved_amount, 0), total_amount) ELSE 0 END), 0) AS approved_amount,
      coalesce(sum(CASE WHEN status_bucket = 'rejected' THEN coalesce(nullif(declined_amount, 0), total_amount) ELSE 0 END), 0) AS declined_amount,
      coalesce(sum(CASE WHEN status_bucket = 'contested' THEN coalesce(nullif(under_contest_amount, 0), total_amount) ELSE 0 END), 0) AS under_contest_amount,
      coalesce(sum(CASE WHEN status_bucket = 'paid' THEN coalesce(nullif(approved_amount, 0), total_amount) ELSE 0 END), 0) AS paid_amount
    FROM classified
    GROUP BY effective_status
  ), by_hospital AS (
    SELECT
      hospital_id,
      hospital_name,
      count(*) AS count,
      coalesce(sum(total_amount), 0) AS total_amount,
      count(*) FILTER (WHERE status_bucket = 'pending') AS pending_count,
      count(*) FILTER (WHERE status_bucket = 'approved') AS approved_count,
      count(*) FILTER (WHERE status_bucket = 'rejected') AS rejected_count,
      count(*) FILTER (WHERE status_bucket = 'contested') AS contested_count,
      count(*) FILTER (WHERE status_bucket = 'paid') AS paid_count,
      count(*) FILTER (WHERE status_bucket = 'other') AS other_count,
      coalesce(sum(total_amount) FILTER (WHERE status_bucket = 'pending'), 0) AS pending_amount,
      coalesce(sum(coalesce(nullif(approved_amount, 0), total_amount)) FILTER (WHERE status_bucket = 'approved'), 0) AS approved_amount,
      coalesce(sum(coalesce(nullif(declined_amount, 0), total_amount)) FILTER (WHERE status_bucket = 'rejected'), 0) AS rejected_amount,
      coalesce(sum(coalesce(nullif(under_contest_amount, 0), total_amount)) FILTER (WHERE status_bucket = 'contested'), 0) AS contested_amount,
      coalesce(sum(coalesce(nullif(approved_amount, 0), total_amount)) FILTER (WHERE status_bucket = 'paid'), 0) AS paid_amount,
      max(created_at) AS latest
    FROM classified
    GROUP BY hospital_id, hospital_name
  ), by_date AS (
    SELECT claim_date, count(*) AS count, coalesce(sum(total_amount), 0) AS total_amount
    FROM classified
    WHERE claim_date IS NOT NULL
    GROUP BY claim_date
    ORDER BY claim_date DESC
    LIMIT 10
  )
  SELECT jsonb_build_object(
    'by_status', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.status) FROM by_status s), '[]'::jsonb),
    'by_hospital', coalesce((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.count DESC, h.hospital_name) FROM by_hospital h), '[]'::jsonb),
    'by_date', coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.claim_date DESC) FROM by_date d), '[]'::jsonb)
  ) INTO v_result;

  RETURN coalesce(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_claims_analysis_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_claims_analysis_summary() TO authenticated;

-- A settled claim is identified by either legacy status='paid' or the newer
-- payment_status='paid'. Keep report rows and reconciliation amounts aligned
-- with the same paid definition used by the finance dashboard and paid ledger.
CREATE OR REPLACE FUNCTION public.claims_report_export(
  _status text DEFAULT 'all',
  _hospital_id uuid DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  claim_id uuid,
  claim_number text,
  created_at timestamptz,
  submitted_at timestamptz,
  hospital_name text,
  patient_name text,
  policy_number text,
  auth_code text,
  status text,
  original_amount numeric,
  approved_amount numeric,
  declined_amount numeric,
  total_amount numeric,
  audit_note text,
  payment_note text,
  payment_reference text,
  paid_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    hc.id,
    hc.claim_number,
    hc.created_at,
    hc.submitted_at,
    hc.hospital_name,
    hc.patient_name,
    hc.policy_number,
    hc.auth_code,
    CASE
      WHEN lower(coalesce(hc.status, '')) = 'paid'
        OR lower(coalesce(hc.payment_status, '')) = 'paid' THEN 'paid'
      ELSE hc.status
    END,
    coalesce(hc.original_amount, hc.total_amount),
    coalesce(hc.approved_amount, CASE WHEN lower(coalesce(hc.status, '')) IN ('approved', 'partially_approved', 'paid') OR lower(coalesce(hc.payment_status, '')) = 'paid' THEN hc.total_amount ELSE 0 END),
    coalesce(hc.declined_amount, 0),
    hc.total_amount,
    hc.audit_note,
    hc.payment_note,
    hc.payment_reference,
    hc.paid_at
  FROM public.hospital_claims hc
  WHERE (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'claims'::public.app_role)
      OR public.has_role(auth.uid(), 'claims_lead'::public.app_role)
      OR public.has_role(auth.uid(), 'finance'::public.app_role)
    )
    AND (
      _status = 'all'
      OR lower(CASE
        WHEN lower(coalesce(hc.status, '')) = 'paid'
          OR lower(coalesce(hc.payment_status, '')) = 'paid' THEN 'paid'
        ELSE coalesce(hc.status, '')
      END) = lower(_status)
    )
    AND (_hospital_id IS NULL OR hc.hospital_id = _hospital_id)
    AND (_from IS NULL OR hc.created_at >= _from)
    AND (_to IS NULL OR hc.created_at <= _to)
  ORDER BY hc.created_at DESC, hc.id;
$$;

CREATE OR REPLACE FUNCTION public.claims_reconciliation_report(
  _hospital_id uuid DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  hospital_name text,
  patient_name text,
  policy_number text,
  auth_code text,
  authorized_amount numeric,
  claim_number text,
  claimed_amount numeric,
  approved_amount numeric,
  paid_amount numeric,
  outstanding_balance numeric,
  claim_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    coalesce(hc.hospital_name, ar.hospital_name),
    coalesce(hc.patient_name, ar.patient_name),
    coalesce(hc.policy_number, ar.policy_number),
    coalesce(hc.auth_code, ar.authorization_code),
    coalesce(ar.approved_tariff_amount, ar.total_amount, 0)::numeric,
    hc.claim_number,
    coalesce(hc.original_amount, hc.total_amount, 0)::numeric,
    coalesce(hc.approved_amount, CASE WHEN lower(coalesce(hc.status, '')) IN ('approved', 'partially_approved', 'paid') OR lower(coalesce(hc.payment_status, '')) = 'paid' THEN hc.total_amount ELSE 0 END, 0)::numeric,
    CASE
      WHEN lower(coalesce(hc.status, '')) = 'paid' OR lower(coalesce(hc.payment_status, '')) = 'paid'
      THEN coalesce(hc.approved_amount, hc.total_amount, 0)::numeric
      ELSE 0::numeric
    END,
    greatest(
      coalesce(hc.approved_amount, CASE WHEN lower(coalesce(hc.status, '')) IN ('approved', 'partially_approved', 'paid') OR lower(coalesce(hc.payment_status, '')) = 'paid' THEN hc.total_amount ELSE 0 END, 0)::numeric
      - CASE
          WHEN lower(coalesce(hc.status, '')) = 'paid' OR lower(coalesce(hc.payment_status, '')) = 'paid'
          THEN coalesce(hc.approved_amount, hc.total_amount, 0)::numeric
          ELSE 0::numeric
        END,
      0::numeric
    ),
    CASE
      WHEN lower(coalesce(hc.status, '')) = 'paid' OR lower(coalesce(hc.payment_status, '')) = 'paid' THEN 'paid'
      ELSE hc.status
    END
  FROM public.hospital_claims hc
  LEFT JOIN LATERAL (
    SELECT ar0.hospital_name, ar0.patient_name, ar0.policy_number, ar0.authorization_code,
      ar0.total_amount, ar0.approved_tariff_amount
    FROM public.authorization_requests ar0
    WHERE ar0.id = hc.request_id
      OR lower(ar0.authorization_code) = lower(hc.auth_code)
      OR (ar0.policy_number = hc.policy_number AND ar0.patient_name = hc.patient_name)
    ORDER BY CASE
      WHEN ar0.id = hc.request_id THEN 0
      WHEN lower(ar0.authorization_code) = lower(hc.auth_code) THEN 1
      ELSE 2
    END
    LIMIT 1
  ) ar ON true
  WHERE (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'claims'::public.app_role)
      OR public.has_role(auth.uid(), 'claims_lead'::public.app_role)
      OR public.has_role(auth.uid(), 'finance'::public.app_role)
    )
    AND (_hospital_id IS NULL OR hc.hospital_id = _hospital_id)
    AND (_from IS NULL OR hc.created_at >= _from)
    AND (_to IS NULL OR hc.created_at <= _to)
  ORDER BY coalesce(hc.hospital_name, ar.hospital_name), hc.created_at DESC, hc.id;
$$;

REVOKE ALL ON FUNCTION public.claims_report_export(text, uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claims_report_export(text, uuid, timestamptz, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.claims_reconciliation_report(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claims_reconciliation_report(uuid, timestamptz, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
