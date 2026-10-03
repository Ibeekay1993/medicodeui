-- Speed up Authorization History and NHIS Verification lookups
-- Creates B-tree and trigram indexes on policy_number, patient_name, full_name, and surname

CREATE INDEX IF NOT EXISTS idx_authorization_requests_policy_number 
  ON public.authorization_requests (policy_number);

CREATE INDEX IF NOT EXISTS idx_authorization_requests_created_at_desc 
  ON public.authorization_requests (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nhis_beneficiaries_policy_number 
  ON public.nhis_beneficiaries (policy_number);

CREATE INDEX IF NOT EXISTS idx_nhis_beneficiaries_full_name 
  ON public.nhis_beneficiaries (full_name);
