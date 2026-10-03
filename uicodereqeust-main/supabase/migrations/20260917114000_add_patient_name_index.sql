-- Add index on patient_name to make name-prefix history searches sub-millisecond
CREATE INDEX IF NOT EXISTS idx_authorization_requests_patient_name 
  ON public.authorization_requests (patient_name);
