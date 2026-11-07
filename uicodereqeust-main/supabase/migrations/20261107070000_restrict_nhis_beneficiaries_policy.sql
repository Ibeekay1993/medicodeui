-- Migration: Restrict nhis_beneficiaries SELECT policy
-- Closes the open "qual: true" policy that allowed any authenticated user
-- to dump the entire NHIS beneficiary table.
--
-- Before: Any authenticated user could SELECT all rows (qual = true)
-- After:  Only nurses, admins, utilization managers can SELECT

DROP POLICY IF EXISTS "Authenticated users can read beneficiaries" ON nhis_beneficiaries;

-- Scoped SELECT: clinical staff and approvers only.
-- Hospital users search beneficiaries via the search_beneficiaries RPC
-- which uses SECURITY DEFINER and enforces its own query limits.
CREATE POLICY "Only clinical staff can read beneficiaries"
  ON nhis_beneficiaries FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'nurse'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'utilization_manager'::app_role)
    OR has_role(auth.uid(), 'utilization_manager_lead'::app_role)
  );
