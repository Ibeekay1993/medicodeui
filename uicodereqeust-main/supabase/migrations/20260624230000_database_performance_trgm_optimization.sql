-- Enable pg_trgm extension for trigram matching
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;

-- Optimize nhis_beneficiaries substring queries (ILIKE '%term%')
CREATE INDEX IF NOT EXISTS idx_nhis_beneficiaries_fullname_trgm 
  ON public.nhis_beneficiaries USING gin (full_name extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_nhis_beneficiaries_policy_trgm 
  ON public.nhis_beneficiaries USING gin (policy_number extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_nhis_beneficiaries_surname_trgm 
  ON public.nhis_beneficiaries USING gin (surname extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_nhis_beneficiaries_firstname_trgm 
  ON public.nhis_beneficiaries USING gin (first_name extensions.gin_trgm_ops);

-- Optimize nhia_items search queries (ILIKE '%term%')
CREATE INDEX IF NOT EXISTS idx_nhia_items_name_trgm 
  ON public.nhia_items USING gin (name extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_nhia_items_code_trgm 
  ON public.nhia_items USING gin (code extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_nhia_items_subcategory_trgm 
  ON public.nhia_items USING gin (subcategory extensions.gin_trgm_ops);
