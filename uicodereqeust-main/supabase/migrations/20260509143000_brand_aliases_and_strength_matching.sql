-- Common brand aliases for NHIA medicine matching.

BEGIN;

INSERT INTO public.abbreviations (shorthand, item_code, confidence)
VALUES
  ('COZAAR', 'NHIA-12-04-48', 'high'),
  ('GLUCOPHAGE', 'NHIA-17-06-21', 'high'),
  ('NORVASC', 'NHIA-12-04-03', 'high'),
  ('PANADOL', 'NHIA-02-03-02', 'high'),
  ('NATRILIX', 'NHIA-12-04-31', 'high'),
  ('VENTOLIN', 'NHIA-24-01-09', 'high'),
  ('MICARDIS', 'NHIA-12-04-81', 'high'),
  ('ADALAT', 'NHIA-12-04-59', 'medium')
ON CONFLICT (lower(shorthand), item_code) DO NOTHING;

INSERT INTO public.abbreviations (shorthand, item_code, confidence)
SELECT 'AUGMENTIN', code, 'medium'
FROM public.nhia_items
WHERE name ILIKE '%clavulanic%'
  AND is_active = true
ORDER BY
  CASE WHEN name ILIKE '%1g%' THEN 0 ELSE 1 END,
  amount DESC
LIMIT 1
ON CONFLICT (lower(shorthand), item_code) DO NOTHING;

INSERT INTO public.abbreviations (shorthand, item_code, confidence)
SELECT 'DIOVAN', code, 'medium'
FROM public.nhia_items
WHERE name ILIKE '%Valsartan%'
  AND name NOT ILIKE '%Amlodipine%'
  AND is_active = true
ORDER BY amount DESC, code
LIMIT 1
ON CONFLICT (lower(shorthand), item_code) DO NOTHING;

UPDATE public.nhia_items
SET common_abbreviations = array(
  SELECT DISTINCT value
  FROM unnest(COALESCE(common_abbreviations, '{}'::text[]) || ARRAY['COZAAR']) AS value
)
WHERE code = 'NHIA-12-04-48';

UPDATE public.nhia_items
SET common_abbreviations = array(
  SELECT DISTINCT value
  FROM unnest(COALESCE(common_abbreviations, '{}'::text[]) || ARRAY['GLUCOPHAGE']) AS value
)
WHERE code = 'NHIA-17-06-21';

UPDATE public.nhia_items
SET common_abbreviations = array(
  SELECT DISTINCT value
  FROM unnest(COALESCE(common_abbreviations, '{}'::text[]) || ARRAY['NORVASC']) AS value
)
WHERE code = 'NHIA-12-04-03';

UPDATE public.nhia_items
SET common_abbreviations = array(
  SELECT DISTINCT value
  FROM unnest(COALESCE(common_abbreviations, '{}'::text[]) || ARRAY['PANADOL']) AS value
)
WHERE code = 'NHIA-02-03-02';

UPDATE public.nhia_items
SET common_abbreviations = array(
  SELECT DISTINCT value
  FROM unnest(COALESCE(common_abbreviations, '{}'::text[]) || ARRAY['NATRILIX']) AS value
)
WHERE code = 'NHIA-12-04-31';

UPDATE public.nhia_items
SET common_abbreviations = array(
  SELECT DISTINCT value
  FROM unnest(COALESCE(common_abbreviations, '{}'::text[]) || ARRAY['VENTOLIN']) AS value
)
WHERE code = 'NHIA-24-01-09';

COMMIT;
