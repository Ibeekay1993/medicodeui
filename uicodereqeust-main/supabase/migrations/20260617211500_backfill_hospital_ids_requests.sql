-- ─────────────────────────────────────────────────────────
-- 1a. General backfill matching exact names (Fast index lookup)
-- ─────────────────────────────────────────────────────────
UPDATE public.authorization_requests
SET hospital_id = h.id
FROM public.hospitals h
WHERE public.authorization_requests.hospital_id IS NULL
  AND public.authorization_requests.hospital_name = h.name;

-- ─────────────────────────────────────────────────────────
-- 1b. General backfill matching code substrings (Only on remaining unresolved rows)
-- ─────────────────────────────────────────────────────────
UPDATE public.authorization_requests
SET hospital_id = h.id
FROM public.hospitals h
WHERE public.authorization_requests.hospital_id IS NULL
  AND h.code IS NOT NULL 
  AND h.code <> '' 
  AND public.authorization_requests.hospital_name ILIKE '%' || h.code || '%';

-- ─────────────────────────────────────────────────────────
-- 2. Special fuzzy backfill for University Health Service (UHS/Jaja Clinic)
-- ─────────────────────────────────────────────────────────
UPDATE public.authorization_requests
SET hospital_id = h.id
FROM public.hospitals h
WHERE public.authorization_requests.hospital_id IS NULL
  AND h.code IN ('OY/0267/P', 'OY/0252/P', 'UHS-003')
  AND (
    public.authorization_requests.hospital_name ILIKE '%jaja%'
    OR public.authorization_requests.hospital_name ILIKE '%uhs%'
    OR public.authorization_requests.hospital_name ILIKE '%university health%'
  );

-- ─────────────────────────────────────────────────────────
-- 3. Sync requesting_hospital_id
-- ─────────────────────────────────────────────────────────
UPDATE public.authorization_requests
SET requesting_hospital_id = hospital_id
WHERE requesting_hospital_id IS NULL
  AND hospital_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────
-- 4. Sync claiming_hospital_id
-- ─────────────────────────────────────────────────────────
UPDATE public.authorization_requests
SET claiming_hospital_id = hospital_id
WHERE claiming_hospital_id IS NULL
  AND hospital_id IS NOT NULL;
