-- Indexes for Authorization Requests
CREATE INDEX IF NOT EXISTS idx_auth_req_status ON public.authorization_requests(status);
CREATE INDEX IF NOT EXISTS idx_auth_req_hospital_id ON public.authorization_requests(hospital_id);
CREATE INDEX IF NOT EXISTS idx_auth_req_created_at ON public.authorization_requests(created_at DESC);

-- Indexes for Hospital Claims
CREATE INDEX IF NOT EXISTS idx_hosp_claims_status ON public.hospital_claims(status);
CREATE INDEX IF NOT EXISTS idx_hosp_claims_hospital_id ON public.hospital_claims(hospital_id);
CREATE INDEX IF NOT EXISTS idx_hosp_claims_created_at ON public.hospital_claims(created_at DESC);

-- Indexes for Patients
CREATE INDEX IF NOT EXISTS idx_patients_policy_number ON public.patients(policy_number);

-- Indexes for Audit Logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON public.audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- Indexes for Authorization Logs
CREATE INDEX IF NOT EXISTS idx_auth_logs_request_id ON public.authorization_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_auth_logs_created_at ON public.authorization_logs(created_at DESC);
