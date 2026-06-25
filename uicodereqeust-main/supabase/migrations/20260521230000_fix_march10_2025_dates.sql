-- Fix 33 codes: Excel Date = 03/10/2025 (March 10, 2025) but DB showed 19/05/2026 or 2025-10-03
BEGIN;

ALTER TABLE public.authorization_requests
  DISABLE TRIGGER protect_approved_authorization_requests_trigger;

UPDATE public.authorization_requests AS r
SET created_at = '2025-03-10T12:00:00.000Z'::timestamptz
FROM (VALUES
  ('R/YG/011043166'),
  ('R/YG/011043162'),
  ('R/AO/011043158'),
  ('R/AO/011043157'),
  ('R/AO/011043155'),
  ('R/AO/011043153'),
  ('R/AO/011043150'),
  ('R/AO/011043148'),
  ('R/AO/011043146'),
  ('R/AO/011043142'),
  ('R/AO/011043141'),
  ('R/AO/011043139'),
  ('R/AO/011043136'),
  ('R/AO/011043133'),
  ('R/AO/011043131'),
  ('R/AO/011043129'),
  ('R/AO/011043127'),
  ('R/AO/011043124'),
  ('R/AO/011043121'),
  ('R/AO/011043120'),
  ('R/AO/011043118'),
  ('R/AO/011043114'),
  ('R/AO/011043112'),
  ('R/AO/011043110'),
  ('R/AO/011043109'),
  ('R/AO/011043107'),
  ('R/AO/011043105'),
  ('R/AO/011043104'),
  ('R/AO/011043102'),
  ('R/AO/011043101'),
  ('R/AO/011043098'),
  ('R/AO/011043096'),
  ('R/AO/011043095')
) AS f(auth_code)
WHERE r.authorization_code = f.auth_code;

ALTER TABLE public.authorization_requests
  ENABLE TRIGGER protect_approved_authorization_requests_trigger;

COMMIT;
