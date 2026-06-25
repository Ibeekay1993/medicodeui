-- Fix: Claims Officer RLS and Status Workflow Alignment
-- Fixes 3 critical issues found on 2026-05-17:
--   1. Claims role missing from authorization_requests SELECT policy (causing false FORGERY warnings)
--   2. UPDATE WITH CHECK did not include 'approved' as a valid status (silently blocking approvals)
--   3. Admin role was also not in hospital_claims read policy

BEGIN;

-- ============================================================
-- FIX 1: Add 'claims' role to authorization_requests SELECT
-- The fraud verification engine cross-references auth codes
-- against the authorization_requests table. Without this,
-- every claim shows "FORGERY WARNING" even for valid claims.
-- ============================================================
DROP POLICY IF EXISTS "Hospital Data Isolation - View" ON public.authorization_requests;
CREATE POLICY "Hospital Data Isolation - View"
  ON public.authorization_requests FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'nurse') OR
    public.has_role(auth.uid(), 'claims') OR
    (public.has_role(auth.uid(), 'hospital') AND (
      submitted_by = auth.uid() OR
      hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
    ))
  );

-- ============================================================
-- FIX 2: Rebuild hospital_claims SELECT policy to include admin
-- Both 'claims' and 'admin' roles must be able to read all claims
-- ============================================================
DROP POLICY IF EXISTS "Claims can read hospital claims" ON public.hospital_claims;
CREATE POLICY "Claims can read hospital claims"
  ON public.hospital_claims
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'claims') OR
    public.has_role(auth.uid(), 'admin')
  );

-- ============================================================
-- FIX 3: Rebuild hospital_claims UPDATE policy
-- The WITH CHECK must include 'approved' — it was missing,
-- silently blocking all approval actions from claims officers.
-- ============================================================
DROP POLICY IF EXISTS "Claims can update hospital claims" ON public.hospital_claims;
CREATE POLICY "Claims can update hospital claims"
  ON public.hospital_claims
  FOR UPDATE
  TO authenticated
  USING (
    (public.has_role(auth.uid(), 'claims') OR public.has_role(auth.uid(), 'admin'))
    AND status IN ('submitted', 'pending', 'under_review')
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'claims') OR public.has_role(auth.uid(), 'admin'))
    AND status IN ('submitted', 'pending', 'under_review', 'approved', 'rejected', 'paid')
  );

-- ============================================================
-- FIX 4: Rebuild hospital_claim_lines SELECT policy to include admin
-- ============================================================
DROP POLICY IF EXISTS "Claims can read hospital claim lines" ON public.hospital_claim_lines;
CREATE POLICY "Claims can read hospital claim lines"
  ON public.hospital_claim_lines
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.hospital_claims hc
      WHERE hc.id = claim_id
        AND (public.has_role(auth.uid(), 'claims') OR public.has_role(auth.uid(), 'admin'))
    )
  );

COMMIT;
