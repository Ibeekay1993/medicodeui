-- ============================================================
-- Migration: Secure Claim Contest RPC
-- Purpose  : Replace direct hospital_claims UPDATE with a
--            server-side RPC that enforces:
--              1. Caller must have role 'hospital'
--              2. Claim must belong to the calling hospital
--              3. Claim status must be contestable
--              4. Contest deadline must not have passed
--              5. Claim must not already be contested
--              6. Full audit trail written
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_submit_claim_contest(
  p_claim_id            UUID,
  p_reason              TEXT,
  p_documents           JSONB   DEFAULT '[]'::JSONB,
  p_under_contest_amount NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid             UUID := auth.uid();
  v_hospital_id     UUID;
  v_claim           RECORD;
  v_new_notes       TEXT;
  v_audit_summary   JSONB;
BEGIN
  -- ── 1. Verify caller is a hospital user ────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = v_uid
      AND role = 'hospital'
      AND (is_active IS NULL OR is_active = TRUE)
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only hospital accounts may contest claims.'
      USING ERRCODE = '42501';
  END IF;

  -- ── 2. Resolve the hospital ID for this user ───────────────
  SELECT hospital_id INTO v_hospital_id
  FROM user_roles
  WHERE user_id = v_uid
    AND role = 'hospital'
    AND (is_active IS NULL OR is_active = TRUE)
  LIMIT 1;

  IF v_hospital_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: No hospital profile linked to this account.'
      USING ERRCODE = '42501';
  END IF;

  -- ── 3. Load and lock the claim row ─────────────────────────
  SELECT * INTO v_claim
  FROM hospital_claims
  WHERE id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Claim % does not exist.', p_claim_id
      USING ERRCODE = 'P0002';
  END IF;

  -- ── 4. Ownership check ─────────────────────────────────────
  -- Claim must belong to the calling hospital (direct or as claiming hospital)
  IF v_claim.hospital_id != v_hospital_id
     AND COALESCE(v_claim.claiming_hospital_id, v_claim.hospital_id) != v_hospital_id
  THEN
    RAISE EXCEPTION 'FORBIDDEN: This claim does not belong to your hospital.'
      USING ERRCODE = '42501';
  END IF;

  -- ── 5. Status gate: only contestable statuses ──────────────
  IF LOWER(v_claim.status) NOT IN (
    'partially_approved', 'rejected', 'declined', 'denied', 'adjusted'
  ) THEN
    RAISE EXCEPTION 'INVALID_STATE: Claims with status "%" cannot be contested.', v_claim.status
      USING ERRCODE = '23514';
  END IF;

  -- ── 6. Already contested? ──────────────────────────────────
  IF v_claim.under_contest_amount IS NOT NULL AND v_claim.under_contest_amount > 0 THEN
    RAISE EXCEPTION 'DUPLICATE: This claim has already been contested.'
      USING ERRCODE = '23505';
  END IF;

  IF v_claim.contest_note IS NOT NULL AND TRIM(v_claim.contest_note) != '' THEN
    RAISE EXCEPTION 'DUPLICATE: A contest note already exists for this claim.'
      USING ERRCODE = '23505';
  END IF;

  -- ── 7. Contest deadline check ──────────────────────────────
  IF v_claim.contest_deadline IS NOT NULL AND v_claim.contest_deadline < NOW() THEN
    RAISE EXCEPTION 'DEADLINE_EXPIRED: The 7-day contest window for this claim has closed.'
      USING ERRCODE = '23514';
  END IF;

  -- ── 8. Payment already processed? ─────────────────────────
  IF LOWER(COALESCE(v_claim.payment_status, '')) = 'paid' THEN
    RAISE EXCEPTION 'INVALID_STATE: Paid claims cannot be contested.'
      USING ERRCODE = '23514';
  END IF;

  -- ── 9. Build updated notes ─────────────────────────────────
  v_new_notes := COALESCE(v_claim.notes, '')
    || E'\n\n[HOSPITAL CONTEST APPEAL SUBMITTED on '
    || TO_CHAR(NOW() AT TIME ZONE 'Africa/Lagos', 'DD/MM/YYYY')
    || ']'
    || E'\nJustification: ' || COALESCE(p_reason, '');

  -- ── 10. Build audit summary JSONB ─────────────────────────
  v_audit_summary := COALESCE(v_claim.audit_summary, '{}'::JSONB) || jsonb_build_object(
    'contest', jsonb_build_object(
      'status',               'awaiting_reaudit',
      'hospital_note',        COALESCE(p_reason, ''),
      'amount_under_contest', COALESCE(p_under_contest_amount, 0),
      'documents',            COALESCE(p_documents, '[]'::JSONB),
      'submitted_at',         NOW()::TEXT,
      'submitted_by_uid',     v_uid::TEXT
    )
  );

  -- ── 11. Apply update ───────────────────────────────────────
  UPDATE hospital_claims
  SET
    status                = 'contested',
    notes                 = v_new_notes,
    contest_note          = COALESCE(p_reason, ''),
    contest_documents     = COALESCE(p_documents, '[]'::JSONB),
    under_contest_amount  = COALESCE(p_under_contest_amount, 0),
    contest_submitted_at  = NOW(),
    audit_summary         = v_audit_summary
  WHERE id = p_claim_id;

  RETURN jsonb_build_object(
    'success',              TRUE,
    'claim_id',             p_claim_id,
    'under_contest_amount', COALESCE(p_under_contest_amount, 0),
    'submitted_at',         NOW()
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

-- Grant execution only to authenticated users (RLS + ownership check inside)
REVOKE ALL ON FUNCTION rpc_submit_claim_contest(UUID, TEXT, JSONB, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_submit_claim_contest(UUID, TEXT, JSONB, NUMERIC) TO authenticated;

COMMENT ON FUNCTION rpc_submit_claim_contest IS
  'Secure contest submission for hospital claims. Enforces ownership, status, deadline, and duplicate checks server-side. Replaces direct UPDATE from the client.';
