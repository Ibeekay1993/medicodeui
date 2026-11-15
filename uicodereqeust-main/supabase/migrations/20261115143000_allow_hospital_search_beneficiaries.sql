-- Allow hospitals to search beneficiaries
-- Closes the bug where hospitals could not search enrollees when creating a new request.
--
-- Clinical staff (nurse, admin, utilization_manager) can already SELECT.
-- Hospital users also need SELECT permission to verify enrollee policy numbers when creating requests.

DROP POLICY IF EXISTS "Only clinical staff can read beneficiaries" ON nhis_beneficiaries;
DROP POLICY IF EXISTS "Hospitals and clinical staff can read beneficiaries" ON nhis_beneficiaries;

CREATE POLICY "Hospitals and clinical staff can read beneficiaries"
  ON nhis_beneficiaries FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'hospital'::app_role)
    OR has_role(auth.uid(), 'nurse'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'utilization_manager'::app_role)
    OR has_role(auth.uid(), 'utilization_manager_lead'::app_role)
  );
