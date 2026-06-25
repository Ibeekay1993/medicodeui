-- Update claims reports functions to allow finance role access
BEGIN;

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
SET search_path = public
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
    hc.status,
    COALESCE(hc.original_amount, hc.total_amount),
    COALESCE(hc.approved_amount, CASE WHEN lower(hc.status) IN ('approved', 'paid') THEN hc.total_amount ELSE 0 END),
    COALESCE(hc.declined_amount, 0),
    hc.total_amount,
    hc.audit_note,
    hc.payment_note,
    hc.payment_reference,
    hc.paid_at
  FROM public.hospital_claims hc
  WHERE (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'claims')
      OR public.has_role(auth.uid(), 'finance')
    )
    AND (_status = 'all' OR lower(hc.status) = lower(_status))
    AND (_hospital_id IS NULL OR hc.hospital_id = _hospital_id)
    AND (_from IS NULL OR hc.created_at >= _from)
    AND (_to IS NULL OR hc.created_at <= _to)
  ORDER BY hc.created_at DESC;
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
SET search_path = public
AS $$
  SELECT
    COALESCE(hc.hospital_name, ar.hospital_name) AS hospital_name,
    COALESCE(hc.patient_name, ar.patient_name) AS patient_name,
    COALESCE(hc.policy_number, ar.policy_number) AS policy_number,
    COALESCE(hc.auth_code, ar.authorization_code) AS auth_code,
    0::numeric AS authorized_amount,
    hc.claim_number,
    COALESCE(hc.original_amount, hc.total_amount, 0)::numeric AS claimed_amount,
    COALESCE(hc.approved_amount, CASE WHEN lower(hc.status) IN ('approved', 'paid') THEN hc.total_amount ELSE 0 END, 0)::numeric AS approved_amount,
    CASE WHEN lower(COALESCE(hc.status, '')) = 'paid'
      THEN COALESCE(hc.approved_amount, hc.total_amount, 0)::numeric
      ELSE 0::numeric
    END AS paid_amount,
    GREATEST(
      COALESCE(hc.approved_amount, CASE WHEN lower(COALESCE(hc.status, '')) IN ('approved', 'paid') THEN hc.total_amount ELSE 0 END, 0)::numeric
      - CASE WHEN lower(COALESCE(hc.status, '')) = 'paid' THEN COALESCE(hc.approved_amount, hc.total_amount, 0)::numeric ELSE 0::numeric END,
      0::numeric
    ) AS outstanding_balance,
    hc.status AS claim_status
  FROM public.hospital_claims hc
  LEFT JOIN public.authorization_requests ar
    ON ar.id = hc.request_id
    OR lower(ar.authorization_code) = lower(hc.auth_code)
    OR (ar.policy_number = hc.policy_number AND ar.patient_name = hc.patient_name)
  WHERE (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'claims')
      OR public.has_role(auth.uid(), 'finance')
    )
    AND (_hospital_id IS NULL OR hc.hospital_id = _hospital_id)
    AND (_from IS NULL OR hc.created_at >= _from)
    AND (_to IS NULL OR hc.created_at <= _to)
  ORDER BY COALESCE(hc.hospital_name, ar.hospital_name), hc.created_at DESC;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
