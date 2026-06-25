DO $$
DECLARE
  beneficiary_count integer;
BEGIN
  SELECT count(*) INTO beneficiary_count
  FROM public.nhis_beneficiaries;

  IF beneficiary_count <> 79436 THEN
    RAISE EXCEPTION 'May 2026 NHIS import verification failed. Expected 79436 rows, found %.', beneficiary_count;
  END IF;
END;
$$;
