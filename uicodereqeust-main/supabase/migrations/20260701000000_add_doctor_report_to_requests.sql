-- Add doctor_report_url to authorization_requests for storing uploaded diagnosis/report documents

ALTER TABLE public.authorization_requests
  ADD COLUMN IF NOT EXISTS doctor_report_url TEXT;

COMMENT ON COLUMN public.authorization_requests.doctor_report_url IS 'URL/path to uploaded doctor report or diagnosis form document';