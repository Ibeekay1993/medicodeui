-- Targeted Excel date fix (74 auth codes + OLABODE 80127512)
BEGIN;

ALTER TABLE public.authorization_requests
  DISABLE TRIGGER protect_approved_authorization_requests_trigger;

UPDATE public.authorization_requests AS r
SET created_at = f.correct_date
FROM (VALUES
  ('R/AG/011006413BD', '2024-02-16T12:00:00.000Z'::timestamptz),
  ('R/AG/011006417BD', '2024-02-19T12:00:00.000Z'::timestamptz),
  ('R/AG/011006427BD', '2024-02-20T12:00:00.000Z'::timestamptz),
  ('R/AG/011006436BD', '2024-02-20T12:00:00.000Z'::timestamptz),
  ('R/AG/011006442BD', '2024-02-21T12:00:00.000Z'::timestamptz),
  ('R/AG/011006470BD', '2024-02-22T12:00:00.000Z'::timestamptz),
  ('R/AG/011006477BD', '2024-02-26T12:00:00.000Z'::timestamptz),
  ('R/AG/011006482BD', '2024-02-26T12:00:00.000Z'::timestamptz),
  ('R/AG/011006490BD', '2024-02-27T12:00:00.000Z'::timestamptz),
  ('R/AG/011006498BD', '2024-02-27T12:00:00.000Z'::timestamptz),
  ('R/AG/011006506BD', '2024-02-28T12:00:00.000Z'::timestamptz),
  ('R/AG/011006514BD', '2024-02-28T12:00:00.000Z'::timestamptz),
  ('R/AG/011006517BD', '2024-02-28T12:00:00.000Z'::timestamptz),
  ('R/AG/011006519BD', '2024-02-28T12:00:00.000Z'::timestamptz),
  ('R/AG/011006525BD', '2024-02-29T12:00:00.000Z'::timestamptz),
  ('R/AG/011006529BD', '2024-02-29T12:00:00.000Z'::timestamptz),
  ('R/AG/011006548BD', '2024-03-04T12:00:00.000Z'::timestamptz),
  ('R/AG/011006550BD', '2024-03-04T12:00:00.000Z'::timestamptz),
  ('R/AG/011006558BD', '2024-03-05T12:00:00.000Z'::timestamptz),
  ('R/AG/011006565BD', '2024-03-05T12:00:00.000Z'::timestamptz),
  ('R/AG/011006569BD', '2024-03-06T12:00:00.000Z'::timestamptz),
  ('R/AG/011006578BD', '2024-03-06T12:00:00.000Z'::timestamptz),
  ('R/AG/011006581BD', '2024-03-06T12:00:00.000Z'::timestamptz),
  ('R/AG/011006590BD', '2024-03-07T12:00:00.000Z'::timestamptz),
  ('R/AG/011006591BD', '2024-03-07T12:00:00.000Z'::timestamptz),
  ('R/AG/011006592BD', '2024-03-07T12:00:00.000Z'::timestamptz),
  ('R/AG/011006593BD', '2024-03-07T12:00:00.000Z'::timestamptz),
  ('R/AG/011006596BD', '2024-03-08T12:00:00.000Z'::timestamptz),
  ('R/AG/011006599BD', '2024-03-08T12:00:00.000Z'::timestamptz),
  ('R/AG/011006609BD', '2024-03-11T12:00:00.000Z'::timestamptz),
  ('R/AG/011006614BD', '2024-03-11T12:00:00.000Z'::timestamptz),
  ('R/AG/011006631BD', '2024-03-12T12:00:00.000Z'::timestamptz),
  ('R/AG/011006641BD', '2024-03-13T12:00:00.000Z'::timestamptz),
  ('R/AG/011006642BD', '2024-03-13T12:00:00.000Z'::timestamptz),
  ('R/AG/011006676BD', '2024-03-15T12:00:00.000Z'::timestamptz),
  ('R/AG/011006679BD', '2024-03-17T12:00:00.000Z'::timestamptz),
  ('R/AG/011006684BD', '2024-03-19T12:00:00.000Z'::timestamptz),
  ('R/AG/011006685BD', '2024-03-19T12:00:00.000Z'::timestamptz),
  ('R/AG/011006695BD', '2024-03-21T12:00:00.000Z'::timestamptz),
  ('R/AG/011006697BD', '2024-03-25T12:00:00.000Z'::timestamptz),
  ('R/AG/011006703BD', '2024-03-25T12:00:00.000Z'::timestamptz),
  ('R/AG/011006708BD', '2024-03-25T12:00:00.000Z'::timestamptz),
  ('R/AG/011006711BD', '2024-03-25T12:00:00.000Z'::timestamptz),
  ('R/AG/011006715BD', '2024-03-26T12:00:00.000Z'::timestamptz),
  ('R/AG/011006753BD', '2024-03-28T12:00:00.000Z'::timestamptz),
  ('R/AG/011006769BD', '2024-04-02T12:00:00.000Z'::timestamptz),
  ('R/AG/011006772BD', '2024-04-03T12:00:00.000Z'::timestamptz),
  ('R/AG/011006776BD', '2024-04-03T12:00:00.000Z'::timestamptz),
  ('R/AG/011006777BD', '2024-04-03T12:00:00.000Z'::timestamptz),
  ('R/AG/011006786BD', '2024-04-04T12:00:00.000Z'::timestamptz),
  ('R/AG/011006804BD', '2024-04-05T12:00:00.000Z'::timestamptz),
  ('R/AG/011006817BD', '2024-04-12T12:00:00.000Z'::timestamptz),
  ('R/AG/011006820BD', '2024-04-12T12:00:00.000Z'::timestamptz),
  ('R/AG/011006834BD', '2024-04-15T12:00:00.000Z'::timestamptz),
  ('R/AG/011006844BD', '2024-04-15T12:00:00.000Z'::timestamptz),
  ('R/AG/011006850BD', '2024-04-16T12:00:00.000Z'::timestamptz),
  ('R/AG/011006853BD', '2024-04-16T12:00:00.000Z'::timestamptz),
  ('R/AG/011006865BD', '2024-04-17T12:00:00.000Z'::timestamptz),
  ('R/AG/011006875BD', '2024-04-17T12:00:00.000Z'::timestamptz),
  ('R/AG/011006917BD', '2024-04-22T12:00:00.000Z'::timestamptz),
  ('R/AG/011006918BD', '2024-04-22T12:00:00.000Z'::timestamptz),
  ('R/AG/011006925BD', '2024-04-23T12:00:00.000Z'::timestamptz),
  ('R/AG/011006935BD', '2024-04-23T12:00:00.000Z'::timestamptz),
  ('R/AG/011006951BD', '2024-04-24T12:00:00.000Z'::timestamptz),
  ('R/AG/011006952BD', '2024-04-24T12:00:00.000Z'::timestamptz),
  ('R/AG/011006955BD', '2024-04-25T12:00:00.000Z'::timestamptz),
  ('R/AG/011006964BD', '2024-04-26T12:00:00.000Z'::timestamptz),
  ('R/AG/011007008BD', '2024-05-14T12:00:00.000Z'::timestamptz),
  ('R/AG/011007021BD', '2024-06-10T12:00:00.000Z'::timestamptz),
  ('R/AG/011007022BD', '2024-06-11T12:00:00.000Z'::timestamptz),
  ('R/AG/011007155BD', '2025-04-14T12:00:00.000Z'::timestamptz),
  ('R/AG/011007261BD', '2026-03-10T12:00:00.000Z'::timestamptz),
  ('R/AG/011007353BD', '2026-03-13T12:00:00.000Z'::timestamptz),
  ('R/OE/011015377', '2023-03-06T12:00:00.000Z'::timestamptz)
) AS f(auth_code, correct_date)
WHERE r.authorization_code = f.auth_code;

-- OLABODE OLABODE 80127512: Excel 19/02/2024 (was 19/05/2026)
UPDATE public.authorization_requests
SET created_at = '2024-02-19T12:00:00.000Z'::timestamptz
WHERE policy_number = '80127512'
  AND patient_name ILIKE '%OLUSHOLA OLABODE%'
  AND (authorization_code IS NULL OR authorization_code = '')
  AND created_at::date = '2026-05-19'::date;

ALTER TABLE public.authorization_requests
  ENABLE TRIGGER protect_approved_authorization_requests_trigger;

COMMIT;
