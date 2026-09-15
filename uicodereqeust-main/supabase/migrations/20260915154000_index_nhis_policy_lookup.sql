-- The resolver trims imported policy values before comparing them. Index that
-- same expression so exact and family-prefix lookups stay bounded as the
-- registry grows.
CREATE INDEX IF NOT EXISTS nhis_beneficiaries_policy_trim_idx
  ON public.nhis_beneficiaries (btrim(policy_number) text_pattern_ops);
