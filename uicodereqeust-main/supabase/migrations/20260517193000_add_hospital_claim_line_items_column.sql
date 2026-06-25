ALTER TABLE public.hospital_claims
  ADD COLUMN IF NOT EXISTS line_items JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.hospital_claims
SET line_items = approved_items
WHERE (line_items IS NULL OR line_items = '[]'::jsonb)
  AND approved_items IS NOT NULL
  AND approved_items <> '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
