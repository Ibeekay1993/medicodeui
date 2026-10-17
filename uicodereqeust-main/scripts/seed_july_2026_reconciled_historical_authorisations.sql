-- ============================================================================
-- MIGRATION: 20261017103000_seed_july_2026_reconciled_historical_authorisations.sql
-- Description: Reconciled historical pre-authorisations with NHIA tariffs (July 2026)
-- Source: july ao.xlsx (256 records, 251 approved, 4 declined, 1 pending)
-- Authorisations populate public.authorization_requests for Payment Advice Schedule
-- Does NOT create premature paid claims in hospital_claims or payment_batches
-- ============================================================================

BEGIN;

-- Temporarily disable intake-path trigger to allow direct historical seeding
ALTER TABLE public.authorization_requests DISABLE TRIGGER USER;

-- 1. Identify primary hospital IDs
DO $$
DECLARE
  v_jaja_id UUID;
  v_uch_id UUID;
  v_police_id UUID;
  v_ab10_id UUID;
  v_admin_id UUID;
BEGIN
  -- Look up Jaja Health Clinic
  SELECT id INTO v_jaja_id FROM public.hospitals
  WHERE code IN ('OY/0252/P', 'OY/0267/P', 'UHS-003') OR name ILIKE '%jaja%' OR name ILIKE '%university health%'
  LIMIT 1;

  -- Look up UCH
  SELECT id INTO v_uch_id FROM public.hospitals
  WHERE code = 'OY/0001/P' OR name ILIKE '%university college hospital%'
  LIMIT 1;

  -- Look up Police Clinic Eleyele
  SELECT id INTO v_police_id FROM public.hospitals
  WHERE code = 'OY/0231/P' OR name ILIKE '%police clinic%'
  LIMIT 1;

  -- Look up A.B. 10 Hospital
  SELECT id INTO v_ab10_id FROM public.hospitals
  WHERE code = 'LA/1283/P' OR name ILIKE '%a.b. 10%' OR name ILIKE '%ab 10%'
  LIMIT 1;

  -- Pick first admin as fallback audit actor
  SELECT user_id INTO v_admin_id FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_admin_id IS NULL THEN
    SELECT id INTO v_admin_id FROM auth.users LIMIT 1;
  END IF;

  -- Row 1: DARAMOLA FOLARIN (R/AO/19062671BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062671BD', 'R/AO/19062671BD', 'DARAMOLA FOLARIN', '1639633', 'HYPERTENSION', 'Tab losartan 50mg dly x 1/12 (30 TABLETS)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-49","name":"Losartan 50mg Tablet Tablet 50mg Tablet","quantity":30,"unit_price":100,"amount":3000,"confidence":"high","source_term":"Tab losartan 50mg dly x 1/12 (30 TABLETS)"}]'::jsonb, 3000, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 2: SANNI ADETUTU (R/AO/19062672BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062672BD', 'R/AO/19062672BD', 'SANNI ADETUTU', '1637962', 'Hypertension , dyslipidaemia', 'Tab Methyldopa 250mg B.D x 1/12, Tab Amiloride+ hydrochlorothiazide T dly x 1/12, Tab Atorvastatin 10mg nocte x 1/12 (30 tabs each )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-51","name":"Methyldopa Tablet 500mg Tablet","quantity":60,"unit_price":69,"amount":4140,"confidence":"medium","source_term":"Tab Methyldopa 250mg B.D x 1/12"},{"code":"NHIA-12-03-01","name":"Amiloride + Hydrochlorothiazide Tablet 5mg+ 50mg Tab","quantity":30,"unit_price":36,"amount":1080,"confidence":"high","source_term":"Tab Amiloride+ hydrochlorothiazide T dly x 1/12"},{"code":"NHIA-12-06-01","name":"Atorvastatin Tab/Caps 10mg Tab/ Cap.","quantity":30,"unit_price":122,"amount":3660,"confidence":"high","source_term":"Tab Atorvastatin 10mg nocte x 1/12 (30 tabs each )"}]'::jsonb, 8880, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 3: OLUYEMISI SHITTU (R/AO/19062673BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062673BD', 'R/AO/19062673BD', 'OLUYEMISI SHITTU', '2872895', 'nephropathy', 'FOLLOW UP',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-002","name":"Specialist Review (Per visit)","quantity":1,"unit_price":2600,"amount":2600,"confidence":"high","source_term":"FOLLOW UP"}]'::jsonb, 2600, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 4: Bello Jelili oyebode (R/AO/19062674BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062674BD', 'R/AO/19062674BD', 'Bello Jelili oyebode', '2173438', 'Diabetes mellitus+ Hypertension+ dyslipidemia', 'Tab Metformin 500mg T dly x 1/12, Tab Rosuvastatin 10mg dly x 1/12 (30 TAB EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-17-06-22","name":"Metformin Tablets 500mg","quantity":30,"unit_price":130,"amount":3900,"confidence":"high","source_term":"Tab Metformin 500mg T dly x 1/12"},{"code":"NHIA-12-06-07","name":"Rosuvastatin Tab/Caps 10mg Tab/ Cap.","quantity":30,"unit_price":212,"amount":6360,"confidence":"high","source_term":"Tab Rosuvastatin 10mg dly x 1/12 (30 TAB EACH)"}]'::jsonb, 10260, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 5: Bello Abdulraheem mayowa (R/AO/19062675BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062675BD', 'R/AO/19062675BD', 'Bello Abdulraheem mayowa', '2173438', 'Hypertension', 'Tab losartan 50mg dly x 1/12 (30 TABS )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-49","name":"Losartan 50mg Tablet Tablet 50mg Tablet","quantity":30,"unit_price":100,"amount":3000,"confidence":"high","source_term":"Tab losartan 50mg dly x 1/12 (30 TABS )"}]'::jsonb, 3000, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 6: Awe Janet Titilayo (R/AO/19062676BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062676BD', 'R/AO/19062676BD', 'Awe Janet Titilayo', '2173495', 'Palpitations? Cause', 'ECG',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-040-008","name":"Electrocardiography (ECG)","quantity":1,"unit_price":10000,"amount":10000,"confidence":"high","source_term":"ECG"}]'::jsonb, 10000, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 7: Patrick Peace Uchechi (R/AO/19062677BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062677BD', 'R/AO/19062677BD', 'Patrick Peace Uchechi', '2872477', 'Right inguinal hernia', 'FOLLOW UP',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-002","name":"Specialist Review (Per visit)","quantity":1,"unit_price":2600,"amount":2600,"confidence":"high","source_term":"FOLLOW UP"}]'::jsonb, 2600, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 8: Olatunbosun Julius (R/AO/19062678BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062678BD', 'R/AO/19062678BD', 'Olatunbosun Julius', '2556961', 'Presbyopia', 'consultation, manual refraction, direct ophthalmoscopy, glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 31000, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 9: Akorede Joledo (R/AO/19062679BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062679BD', 'R/AO/19062679BD', 'Akorede Joledo', '7841680', 'Presbyopia', 'consultation, manual refraction, direct ophthalmoscopy, glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 31000, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 10: Eduviere Gladys (R/AO/19062680BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062680BD', 'R/AO/19062680BD', 'Eduviere Gladys', '2873391', 'Lumbar Spondylosis', '3 physiotherapy sessions',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-133-005","name":"Physiotherapy (3 Sessions)","quantity":3,"unit_price":7500,"amount":22500,"confidence":"high","source_term":"3 physiotherapy sessions"}]'::jsonb, 22500, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 11: Alawode Olubunmi (R/AO/19062681BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062681BD', 'R/AO/19062681BD', 'Alawode Olubunmi', '2872373', 'HTN + DM', 'HbAlc, E/U/CR',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-181-046","name":"Glycated Hemoglobin (HbA1c)","quantity":1,"unit_price":10000,"amount":10000,"confidence":"high","source_term":"HbAlc"},{"code":"NHIA-181-030","name":"Electrolytes, Urea and Creatinine","quantity":1,"unit_price":9000,"amount":9000,"confidence":"high","source_term":"E/U/CR"}]'::jsonb, 19000, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 12: Tolu Ososanya (R/AO/19062682BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062682BD', 'R/AO/19062682BD', 'Tolu Ososanya', '2872869', 'Hypertension', 'Losartan 25mg dly x 1/12 (30 tabs)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-48","name":"Losartan 25mg Tablet Tablet 25mg Tablet","quantity":30,"unit_price":108,"amount":3240,"confidence":"high","source_term":"Losartan 25mg dly x 1/12 (30 tabs)"}]'::jsonb, 3240, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 13: Alawode Olubunmi (R/AO/19062683BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062683BD', 'R/AO/19062683BD', 'Alawode Olubunmi', '2872373', 'HTN + DM', 'Amlodipine 10mg dly x 1/12, lisinopril 10mg dly x 1/12, metformin 1000mg dly x 1/12, vasoprin 75mg dly x 1/12 (30 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10mg dly x 1/12"},{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"lisinopril 10mg dly x 1/12"},{"code":"NHIA-17-06-21","name":"Metformin Tablets 1000mg","quantity":30,"unit_price":106,"amount":3180,"confidence":"high","source_term":"metformin 1000mg dly x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"vasoprin 75mg dly x 1/12 (30 TABS EACH)"}]'::jsonb, 7950, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 14: Amaze Enoch (R/AO/19062684BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062684BD', 'R/AO/19062684BD', 'Amaze Enoch', '2173493', 'Right humeral fracture', 'specialist consultation',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"specialist consultation"}]'::jsonb, 4000, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 15: Alawode Olusola (R/AO/19062685BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062685BD', 'R/AO/19062685BD', 'Alawode Olusola', '2872373', 'HTN', 'Rosuvastatin 20mg nocte x 1/12, Amlodipine 10mg dly x 1/12, Lisinopril 10mg dly x 1/12 (30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-06-08","name":"Rosuvastatin Tab/Caps 20mg Tab/ Cap.","quantity":30,"unit_price":210,"amount":6300,"confidence":"high","source_term":"Rosuvastatin 20mg nocte x 1/12"},{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10mg dly x 1/12"},{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"Lisinopril 10mg dly x 1/12 (30 TABS EACH )"}]'::jsonb, 10740, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 16: Alawode Olusola (R/AO/19062686BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062686BD', 'R/AO/19062686BD', 'Alawode Olusola', '2872373', 'HTN + DM + BPH', 'HBA1C, E/U/CR, PSA.',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-181-046","name":"Glycated Hemoglobin (HbA1c)","quantity":1,"unit_price":10000,"amount":10000,"confidence":"high","source_term":"HBA1C"},{"code":"NHIA-181-030","name":"Electrolytes, Urea and Creatinine","quantity":1,"unit_price":9000,"amount":9000,"confidence":"high","source_term":"E/U/CR"},{"code":"NHIA-181-082","name":"Prostate Specific Antigen (PSA): (a - b)","quantity":1,"unit_price":15000,"amount":15000,"confidence":"high","source_term":"PSA."}]'::jsonb, 34000, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 17: Adetoye Daniel (R/AO/19062687BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062687BD', 'R/AO/19062687BD', 'Adetoye Daniel', '1639197', 'HTN, DM', 'Tab Metformin 500mg bd x 1/12, Tab glimepiride 4mg x 1 1/12, Tab Indapamide 1.5mg x 1/12, Tab Lisinopril 10mg x 1/12, Tab Nifedipine 20mg x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-17-06-22","name":"Metformin Tablets 500mg","quantity":60,"unit_price":130,"amount":7800,"confidence":"high","source_term":"Tab Metformin 500mg bd x 1/12"},{"code":"NHIA-17-06-19","name":"Glimepiride Tab 4mg","quantity":30,"unit_price":128,"amount":3840,"confidence":"high","source_term":"Tab glimepiride 4mg x 1 1/12"},{"code":"NHIA-12-04-31","name":"Indapamide 1.5mg tab Tab 1.5mg Tab","quantity":30,"unit_price":310,"amount":9300,"confidence":"high","source_term":"Tab Indapamide 1.5mg x 1/12"},{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"Tab Lisinopril 10mg x 1/12"},{"code":"NHIA-12-04-59","name":"Nifedipine Tablet, 20mg Tab.","quantity":30,"unit_price":67,"amount":2010,"confidence":"high","source_term":"Tab Nifedipine 20mg x 1/12"}]'::jsonb, 25290, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 18: Isamakinde Claudius Akin (R/AO/19062688BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062688BD', 'R/AO/19062688BD', 'Isamakinde Claudius Akin', '2873282', 'Refractive error', 'consultation, manual refraction, D.O, Tonometry,glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-003","name":"Tonometry (Pulsair/Goldmann Applanation)","quantity":1,"unit_price":4562.5,"amount":4562.5,"confidence":"high","source_term":"Tonometry"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 35562.5, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 19: Nwokocha Kate (R/AO/19062689BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062689BD', 'R/AO/19062689BD', 'Nwokocha Kate', '1637527', 'Neuropathy', 'specialist consultation',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"specialist consultation"}]'::jsonb, 4000, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 20: Ojedele Ayokunnu (R/AO/19062690BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062690BD', 'R/AO/19062690BD', 'Ojedele Ayokunnu', '1638519', 'HTN , Dyslipidaemia', 'atorvastatin 10mg dly x 1/12, Nifedipine 20mg bd x 1/12, HCT 25mg dly x 1/12 (30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-06-01","name":"Atorvastatin Tab/Caps 10mg Tab/ Cap.","quantity":30,"unit_price":122,"amount":3660,"confidence":"high","source_term":"atorvastatin 10mg dly x 1/12"},{"code":"NHIA-12-04-59","name":"Nifedipine Tablet, 20mg Tab.","quantity":60,"unit_price":67,"amount":4020,"confidence":"high","source_term":"Nifedipine 20mg bd x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"HCT 25mg dly x 1/12 (30 TABS EACH )"}]'::jsonb, 8880, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 21: Okunlola Justina (R/AO/19062691BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062691BD', 'R/AO/19062691BD', 'Okunlola Justina', '2872766', 'Diabetes mellitus, Hypertension', 'Tab metformin 1000mg BD x 1/12, Lisinopril 10mg dly x 1/12, Amlodipine 10mg x 1/12, Acetylsalicylic acid 75mg dly x 1/12, Glimepiride 2mg dly x 1/12 (30 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-17-06-21","name":"Metformin Tablets 1000mg","quantity":60,"unit_price":106,"amount":6360,"confidence":"high","source_term":"Tab metformin 1000mg BD x 1/12"},{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"Lisinopril 10mg dly x 1/12"},{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10mg x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Acetylsalicylic acid 75mg dly x 1/12"},{"code":"NHIA-17-06-18","name":"Glimepiride Tab 2mg","quantity":30,"unit_price":102,"amount":3060,"confidence":"high","source_term":"Glimepiride 2mg dly x 1/12 (30 TABS EACH)"}]'::jsonb, 14190, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 22: Obakoya Modupe (R/AO/19062692BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062692BD', 'R/AO/19062692BD', 'Obakoya Modupe', '2872739', 'HTN', 'Lisinopril 10mg dly x 1/12, Amlodipine 5mg x 1/12, Vasoprin 75mg dly x 1/12 (30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"Lisinopril 10mg dly x 1/12"},{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Amlodipine 5mg x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Vasoprin 75mg dly x 1/12 (30 TABS EACH )"}]'::jsonb, 4410, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 23: Glory Dauda (R/AO/19062693BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062693BD', 'R/AO/19062693BD', 'Glory Dauda', '2872776', 'HTN', 'Tab Amlodipine 10mg x 1/12 (30 TABS',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Tab Amlodipine 10mg x 1/12 (30 TABS"}]'::jsonb, 2100, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 24: Adediji Aderemi (R/AO/19062694BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062694BD', 'R/AO/19062694BD', 'Adediji Aderemi', '2870768', 'HTN and DM', 'Losartan 50mg dly x 1/12, Clopidogrel 75mg dly x 1/12, Amlodipine 10mg dly x 1/12, rosuvastatin 10mg dly x 1/12, Metformin 1000mg BD x 1/12 (30 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-49","name":"Losartan 50mg Tablet Tablet 50mg Tablet","quantity":30,"unit_price":100,"amount":3000,"confidence":"high","source_term":"Losartan 50mg dly x 1/12"},{"code":"NHIA-11-03-04","name":"Clopidogrel Tablet 75mg Tab.","quantity":30,"unit_price":190,"amount":5700,"confidence":"high","source_term":"Clopidogrel 75mg dly x 1/12"},{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10mg dly x 1/12"},{"code":"NHIA-12-06-07","name":"Rosuvastatin Tab/Caps 10mg Tab/ Cap.","quantity":30,"unit_price":212,"amount":6360,"confidence":"high","source_term":"rosuvastatin 10mg dly x 1/12"},{"code":"NHIA-17-06-21","name":"Metformin Tablets 1000mg","quantity":30,"unit_price":106,"amount":3180,"confidence":"high","source_term":"Metformin 1000mg BD x 1/12 (30 TABS EACH)"}]'::jsonb, 20340, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 25: Adediji Kate (R/AO/19062695BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062695BD', 'R/AO/19062695BD', 'Adediji Kate', '2870768', 'HTN and DM', 'Losartan 25mg dly x 1/12 Amlodipine 10mg dly x 1/12 clopidogrel 75mg dly x 1/12, Metformin 500mg Dly x 1/12, Lantus insulin 1 pen',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-11-03-04","name":"Clopidogrel Tablet 75mg Tab.","quantity":30,"unit_price":190,"amount":5700,"confidence":"high","source_term":"Losartan 25mg dly x 1/12 Amlodipine 10mg dly x 1/12 clopidogrel 75mg dly x 1/12"},{"code":"NHIA-17-06-22","name":"Metformin Tablets 500mg","quantity":30,"unit_price":130,"amount":3900,"confidence":"high","source_term":"Metformin 500mg Dly x 1/12"},{"code":"NHIA-17-06-03","name":"Insulin Soluble Injection 100 units/ml Vial","quantity":1,"unit_price":12474,"amount":12474,"confidence":"high","source_term":"Lantus insulin 1 pen"}]'::jsonb, 22074, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 26: Dokpesi Nupheisetu (R/AO/19062696BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062696BD', 'R/AO/19062696BD', 'Dokpesi Nupheisetu', '1639203', 'Refractive Error', 'consultation, manual refraction, Direct ophthalmoscopy ,glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 31000, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 27: WILLIAM ODEGA (R/AO/19062697BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062697BD', 'R/AO/19062697BD', 'WILLIAM ODEGA', '2556974', 'Good BP control', 'Hydrochlorothiazide 25mg dly x 1/12, Acetylsalicylic acid 75mg dly x 1/12, Amlodipine 10mg dly x 1/12 (30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"Hydrochlorothiazide 25mg dly x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Acetylsalicylic acid 75mg dly x 1/12"},{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10mg dly x 1/12 (30 TABS EACH )"}]'::jsonb, 3630, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 28: ESTHER ODEGA (R/AO/19062698BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062698BD', 'R/AO/19062698BD', 'ESTHER ODEGA', '2556974', 'Good BP control', 'Hydrochlorothiazide 25mg dly x 1/12, Clopidogrel 75mg dly x 1/12, Nifedipine 20mg dly x 1/12 , metoprolol - XL 50mg dly x 1/12 (30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"Hydrochlorothiazide 25mg dly x 1/12"},{"code":"NHIA-11-03-04","name":"Clopidogrel Tablet 75mg Tab.","quantity":30,"unit_price":190,"amount":5700,"confidence":"high","source_term":"Clopidogrel 75mg dly x 1/12"},{"code":"NHIA-12-04-59","name":"Nifedipine Tablet, 20mg Tab.","quantity":30,"unit_price":67,"amount":2010,"confidence":"high","source_term":"Nifedipine 20mg dly x 1/12"},{"code":"NHIA-12-04-56","name":"Metoprolol Tartrate 25mg tab Tablet 50mg Tablet","quantity":30,"unit_price":212,"amount":6360,"confidence":"high","source_term":"metoprolol - XL 50mg dly x 1/12 (30 TABS EACH )"}]'::jsonb, 15270, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 29: OLALEYE HANNAH AYODELE (R/AO/19062699BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO19062699BD', 'R/AO/19062699BD', 'OLALEYE HANNAH AYODELE', '7841923', 'UTERINE FIBROID', 'FOLLOW UP',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-002","name":"Specialist Review (Per visit)","quantity":1,"unit_price":2600,"amount":2600,"confidence":"high","source_term":"FOLLOW UP"}]'::jsonb, 2600, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 30: Jokodola Taiwo (R/AO/190626100BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626100BD', 'R/AO/190626100BD', 'Jokodola Taiwo', '2872629', 'Diabetes Mellitus, Hypertension', 'INSULIN 1 PEN, Ramipril 5mg dly x 1/12 (30 tabs )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-17-06-03","name":"Insulin Soluble Injection 100 units/ml Vial","quantity":1,"unit_price":12474,"amount":12474,"confidence":"high","source_term":"INSULIN 1 PEN"},{"code":"NHIA-12-04-76","name":"Ramipril 5mg Tablet Tablet 5mg Tablet","quantity":30,"unit_price":90,"amount":2700,"confidence":"high","source_term":"Ramipril 5mg dly x 1/12 (30 tabs )"}]'::jsonb, 15174, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 31: Izebu Godwin (R/AO/190626101BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626101BD', 'R/AO/190626101BD', 'Izebu Godwin', '1637673', 'Hypertension', 'Tab Amlodipine 5mg x 1/12 (30 tabs )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Tab Amlodipine 5mg x 1/12 (30 tabs )"}]'::jsonb, 1740, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 32: Baoku Abiola (R/AO/190626102BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626102BD', 'R/AO/190626102BD', 'Baoku Abiola', '7083369-1', '?SECONDARY INFERTILITY', 'SPECIALIST CONSULTATION & SEMEN ANALYSIS',
    v_jaja_id, 'FOREMOST BASE HOSPITAL LIMITED', v_jaja_id, 'FOREMOST BASE HOSPITAL LIMITED',
    NULL, NULL, v_jaja_id, 'FOREMOST BASE HOSPITAL LIMITED',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"SPECIALIST CONSULTATION"},{"code":"NHIA-183-013","name":"a) Semen Analysis","quantity":1,"unit_price":4527.78,"amount":4527.78,"confidence":"high","source_term":"SEMEN ANALYSIS"}]'::jsonb, 8527.779999999999, '2026-07-02T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-02T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 33: Akanni Muraina (R/AO/190626103BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626103BD', 'R/AO/190626103BD', 'Akanni Muraina', '3426601', 'Diabetes+ HTN', 'Lisinopril 5mg dly x 1/12, Amlodipine 5mg dly x 1/12, Metformin 500mg dly x 1/12, Amiloride/Hydrochlorothiazide dly x 1/12 (30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-43","name":"Lisinopril Tablet 2.5mg Tab.","quantity":30,"unit_price":107,"amount":3210,"confidence":"high","source_term":"Lisinopril 5mg dly x 1/12"},{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Amlodipine 5mg dly x 1/12"},{"code":"NHIA-17-06-22","name":"Metformin Tablets 500mg","quantity":30,"unit_price":130,"amount":3900,"confidence":"high","source_term":"Metformin 500mg dly x 1/12"},{"code":"NHIA-12-03-01","name":"Amiloride + Hydrochlorothiazide Tablet 5mg+ 50mg Tab","quantity":30,"unit_price":36,"amount":1080,"confidence":"high","source_term":"Amiloride/Hydrochlorothiazide dly x 1/12 (30 TABS EACH )"}]'::jsonb, 9930, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 34: Babalola Matthew (R/AO/190626104BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626104BD', 'R/AO/190626104BD', 'Babalola Matthew', '7047427', 'Hypertension, Hyperchelestol', 'Tab Amlodipine 10mg dly x 1/12, Tab Losartan 50mg dly x 1/12, Tab Neurovite T b.d x 1/12, Atorvastatin 20mg dly x 1/12, Tab Avsar ( Amlodipine + varsatan )T dly x 1/12 (30 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Tab Amlodipine 10mg dly x 1/12"},{"code":"NHIA-12-04-49","name":"Losartan 50mg Tablet Tablet 50mg Tablet","quantity":30,"unit_price":100,"amount":3000,"confidence":"high","source_term":"Tab Losartan 50mg dly x 1/12"},{"code":"NHIA-25-01-20","name":"Vitamin B Complex Tablets/Capsules Tab.","quantity":60,"unit_price":6,"amount":360,"confidence":"high","source_term":"Tab Neurovite T b.d x 1/12"},{"code":"NHIA-12-06-02","name":"Atorvastatin Tab/Caps 20mg Tab/ Cap.","quantity":30,"unit_price":154,"amount":4620,"confidence":"high","source_term":"Atorvastatin 20mg dly x 1/12"},{"code":"NHIA-12-04-04","name":"Amlodipine + Valsartan Tablet 5 mg + 160mg Tab","quantity":30,"unit_price":280,"amount":8400,"confidence":"high","source_term":"Tab Avsar ( Amlodipine + varsatan )T dly x 1/12 (30 TABS EACH)"}]'::jsonb, 18480, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 35: Bukola Babalola (R/AO/190626105BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626105BD', 'R/AO/190626105BD', 'Bukola Babalola', '7047427', 'HTN, hypercholestrol, seziure', 'clopidogrel T DLY x 1/12, labetalol 200mg b.d x 1/12, Tab Neurovite T b.d x 1/12, Atorvastatin 20mg dly x 1/12, Tab Avsar ( Amlodipine + varsatan )T dly x 1/12, tegretol 200mg b.d x 1/12 (30 tabs each )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-11-03-04","name":"Clopidogrel Tablet 75mg Tab.","quantity":30,"unit_price":190,"amount":5700,"confidence":"high","source_term":"clopidogrel T DLY x 1/12"},{"code":"NHIA-12-04-40","name":"Labetalol Tablet (HCL) 200mg Tab.","quantity":60,"unit_price":318,"amount":19080,"confidence":"high","source_term":"labetalol 200mg b.d x 1/12"},{"code":"NHIA-25-01-20","name":"Vitamin B Complex Tablets/Capsules Tab.","quantity":60,"unit_price":6,"amount":360,"confidence":"high","source_term":"Tab Neurovite T b.d x 1/12"},{"code":"NHIA-12-06-02","name":"Atorvastatin Tab/Caps 20mg Tab/ Cap.","quantity":30,"unit_price":154,"amount":4620,"confidence":"high","source_term":"Atorvastatin 20mg dly x 1/12"},{"code":"NHIA-12-04-04","name":"Amlodipine + Valsartan Tablet 5 mg + 160mg Tab","quantity":30,"unit_price":280,"amount":8400,"confidence":"high","source_term":"Tab Avsar ( Amlodipine + varsatan )T dly x 1/12"},{"code":"NHIA-05-01-01","name":"Carbamazepine Tablet 200mg Tab.","quantity":30,"unit_price":149,"amount":4470,"confidence":"high","source_term":"tegretol 200mg b.d x 1/12 (30 tabs each )"}]'::jsonb, 42630, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 36: Amaze Enoch (DECLINED without code)
  IF NOT EXISTS (SELECT 1 FROM public.authorization_requests WHERE request_id = 'REQ-HIST-0036') THEN
    INSERT INTO public.authorization_requests (
      request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
      hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
      referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
      status, source, is_historical, approved_items, total_amount, decided_at,
      authorized_by_name, submitted_by, decided_by, created_at, updated_at
    ) VALUES (
      'REQ-HIST-0036', NULL, 'Amaze Enoch', '2173493', '? left humeral fracture', 'xray of the left elbow (AP & Lat)',
      v_police_id, 'POLICE CLINIC, AGODI', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
      v_police_id, 'POLICE CLINIC, AGODI', v_police_id, 'POLICE CLINIC, AGODI',
      'declined', 'historical_import', TRUE, '[{"code":"DECLINED","name":"xray of the left elbow (AP & Lat)","quantity":1,"unit_price":0,"amount":0,"confidence":"high","source_term":"xray of the left elbow (AP & Lat)","declined":true}]'::jsonb, 0, '2026-07-03T12:00:00.000Z'::timestamptz,
      'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
    );
  END IF;

  -- Row 37: Akinyele Funso (R/AO/190626106BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626106BD', 'R/AO/190626106BD', 'Akinyele Funso', '2173662', 'Hypertension', 'Tab losartan 50mg x 1/12, Tab amiloride/Hydrochlorothiazide T dly x 1/12 (30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-49","name":"Losartan 50mg Tablet Tablet 50mg Tablet","quantity":30,"unit_price":100,"amount":3000,"confidence":"high","source_term":"Tab losartan 50mg x 1/12"},{"code":"NHIA-12-03-01","name":"Amiloride + Hydrochlorothiazide Tablet 5mg+ 50mg Tab","quantity":30,"unit_price":36,"amount":1080,"confidence":"high","source_term":"Tab amiloride/Hydrochlorothiazide T dly x 1/12 (30 TABS EACH )"}]'::jsonb, 4080, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 38: Babalola Ayomiposi (R/AO/190626107BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626107BD', 'R/AO/190626107BD', 'Babalola Ayomiposi', '7047427', 'seizure disorder', 'tegretol 200mg am, 300mg pm x 1/12 (30 EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-05-01-01","name":"Carbamazepine Tablet 200mg Tab.","quantity":30,"unit_price":149,"amount":4470,"confidence":"high","source_term":"tegretol 200mg am"},{"code":"NHIA-05-01-01","name":"Carbamazepine Tablet 200mg Tab.","quantity":30,"unit_price":149,"amount":4470,"confidence":"high","source_term":"tegretol 300mg pm x 1/12 (30 EACH )"}]'::jsonb, 8940, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 39: SAKIRAT OYEDIRAN (R/AO/190626108BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626108BD', 'R/AO/190626108BD', 'SAKIRAT OYEDIRAN', '2173739', 'Refractive Error', 'consultation, manual refraction, Direct ophthalmoscopy , glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 31000, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 40: Matthew Osagiede (R/AO/190626109BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626109BD', 'R/AO/190626109BD', 'Matthew Osagiede', '2557375', 'HTN', 'Tab Amlodipine 10mg x 1/12 (30 TABS )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Tab Amlodipine 10mg x 1/12 (30 TABS )"}]'::jsonb, 2100, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 41: Omobolanle Osunlana (R/AO/190626110BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626110BD', 'R/AO/190626110BD', 'Omobolanle Osunlana', '1639496', 'Hypertension', 'Amlodipine 10MG dly x 1/12 (30 TABS )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10MG dly x 1/12 (30 TABS )"}]'::jsonb, 2100, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 42: Funke Oladapo (R/AO/190626111BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626111BD', 'R/AO/190626111BD', 'Funke Oladapo', '1639227', 'HTN ,dm', 'Tab Nifedipine 20mg dly x 1/12, Vasoprin 75mgdly x 1/12, Metformin 1000mg BD x 1/12 ( 30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-59","name":"Nifedipine Tablet, 20mg Tab.","quantity":30,"unit_price":67,"amount":2010,"confidence":"high","source_term":"Tab Nifedipine 20mg dly x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Vasoprin 75mgdly x 1/12"},{"code":"NHIA-17-06-21","name":"Metformin Tablets 1000mg","quantity":30,"unit_price":106,"amount":3180,"confidence":"high","source_term":"Metformin 1000mg BD x 1/12 ( 30 TABS EACH )"}]'::jsonb, 5520, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 43: CANDY ETIM (R/AO/190626112BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626112BD', 'R/AO/190626112BD', 'CANDY ETIM', '2871411', 'Refractive Error', 'consultation, manual refraction, D.O, glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 31000, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 44: MARY EKANEM (R/AO/190626113BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626113BD', 'R/AO/190626113BD', 'MARY EKANEM', '2871237', 'HTN', 'ECG',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-040-008","name":"Electrocardiography (ECG)","quantity":1,"unit_price":10000,"amount":10000,"confidence":"high","source_term":"ECG"}]'::jsonb, 10000, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 45: Oluwatoyin Adeyemo Salami (R/AO/190626114BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626114BD', 'R/AO/190626114BD', 'Oluwatoyin Adeyemo Salami', '1637980', 'UTi', 'Urine MCS',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-183-005","name":"b) Microscopy, Culture & Sensitivity","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Urine MCS"}]'::jsonb, 4000, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 46: Ehinola Felicia (R/AO/190626115BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626115BD', 'R/AO/190626115BD', 'Ehinola Felicia', '1637750', 'Breast CA', 'specialist consultation',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"specialist consultation"}]'::jsonb, 4000, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 47: OLAYINRA ADETONA (R/AO/190626116BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626116BD', 'R/AO/190626116BD', 'OLAYINRA ADETONA', '2173373', 'Refractive Error', 'consultation, manual refraction, Direct ophthalmoscopy, glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 31000, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 48: Oyeniyi Joseph (R/AO/190626117BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626117BD', 'R/AO/190626117BD', 'Oyeniyi Joseph', '2871963', 'HTN', 'Lisinopril 5mg x 1/12, Tab HCT 12.5mg x 1/12 (30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-43","name":"Lisinopril Tablet 2.5mg Tab.","quantity":30,"unit_price":107,"amount":3210,"confidence":"high","source_term":"Lisinopril 5mg x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"Tab HCT 12.5mg x 1/12 (30 TABS EACH )"}]'::jsonb, 4410, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 49: Mamudu Bilikis (R/AO/190626118BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626118BD', 'R/AO/190626118BD', 'Mamudu Bilikis', '2873081', 'HTN', 'Aldomet 250mg bd x 1/12, Amlodipine 10mg dly x 1/12 (30 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-51","name":"Methyldopa Tablet 500mg Tablet","quantity":60,"unit_price":69,"amount":4140,"confidence":"high","source_term":"Aldomet 250mg bd x 1/12"},{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10mg dly x 1/12 (30 TABS EACH)"}]'::jsonb, 6240, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 50: Mamudu Bilikis (R/AO/190626119BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626119BD', 'R/AO/190626119BD', 'Mamudu Bilikis', '2873081', 'knee Osteoarthritis', '3 physiotherapy sessions',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-133-005","name":"Physiotherapy (3 Sessions)","quantity":3,"unit_price":7500,"amount":22500,"confidence":"high","source_term":"3 physiotherapy sessions"}]'::jsonb, 22500, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 51: Ethakpeml Joseph (R/AO/190626120BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626120BD', 'R/AO/190626120BD', 'Ethakpeml Joseph', '2173741', 'HTN/Hypokalemia', 'Tab Moduretic T dly x 1/12, Tab Clopidogrel 75mg dly x 1/12, Serum E/U/creatinine',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-03-01","name":"Amiloride + Hydrochlorothiazide Tablet 5mg+ 50mg Tab","quantity":30,"unit_price":36,"amount":1080,"confidence":"high","source_term":"Tab Moduretic T dly x 1/12"},{"code":"NHIA-11-03-04","name":"Clopidogrel Tablet 75mg Tab.","quantity":30,"unit_price":190,"amount":5700,"confidence":"high","source_term":"Tab Clopidogrel 75mg dly x 1/12"},{"code":"NHIA-181-030","name":"Electrolytes, Urea and Creatinine","quantity":1,"unit_price":9000,"amount":9000,"confidence":"high","source_term":"Serum E/U/creatinine"}]'::jsonb, 15780, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 52: Taiwo Titilayo (R/AO/190626121BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626121BD', 'R/AO/190626121BD', 'Taiwo Titilayo', '2872072', 'Presbyopia', 'Consultation, manual Refraction, Direct Ophthamoscopy, Glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 31000, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 53: Orotusin Adepeje (R/AO/190626122BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626122BD', 'R/AO/190626122BD', 'Orotusin Adepeje', '2871907', 'Presbyopia', 'Consultation, manual refraction, Glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 27000, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 54: Lawal Temitope Oluwafumilayo (R/AO/190626123BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626123BD', 'R/AO/190626123BD', 'Lawal Temitope Oluwafumilayo', '2871310', 'HTN', 'Losartan 25mg dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-48","name":"Losartan 25mg Tablet Tablet 25mg Tablet","quantity":30,"unit_price":108,"amount":3240,"confidence":"high","source_term":"Losartan 25mg dly x 1/12"}]'::jsonb, 3240, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 55: Borokini Felicia Iyabode (R/AO/190626124BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626124BD', 'R/AO/190626124BD', 'Borokini Felicia Iyabode', '1640287', '?lumbar spondylosis', 'CONSULT',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"CONSULT"}]'::jsonb, 4000, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 56: MARY EKANEM (R/AO/190626125BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626125BD', 'R/AO/190626125BD', 'MARY EKANEM', '2871237', 'conjestive cardiac failure', 'CONSULT',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"CONSULT"}]'::jsonb, 4000, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 57: JOHNBULL EJINIWE (R/AO/190626126BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626126BD', 'R/AO/190626126BD', 'JOHNBULL EJINIWE', '1638923', 'SYSTEMIC HYPERTENSION', 'tab Amlodipine 5mg dly x 1/12, tab clopidogrel 75mg dly x 1/12, tab Amiloride /Hydrochlorothiazide dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"tab Amlodipine 5mg dly x 1/12"},{"code":"NHIA-11-03-04","name":"Clopidogrel Tablet 75mg Tab.","quantity":30,"unit_price":190,"amount":5700,"confidence":"high","source_term":"tab clopidogrel 75mg dly x 1/12"},{"code":"NHIA-12-03-01","name":"Amiloride + Hydrochlorothiazide Tablet 5mg+ 50mg Tab","quantity":30,"unit_price":36,"amount":1080,"confidence":"high","source_term":"tab Amiloride /Hydrochlorothiazide dly x 1/12"}]'::jsonb, 8520, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 58: Akinbolure Olulobode (R/AO/190626127BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626127BD', 'R/AO/190626127BD', 'Akinbolure Olulobode', '2871893', 'HTN', 'Amlodipine 10mg x 1/12,Tab LOSARTAN 25mg 1/12 (30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10mg x 1/12"},{"code":"NHIA-12-04-48","name":"Losartan 25mg Tablet Tablet 25mg Tablet","quantity":30,"unit_price":108,"amount":3240,"confidence":"high","source_term":"Tab LOSARTAN 25mg 1/12 (30 TABS EACH )"}]'::jsonb, 5340, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 59: Akpan Matthew (R/AO/190626128BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626128BD', 'R/AO/190626128BD', 'Akpan Matthew', '2173737', '?BPH', 'PSA',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-181-082","name":"Prostate Specific Antigen (PSA): (a - b)","quantity":1,"unit_price":15000,"amount":15000,"confidence":"high","source_term":"PSA"}]'::jsonb, 15000, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 60: Akpan Matthew (DECLINED without code)
  IF NOT EXISTS (SELECT 1 FROM public.authorization_requests WHERE request_id = 'REQ-HIST-0060') THEN
    INSERT INTO public.authorization_requests (
      request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
      hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
      referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
      status, source, is_historical, approved_items, total_amount, decided_at,
      authorized_by_name, submitted_by, decided_by, created_at, updated_at
    ) VALUES (
      'REQ-HIST-0060', NULL, 'Akpan Matthew', '2173737', '?BPH', 'E/U/CR',
      v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
      NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
      'declined', 'historical_import', TRUE, '[{"code":"DECLINED","name":"E/U/CR","quantity":1,"unit_price":0,"amount":0,"confidence":"high","source_term":"E/U/CR","declined":true}]'::jsonb, 0, '2026-07-03T12:00:00.000Z'::timestamptz,
      'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
    );
  END IF;

  -- Row 61: Adeniyi -Aogo Moses (R/AO/190626129BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626129BD', 'R/AO/190626129BD', 'Adeniyi -Aogo Moses', '1638681', 'Astigmatism', 'Consultation, manual Refraction, Direct Ophthalmoscopy, Glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 31000, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 62: Akpan Rebecca (R/AO/190626130BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626130BD', 'R/AO/190626130BD', 'Akpan Rebecca', '2173737', 'knee Arthritis', 'X-RAY',
    v_police_id, 'POLICE CLINIC, AGODI', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_police_id, 'POLICE CLINIC, AGODI', v_police_id, 'POLICE CLINIC, AGODI',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-173-001","name":"Chest (PA/AP) (1 view)","quantity":1,"unit_price":6000,"amount":6000,"confidence":"high","source_term":"X-RAY"}]'::jsonb, 6000, '2026-07-03T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-03T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 63: Ajayi Funmilayo (R/AO/190626131BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626131BD', 'R/AO/190626131BD', 'Ajayi Funmilayo', '1639497', 'Hypertension', 'Amlodipine 10mg DLY x 1/12, Losartan 25mg DLY x 1/12 (30 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10mg DLY x 1/12"},{"code":"NHIA-12-04-48","name":"Losartan 25mg Tablet Tablet 25mg Tablet","quantity":30,"unit_price":108,"amount":3240,"confidence":"high","source_term":"Losartan 25mg DLY x 1/12 (30 TABS EACH)"}]'::jsonb, 5340, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 64: Adewuyi Adenike (DECLINED without code)
  IF NOT EXISTS (SELECT 1 FROM public.authorization_requests WHERE request_id = 'REQ-HIST-0064') THEN
    INSERT INTO public.authorization_requests (
      request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
      hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
      referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
      status, source, is_historical, approved_items, total_amount, decided_at,
      authorized_by_name, submitted_by, decided_by, created_at, updated_at
    ) VALUES (
      'REQ-HIST-0064', NULL, 'Adewuyi Adenike', '1639928', 'Chronic left leg ulcer on treatment', 'FOLLOW UP',
      v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
      v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
      'declined', 'historical_import', TRUE, '[{"code":"DECLINED","name":"FOLLOW UP","quantity":1,"unit_price":0,"amount":0,"confidence":"high","source_term":"FOLLOW UP","declined":true}]'::jsonb, 0, '2026-07-09T12:00:00.000Z'::timestamptz,
      'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
    );
  END IF;

  -- Row 65: AKOLEOWO VICTORIA (R/AO/190626132BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626132BD', 'R/AO/190626132BD', 'AKOLEOWO VICTORIA', '7841700', 'thyroid adenoma', 'follow up',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-002","name":"Specialist Review (Per visit)","quantity":1,"unit_price":2600,"amount":2600,"confidence":"high","source_term":"follow up"}]'::jsonb, 2600, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 66: Ladokun Mary (R/AO/190626133BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626133BD', 'R/AO/190626133BD', 'Ladokun Mary', '2173313', 'GCMG, Non vital 1t1, fractured t5,7', 'Consultation, S&P, RCT 1t1, Composite t5',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-070-001","name":"Scaling and Polishing (Routine)","quantity":1,"unit_price":5000,"amount":5000,"confidence":"high","source_term":"Scaling and Polishing"},{"code":"NHIA-070-008","name":"Root Canal Treatment","quantity":1,"unit_price":15000,"amount":15000,"confidence":"high","source_term":"RCT"},{"code":"NHIA-070-006","name":"Composite Restoration (Light Cure)","quantity":1,"unit_price":6000,"amount":6000,"confidence":"high","source_term":"Composite"},{"code":"NHIA-010-001","name":"Specialist Dental Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"}]'::jsonb, 30000, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 67: Osifoh Telix (R/AO/190626134BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626134BD', 'R/AO/190626134BD', 'Osifoh Telix', '1638488', 'Hypertension + DM', 'Tab Vasoprin 75mg dly x 1/12, Metformin 1000mg bd x 1/12, glimepiride 1mg dly x 1/12, Lisinopril 10mg x 1/12, Amlodipine 10mg dly x 1/12, Hydrochlorothiazide 25mg BD x 1/12 (30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Tab Vasoprin 75mg dly x 1/12"},{"code":"NHIA-17-06-21","name":"Metformin Tablets 1000mg","quantity":60,"unit_price":106,"amount":6360,"confidence":"high","source_term":"Metformin 1000mg bd x 1/12"},{"code":"NHIA-17-06-18","name":"Glimepiride Tab 2mg","quantity":30,"unit_price":102,"amount":3060,"confidence":"medium","source_term":"glimepiride 1mg dly x 1/12"},{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"Lisinopril 10mg x 1/12"},{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10mg dly x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"Hydrochlorothiazide 25mg BD x 1/12 (30 TABS EACH )"}]'::jsonb, 15390, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 68: Omojola Andrew (R/AO/190626135BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626135BD', 'R/AO/190626135BD', 'Omojola Andrew', '2871316', 'Refractive Error', 'Consultation, Direct ophthalmoscopy, Manual Refraction, Tonometry, Glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-003","name":"Tonometry (Pulsair/Goldmann Applanation)","quantity":1,"unit_price":4562.5,"amount":4562.5,"confidence":"high","source_term":"Tonometry"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 35562.5, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 69: Ehinderd Alaba (R/AO/190626136BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626136BD', 'R/AO/190626136BD', 'Ehinderd Alaba', '2870814', 'Hyperopic presbyope', 'Consultation, Direct ophthalmoscopy, Manual Refraction',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"}]'::jsonb, 11000, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 70: Ogunsola oluyemi (R/AO/190626137BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626137BD', 'R/AO/190626137BD', 'Ogunsola oluyemi', '1637578', 'HTN', 'Tab Hydrochlorothiazide 25mg dly x 1/12, amlodipine 10mg dly x 1/12, lisinopril 10mg dly x 1/12 (30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"Tab Hydrochlorothiazide 25mg dly x 1/12"},{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"amlodipine 10mg dly x 1/12"},{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"lisinopril 10mg dly x 1/12 (30 TABS EACH )"}]'::jsonb, 5640, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 71: Ikegume Jerome (R/AO/190626138BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626138BD', 'R/AO/190626138BD', 'Ikegume Jerome', '1640248', 'HTN', 'Tab Nifedipine 20mg BD x 1/12, Lisinopril 10mg daily x 1/12 (30 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-59","name":"Nifedipine Tablet, 20mg Tab.","quantity":60,"unit_price":67,"amount":4020,"confidence":"high","source_term":"Tab Nifedipine 20mg BD x 1/12"},{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"Lisinopril 10mg daily x 1/12 (30 TABS EACH)"}]'::jsonb, 6360, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 72: Emoekpeire mary (R/AO/190626139BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626139BD', 'R/AO/190626139BD', 'Emoekpeire mary', '1639404', 'HTN', 'Tab Amlodipine 10mg x 1/12, Tab Lisinopril 5mg x 1/12 (30 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Tab Amlodipine 10mg x 1/12"},{"code":"NHIA-12-04-43","name":"Lisinopril Tablet 2.5mg Tab.","quantity":30,"unit_price":107,"amount":3210,"confidence":"high","source_term":"Tab Lisinopril 5mg x 1/12 (30 TABS EACH)"}]'::jsonb, 5310, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 73: Dupe Kayode (R/AO/190626140BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626140BD', 'R/AO/190626140BD', 'Dupe Kayode', '1639287', 'GCMG', 'Consultation, Scaling and polishing, Extraction',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-070-001","name":"Scaling and Polishing (Routine)","quantity":1,"unit_price":5000,"amount":5000,"confidence":"high","source_term":"Scaling and Polishing"},{"code":"NHIA-070-004","name":"Simple Tooth Extraction","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Extraction"},{"code":"NHIA-010-001","name":"Specialist Dental Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"}]'::jsonb, 13000, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 74: Ayinde Abolanle (R/AO/190626141BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626141BD', 'R/AO/190626141BD', 'Ayinde Abolanle', '1639658', 'DM+HTN', 'Tab Metformin 1000mg bd x 1/12, Tab lantus Insulin x 1/12, Tab Amlodipine 5mg x 1/12, Tab HCT 2mg x 1/12, Glimepiride 2mg daily x 1/12 (30 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-17-06-21","name":"Metformin Tablets 1000mg","quantity":60,"unit_price":106,"amount":6360,"confidence":"high","source_term":"Tab Metformin 1000mg bd x 1/12"},{"code":"NHIA-17-06-03","name":"Insulin Soluble Injection 100 units/ml Vial","quantity":30,"unit_price":12474,"amount":374220,"confidence":"high","source_term":"Tab lantus Insulin x 1/12"},{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Tab Amlodipine 5mg x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"Tab HCT 2mg x 1/12"},{"code":"NHIA-17-06-18","name":"Glimepiride Tab 2mg","quantity":30,"unit_price":102,"amount":3060,"confidence":"high","source_term":"Glimepiride 2mg daily x 1/12 (30 TABS EACH)"}]'::jsonb, 386580, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 75: Mary Aloba (R/AO/190626142BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626142BD', 'R/AO/190626142BD', 'Mary Aloba', '2872345', 'DM', 'Metformin 500mg x 1/12 (30 TABS)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-17-06-22","name":"Metformin Tablets 500mg","quantity":30,"unit_price":130,"amount":3900,"confidence":"high","source_term":"Metformin 500mg x 1/12 (30 TABS)"}]'::jsonb, 3900, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 76: Adeniyi Amoo (R/AO/190626143BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626143BD', 'R/AO/190626143BD', 'Adeniyi Amoo', '2871225', 'HTN', 'Amlodipine 10mg x 1/12, Lisinopril 5mg x 1/12 (30 tABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10mg x 1/12"},{"code":"NHIA-12-04-43","name":"Lisinopril Tablet 2.5mg Tab.","quantity":30,"unit_price":107,"amount":3210,"confidence":"high","source_term":"Lisinopril 5mg x 1/12 (30 tABS EACH )"}]'::jsonb, 5310, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 77: Funmilayo Oyawale (R/AO/190626144BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626144BD', 'R/AO/190626144BD', 'Funmilayo Oyawale', '2870816', 'Systemic Hypertension', 'Nifedipine 20mg dly x 1/12, hydrochlorothiazide 12.5mg x 1/12, Vasoprin 75mg dly x 1/12 (30 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-59","name":"Nifedipine Tablet, 20mg Tab.","quantity":30,"unit_price":67,"amount":2010,"confidence":"high","source_term":"Nifedipine 20mg dly x 1/12"},{"code":"NHIA-12-04-58","name":"Nebivolol + Hydrochlorothiazide Tablet 5mg /12.5mg Tablet","quantity":30,"unit_price":200,"amount":6000,"confidence":"high","source_term":"hydrochlorothiazide 12.5mg x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Vasoprin 75mg dly x 1/12 (30 TABS EACH)"}]'::jsonb, 8340, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 78: Elizabeth Ajibade (R/AO/190626145BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626145BD', 'R/AO/190626145BD', 'Elizabeth Ajibade', '1458576', 'Routine medical screening based on Nhia guidelines', 'Pap Smear, Mammogram',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-185-005","name":"Pap Smear","quantity":1,"unit_price":11320,"amount":11320,"confidence":"high","source_term":"Pap Smear"},{"code":"NHIA-178-025","name":"Mammogram","quantity":1,"unit_price":26770,"amount":26770,"confidence":"high","source_term":"Mammogram"}]'::jsonb, 38090, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 79: Elizabeth Ajibade (R/AO/190626146BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626146BD', 'R/AO/190626146BD', 'Elizabeth Ajibade', '1458576', 'Hypertension, Dyslipidemia', 'Tab Amlodipine 5mg 1/12, Tab Amiloride/HCT Tdly x 1/12, Atorvastatin 10mg 1/12, Clopidogrel 75mg DLY x 1/12 ( 30TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Tab Amlodipine 5mg 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"Tab Amiloride/HCT Tdly x 1/12"},{"code":"NHIA-12-06-01","name":"Atorvastatin Tab/Caps 10mg Tab/ Cap.","quantity":30,"unit_price":122,"amount":3660,"confidence":"high","source_term":"Atorvastatin 10mg 1/12"},{"code":"NHIA-11-03-04","name":"Clopidogrel Tablet 75mg Tab.","quantity":30,"unit_price":190,"amount":5700,"confidence":"high","source_term":"Clopidogrel 75mg DLY x 1/12 ( 30TABS EACH )"}]'::jsonb, 12300, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 80: Oludare Salako (R/AO/190626147BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626147BD', 'R/AO/190626147BD', 'Oludare Salako', '471500802', 'Tachycardia', 'ECG',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-040-008","name":"Electrocardiography (ECG)","quantity":1,"unit_price":10000,"amount":10000,"confidence":"high","source_term":"ECG"}]'::jsonb, 10000, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 81: Uyoyou Olasunkanmi (R/AO/190626148BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626148BD', 'R/AO/190626148BD', 'Uyoyou Olasunkanmi', '1638675', 'Hypertension', 'Tab hydrochlorothiazide 12.5mg dly x 1/12, Amlodipine 5mg dly 1/12 (30 tabs each )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-58","name":"Nebivolol + Hydrochlorothiazide Tablet 5mg /12.5mg Tablet","quantity":30,"unit_price":200,"amount":6000,"confidence":"high","source_term":"Tab hydrochlorothiazide 12.5mg dly x 1/12"},{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Amlodipine 5mg dly 1/12 (30 tabs each )"}]'::jsonb, 7740, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 82: Dauda Dikko (R/AO/190626149BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626149BD', 'R/AO/190626149BD', 'Dauda Dikko', '2872619', 'Refractive Error', 'Consultation, Direct ophthalmoscopy, Manual Refractiion, Glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 31000, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 83: Akeju Adeyemi (R/AO/190626150BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626150BD', 'R/AO/190626150BD', 'Akeju Adeyemi', '2872911', 'Refractive Error', 'Consultation, Visual Acuity, Direct Ophthalmoscopy , Manual Refraction, Glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 31000, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 84: Olasehinde Iyabo (R/AO/190626151BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626151BD', 'R/AO/190626151BD', 'Olasehinde Iyabo', '1639808', 'HTN + Dm', 'Lisinopril 10mg dly x 1/12, Tab Amlodipine 10mg dly x 1/12,HCT 25mg dly x 1/12, Metform 1000mg bd x 1/12, Glimepiride 2mg dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"Lisinopril 10mg dly x 1/12"},{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Tab Amlodipine 10mg dly x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"HCT 25mg dly x 1/12"},{"code":"NHIA-17-06-21","name":"Metformin Tablets 1000mg","quantity":60,"unit_price":106,"amount":6360,"confidence":"high","source_term":"Metform 1000mg bd x 1/12"},{"code":"NHIA-17-06-18","name":"Glimepiride Tab 2mg","quantity":30,"unit_price":102,"amount":3060,"confidence":"high","source_term":"Glimepiride 2mg dly x 1/12"}]'::jsonb, 15060, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 85: Tayo Olumide Olayemi (R/AO/190626152BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626152BD', 'R/AO/190626152BD', 'Tayo Olumide Olayemi', '1458908', 'BPH, Painful scrotal swelling ? cause', 'specialist consultation',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"specialist consultation"}]'::jsonb, 4000, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 86: Adeyemi Bolarinwa (R/AO/190626153BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626153BD', 'R/AO/190626153BD', 'Adeyemi Bolarinwa', '2716972', 'Hypertension', 'Tab hydrochlorothiazide 12.5mg dly x 1/12, Amlodipine 5mg dly 1/12, Tab Clopidogrel 75 mg dly x 1/12 (30 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-58","name":"Nebivolol + Hydrochlorothiazide Tablet 5mg /12.5mg Tablet","quantity":30,"unit_price":200,"amount":6000,"confidence":"high","source_term":"Tab hydrochlorothiazide 12.5mg dly x 1/12"},{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Amlodipine 5mg dly 1/12"},{"code":"NHIA-11-03-04","name":"Clopidogrel Tablet 75mg Tab.","quantity":30,"unit_price":190,"amount":5700,"confidence":"high","source_term":"Tab Clopidogrel 75 mg dly x 1/12 (30 TABS EACH)"}]'::jsonb, 13440, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 87: Nwankpa Mercy (R/AO/190626154BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626154BD', 'R/AO/190626154BD', 'Nwankpa Mercy', '1639869', 'Hypertension', 'Tab Amiloride+Hydrochlorothiazide T daily x 1/12, Tab methyldopa 250mg b.d x 1/12, Tab Clopidogrel 75mg daily x 1/12 (30 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-03-01","name":"Amiloride + Hydrochlorothiazide Tablet 5mg+ 50mg Tab","quantity":30,"unit_price":36,"amount":1080,"confidence":"high","source_term":"Tab Amiloride+Hydrochlorothiazide T daily x 1/12"},{"code":"NHIA-12-04-51","name":"Methyldopa Tablet 500mg Tablet","quantity":60,"unit_price":69,"amount":4140,"confidence":"medium","source_term":"Tab methyldopa 250mg b.d x 1/12"},{"code":"NHIA-11-03-04","name":"Clopidogrel Tablet 75mg Tab.","quantity":30,"unit_price":190,"amount":5700,"confidence":"high","source_term":"Tab Clopidogrel 75mg daily x 1/12 (30 TABS EACH)"}]'::jsonb, 10920, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 88: Saka Kolawole (R/AO/190626155BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626155BD', 'R/AO/190626155BD', 'Saka Kolawole', '2870855', 'Chronic right heel pain', 'CONSULT',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"CONSULT"}]'::jsonb, 4000, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 89: IDARA GODWIN (R/AO/190626156BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626156BD', 'R/AO/190626156BD', 'IDARA GODWIN', '7843356', 'HTN', 'Tab Nifedipine 20mg bd x 1/12, Tab Methyldopa 500mg BD x 1/12 (60 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-59","name":"Nifedipine Tablet, 20mg Tab.","quantity":60,"unit_price":67,"amount":4020,"confidence":"high","source_term":"Tab Nifedipine 20mg bd x 1/12"},{"code":"NHIA-12-04-51","name":"Methyldopa Tablet 500mg Tablet","quantity":60,"unit_price":69,"amount":4140,"confidence":"high","source_term":"Tab Methyldopa 500mg BD x 1/12 (60 TABS EACH)"}]'::jsonb, 8160, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 90: Olajide Olumide (R/AO/190626157BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626157BD', 'R/AO/190626157BD', 'Olajide Olumide', '1638690', 'Diabetes Mellitus', 'Tab Glimepiride 2mg daily x 2/52, Tab Metformin 1000mg am, 500mg pm x 2/52 (14 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-17-06-18","name":"Glimepiride Tab 2mg","quantity":14,"unit_price":102,"amount":1428,"confidence":"high","source_term":"Tab Glimepiride 2mg daily x 2/52"},{"code":"NHIA-17-06-21","name":"Metformin Tablets 1000mg","quantity":30,"unit_price":106,"amount":3180,"confidence":"high","source_term":"Tab Metformin 1000mg am"},{"code":"NHIA-17-06-22","name":"Metformin Tablets 500mg","quantity":14,"unit_price":130,"amount":1820,"confidence":"high","source_term":"Metformin 500mg pm x 2/52 (14 TABS EACH )"}]'::jsonb, 6428, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 91: Oladejo Sherifat (R/AO/190626158BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626158BD', 'R/AO/190626158BD', 'Oladejo Sherifat', '2872516', 'Secondary Infertility', 'CONSULT',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"CONSULT"}]'::jsonb, 4000, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 92: Tinubu Adekunle (R/AO/190626159BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626159BD', 'R/AO/190626159BD', 'Tinubu Adekunle', '2173706', 'Hypertension', 'amlodipine 10mg dly x 1/12, Atorvastatin 20mg daily x 1/12, Indapamide 1.5 mg dly x 1/12,(30 tabs each), Telmisartan 80mg bd x 1/12 (60 tabs)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"amlodipine 10mg dly x 1/12"},{"code":"NHIA-12-06-02","name":"Atorvastatin Tab/Caps 20mg Tab/ Cap.","quantity":30,"unit_price":154,"amount":4620,"confidence":"high","source_term":"Atorvastatin 20mg daily x 1/12"},{"code":"NHIA-12-04-31","name":"Indapamide 1.5mg tab Tab 1.5mg Tab","quantity":30,"unit_price":310,"amount":9300,"confidence":"high","source_term":"Indapamide 1.5 mg dly x 1/12"},{"code":"NHIA-12-04-84","name":"Telmisartan + Hydrochlorthiazide Tablet Telmisartan 80mg/HCTZ 12.5mg Tab","quantity":60,"unit_price":327,"amount":19620,"confidence":"high","source_term":"Telmisartan 80mg bd x 1/12 (60 tabs)"}]'::jsonb, 35640, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 93: Ajibike Seun (R/AO/190626160BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626160BD', 'R/AO/190626160BD', 'Ajibike Seun', '1640283', 'Hypertension', 'Tab Ramipril 5mg daily x 1/12, Tab Metoprolol 50mg daily x 1/12 (30 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-76","name":"Ramipril 5mg Tablet Tablet 5mg Tablet","quantity":30,"unit_price":90,"amount":2700,"confidence":"high","source_term":"Tab Ramipril 5mg daily x 1/12"},{"code":"NHIA-12-04-56","name":"Metoprolol Tartrate 25mg tab Tablet 50mg Tablet","quantity":30,"unit_price":212,"amount":6360,"confidence":"high","source_term":"Tab Metoprolol 50mg daily x 1/12 (30 TABS EACH)"}]'::jsonb, 9060, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 94: Koyejo ELIJAH (R/AO/190626161BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626161BD', 'R/AO/190626161BD', 'Koyejo ELIJAH', '8248296', 'T2dm; htn; R/O dyslipidemia', 'Hba1c, FLP, E/U/CR',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    NULL, NULL, v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-181-046","name":"Glycated Hemoglobin (HbA1c)","quantity":1,"unit_price":10000,"amount":10000,"confidence":"high","source_term":"Hba1c"},{"code":"NHIA-181-018","name":"Total Cholesterol 2,500.00 Total Lipid Profile (a-d)","quantity":1,"unit_price":6000,"amount":6000,"confidence":"high","source_term":"FLP"},{"code":"NHIA-181-030","name":"Electrolytes, Urea and Creatinine","quantity":1,"unit_price":9000,"amount":9000,"confidence":"high","source_term":"E/U/CR"}]'::jsonb, 25000, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 95: Iseghohimhen Christiana (R/AO/190626162BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626162BD', 'R/AO/190626162BD', 'Iseghohimhen Christiana', '1637560', 'Hypertension', 'Tab Amlodipine 5mg dly x 1/12 (30 TABS )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Tab Amlodipine 5mg dly x 1/12 (30 TABS )"}]'::jsonb, 1740, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 96: Temola Ajoke Ayomipe (R/AO/190626163BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626163BD', 'R/AO/190626163BD', 'Temola Ajoke Ayomipe', '80209242', 'Diabetes mellitus, hypertension', 'Tab Metformin 1000mg BD x 1/12, Glimepiride 2mg dly x 1/12, Amlodipine 10mg dly x 1/12, Hydrochlorothiazide 25mg dly x 1/12 (30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-17-06-21","name":"Metformin Tablets 1000mg","quantity":60,"unit_price":106,"amount":6360,"confidence":"high","source_term":"Tab Metformin 1000mg BD x 1/12"},{"code":"NHIA-17-06-18","name":"Glimepiride Tab 2mg","quantity":30,"unit_price":102,"amount":3060,"confidence":"high","source_term":"Glimepiride 2mg dly x 1/12"},{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10mg dly x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"Hydrochlorothiazide 25mg dly x 1/12 (30 TABS EACH )"}]'::jsonb, 12720, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 97: Comfort Omisanya (R/AO/190626164BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626164BD', 'R/AO/190626164BD', 'Comfort Omisanya', '1638040', 'hypertension', 'Hydrochlorothiazide 25mg dly x 1/12, Bisoprolol 2.5mg Dly x 1/12 (30 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"Hydrochlorothiazide 25mg dly x 1/12"},{"code":"NHIA-12-01-10","name":"Bisoprolol 2.5mg Tablet Tablet 2.5mg Tablet","quantity":30,"unit_price":131,"amount":3930,"confidence":"high","source_term":"Bisoprolol 2.5mg Dly x 1/12 (30 TABS EACH)"}]'::jsonb, 5130, '2026-07-09T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-09T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 98: Adebayo Onijogun (R/AO/190626165BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626165BD', 'R/AO/190626165BD', 'Adebayo Onijogun', '2870965', 'hypertension', 'tab Amlodipine 10mg x 1/12, tab lisinopril 10mg x 1/12 (30 tabs each )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"tab Amlodipine 10mg x 1/12"},{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"tab lisinopril 10mg x 1/12 (30 tabs each )"}]'::jsonb, 4440, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 99: Adereti Oluwaseun (R/AO/190626166BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626166BD', 'R/AO/190626166BD', 'Adereti Oluwaseun', '2870879', 'Immunodeficiency r/o Hepatitis B', 'HBsAg',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-184-004","name":"Hepatitis B Surface Antigen (HbsAg)","quantity":1,"unit_price":4628.57,"amount":4628.57,"confidence":"high","source_term":"HBsAg"}]'::jsonb, 4628.57, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 100: Ajani Abidemi (R/AO/190626167BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626167BD', 'R/AO/190626167BD', 'Ajani Abidemi', '1639145', 'Hypertension', 'Lisinopril 5mg dly x 1/12, Hydrochlorothiazide 25mg dly x 1/12, Acetylsalicylic acid 75mg Dly x 1/12 (30 tabs each )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-43","name":"Lisinopril Tablet 2.5mg Tab.","quantity":30,"unit_price":107,"amount":3210,"confidence":"high","source_term":"Lisinopril 5mg dly x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"Hydrochlorothiazide 25mg dly x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Acetylsalicylic acid 75mg Dly x 1/12 (30 tabs each )"}]'::jsonb, 4740, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 101: Afolabi olorunsola (R/AO/190626168BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626168BD', 'R/AO/190626168BD', 'Afolabi olorunsola', '2870539', 'Hypertension', 'Tab amlodipine 10mg, lisinopril 5mg dly x 1/12 (30 tabs each)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Tab amlodipine 10mg"},{"code":"NHIA-12-04-43","name":"Lisinopril Tablet 2.5mg Tab.","quantity":30,"unit_price":107,"amount":3210,"confidence":"high","source_term":"lisinopril 5mg dly x 1/12 (30 tabs each)"}]'::jsonb, 5310, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 102: Adewunmi Olowoeyo (R/AO/190626169BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626169BD', 'R/AO/190626169BD', 'Adewunmi Olowoeyo', '2871128', 'Refractive Error', 'Consultation, direct ophthalmoscopy, Manual Refraction, Tonometry, Glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-003","name":"Tonometry (Pulsair/Goldmann Applanation)","quantity":1,"unit_price":4562.5,"amount":4562.5,"confidence":"high","source_term":"Tonometry"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 35562.5, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 103: Akeju Oluwakemi Ayoola (R/AO/190626170BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626170BD', 'R/AO/190626170BD', 'Akeju Oluwakemi Ayoola', '2872911', 'Refractive Error', 'Consultation, direct ophthalmoscopy, Manual Refraction, Tonometry, Glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-003","name":"Tonometry (Pulsair/Goldmann Applanation)","quantity":1,"unit_price":4562.5,"amount":4562.5,"confidence":"high","source_term":"Tonometry"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 35562.5, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 104: Bukola Babalola (R/AO/190626171BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626171BD', 'R/AO/190626171BD', 'Bukola Babalola', '1639101', 'Uncontrolled BP with Acute Gastritis', 'Tab Aldomet 500mg bd x 1/12, Tab Amlodipine 10mg dly x 1/12 (30 tabs each)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-51","name":"Methyldopa Tablet 500mg Tablet","quantity":60,"unit_price":69,"amount":4140,"confidence":"high","source_term":"Tab Aldomet 500mg bd x 1/12"},{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Tab Amlodipine 10mg dly x 1/12 (30 tabs each)"}]'::jsonb, 6240, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 105: Salau Tajudeen (R/AO/190626172BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626172BD', 'R/AO/190626172BD', 'Salau Tajudeen', '1638403', 'Lumbar Spondylosis', '3 Physiotherapy sessions',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-133-005","name":"Physiotherapy (3 Sessions)","quantity":3,"unit_price":7500,"amount":22500,"confidence":"high","source_term":"3 Physiotherapy sessions"}]'::jsonb, 22500, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 106: Abatan Olabisi (R/AO/190626173BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626173BD', 'R/AO/190626173BD', 'Abatan Olabisi', '8236252', 'Dyslipidaemia', 'FLP',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-181-018","name":"Total Cholesterol 2,500.00 Total Lipid Profile (a-d)","quantity":1,"unit_price":6000,"amount":6000,"confidence":"high","source_term":"FLP"}]'::jsonb, 6000, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 107: Adetona Adekanmi (R/AO/190626174BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626174BD', 'R/AO/190626174BD', 'Adetona Adekanmi', '2173373', 'Hypertension + Diabetes Mellitus', 'Tab Losartan 100mg dly x 1/12, Moduretic T dly x 1/12, Rosuvastatin 100mg dly x 1/12, clopidogrel 75mg dly x 1/12, Aldomet 250mg BD x 1/12 (30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-50","name":"Losartan 100mg Tablet Tab 100mg Tablet","quantity":30,"unit_price":126,"amount":3780,"confidence":"high","source_term":"Tab Losartan 100mg dly x 1/12"},{"code":"NHIA-12-03-01","name":"Amiloride + Hydrochlorothiazide Tablet 5mg+ 50mg Tab","quantity":30,"unit_price":36,"amount":1080,"confidence":"high","source_term":"Moduretic T dly x 1/12"},{"code":"NHIA-12-06-06","name":"Rosuvastatin Tab/Caps 5mg Tab/ Cap.","quantity":30,"unit_price":193,"amount":5790,"confidence":"medium","source_term":"Rosuvastatin 100mg dly x 1/12"},{"code":"NHIA-11-03-04","name":"Clopidogrel Tablet 75mg Tab.","quantity":30,"unit_price":190,"amount":5700,"confidence":"high","source_term":"clopidogrel 75mg dly x 1/12"},{"code":"NHIA-12-04-51","name":"Methyldopa Tablet 500mg Tablet","quantity":30,"unit_price":69,"amount":2070,"confidence":"high","source_term":"Aldomet 250mg BD x 1/12 (30 TABS EACH )"}]'::jsonb, 18420, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 108: TAOFEEK MUIBI (R/AO/190626175BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626175BD', 'R/AO/190626175BD', 'TAOFEEK MUIBI', '1638117', 'Lumbar Spondylosis', '3 physiotherapy sessions',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-133-005","name":"Physiotherapy (3 Sessions)","quantity":3,"unit_price":7500,"amount":22500,"confidence":"high","source_term":"3 physiotherapy sessions"}]'::jsonb, 22500, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 109: KASEEM ADEOGUN (R/AO/190626176BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626176BD', 'R/AO/190626176BD', 'KASEEM ADEOGUN', '2873110', 'HTN', 'HCT 12.5mg dly x 1/12, Losartan 25mg dly x 1/12 (30 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"HCT 12.5mg dly x 1/12"},{"code":"NHIA-12-04-48","name":"Losartan 25mg Tablet Tablet 25mg Tablet","quantity":30,"unit_price":108,"amount":3240,"confidence":"high","source_term":"Losartan 25mg dly x 1/12 (30 TABS EACH)"}]'::jsonb, 4440, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 110: Daniel Kanung (R/AO/190626177BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626177BD', 'R/AO/190626177BD', 'Daniel Kanung', '1458622', 'HTN', 'Tab Moduretic ii dly x 1/12, Tab Nifedipine 20mg bd x 1/12 (30 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-03-01","name":"Amiloride + Hydrochlorothiazide Tablet 5mg+ 50mg Tab","quantity":30,"unit_price":36,"amount":1080,"confidence":"high","source_term":"Tab Moduretic ii dly x 1/12"},{"code":"NHIA-12-04-59","name":"Nifedipine Tablet, 20mg Tab.","quantity":30,"unit_price":67,"amount":2010,"confidence":"high","source_term":"Tab Nifedipine 20mg bd x 1/12 (30 TABS EACH)"}]'::jsonb, 3090, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 111: Kayode Temitope (R/AO/190626178BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626178BD', 'R/AO/190626178BD', 'Kayode Temitope', '2557183', 'Pain & Post Immobilization stiffness following fracture', '3 physiotherapy sessions',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-133-005","name":"Physiotherapy (3 Sessions)","quantity":3,"unit_price":7500,"amount":22500,"confidence":"high","source_term":"3 physiotherapy sessions"}]'::jsonb, 22500, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 112: Morakinyo Roseline (R/AO/190626179BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626179BD', 'R/AO/190626179BD', 'Morakinyo Roseline', '2173767', 'HTN', 'Tab Methyldopa 500mg bd x 1/12, Tab Amlodipine 10mg dly x 1/12 (30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-51","name":"Methyldopa Tablet 500mg Tablet","quantity":60,"unit_price":69,"amount":4140,"confidence":"high","source_term":"Tab Methyldopa 500mg bd x 1/12"},{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Tab Amlodipine 10mg dly x 1/12 (30 TABS EACH )"}]'::jsonb, 6240, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 113: Kunle Oladipo (R/AO/190626180BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626180BD', 'R/AO/190626180BD', 'Kunle Oladipo', '2173348', 'Hypertension', 'Tab Amiloride/Hydrochlorothiazide dly x 1/12, Amlodipine 5mg dly x 1/12, Vasoprin 75mg x 1/12 (30 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-03-01","name":"Amiloride + Hydrochlorothiazide Tablet 5mg+ 50mg Tab","quantity":30,"unit_price":36,"amount":1080,"confidence":"high","source_term":"Tab Amiloride/Hydrochlorothiazide dly x 1/12"},{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Amlodipine 5mg dly x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Vasoprin 75mg x 1/12 (30 TABS EACH)"}]'::jsonb, 3150, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 114: Nwaulu Beatrice (R/AO/190626181BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626181BD', 'R/AO/190626181BD', 'Nwaulu Beatrice', '2557143', 'Hypertension', 'tab Hydrochlorothiazide 25mg dly x 1/12, Methyldopa 500mg BD x 1/12, Vasoprin 75mg dly x 1/12 (30 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"tab Hydrochlorothiazide 25mg dly x 1/12"},{"code":"NHIA-12-04-51","name":"Methyldopa Tablet 500mg Tablet","quantity":60,"unit_price":69,"amount":4140,"confidence":"high","source_term":"Methyldopa 500mg BD x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Vasoprin 75mg dly x 1/12 (30 TABS EACH)"}]'::jsonb, 5670, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 115: Bose Akingbade (R/AO/190626182BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626182BD', 'R/AO/190626182BD', 'Bose Akingbade', '1638267', 'HTN &DM', 'Tab Atenolol 50mg x 1/12, Tab Lisinopril 5mg x 1/12, Tab Amlodipine 10mg x 1/12, Tab glimepiride 2mg dly x 1/12 (30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-01-02","name":"Atenolol Tablet 50mg Tab","quantity":30,"unit_price":119,"amount":3570,"confidence":"high","source_term":"Tab Atenolol 50mg x 1/12"},{"code":"NHIA-12-04-43","name":"Lisinopril Tablet 2.5mg Tab.","quantity":30,"unit_price":107,"amount":3210,"confidence":"high","source_term":"Tab Lisinopril 5mg x 1/12"},{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Tab Amlodipine 10mg x 1/12"},{"code":"NHIA-17-06-18","name":"Glimepiride Tab 2mg","quantity":30,"unit_price":102,"amount":3060,"confidence":"high","source_term":"Tab glimepiride 2mg dly x 1/12 (30 TABS EACH )"}]'::jsonb, 11940, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 116: Ugwu Regina (R/AO/190626183BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626183BD', 'R/AO/190626183BD', 'Ugwu Regina', '2870618', 'HTN + DM', 'Tab Amlodipine 10mg dly x 1/12, Tab Metformin 1000mg b.d x 1/12, Tab Lisinopril 10mg dly (30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Tab Amlodipine 10mg dly x 1/12"},{"code":"NHIA-17-06-21","name":"Metformin Tablets 1000mg","quantity":60,"unit_price":106,"amount":6360,"confidence":"high","source_term":"Tab Metformin 1000mg b.d x 1/12"},{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"Tab Lisinopril 10mg dly (30 TABS EACH )"}]'::jsonb, 10800, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 117: Ajayi Emmanuel (R/AO/190626184BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626184BD', 'R/AO/190626184BD', 'Ajayi Emmanuel', '2872536', 'Refractive error', 'Consultation, Direct ophthalmoscopy, Manual Refraction, glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 31000, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 118: Rachel Ogunmodede (R/AO/190626185BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626185BD', 'R/AO/190626185BD', 'Rachel Ogunmodede', '1458577', 'HTN', 'Tab Amlodipine 10mg dly 1/12, Tab Hydrochlorothiazide 25mg dly 1/12, Vasoprin 75ng DLY x 1/12 (30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Tab Amlodipine 10mg dly 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"Tab Hydrochlorothiazide 25mg dly 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Vasoprin 75ng DLY x 1/12 (30 TABS EACH )"}]'::jsonb, 3630, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 119: Balogun Balikis (R/AO/190626186BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626186BD', 'R/AO/190626186BD', 'Balogun Balikis', '1500637', '? Viral Hepatitis', 'HBsAG, Anti-HCV',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-184-004","name":"Hepatitis B Surface Antigen (HbsAg)","quantity":1,"unit_price":4628.57,"amount":4628.57,"confidence":"high","source_term":"HBsAG"},{"code":"NHIA-184-013","name":"Hepatitis C Antibody (HCVAb)","quantity":1,"unit_price":11112.5,"amount":11112.5,"confidence":"high","source_term":"Anti-HCV"}]'::jsonb, 15741.07, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 120: Abatan Olabisi (R/AO/190626187BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626187BD', 'R/AO/190626187BD', 'Abatan Olabisi', '8236252', 'Refractive Error', 'Consultation, visual acuity, Direct ophthalmoscopy, Manual Refraction, glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 31000, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 121: Abatan Olabisi (R/AO/190626188BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626188BD', 'R/AO/190626188BD', 'Abatan Olabisi', '8236252', 'Caries L6, Irreversible pulpitis 7T', 'cONSULT',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"cONSULT"}]'::jsonb, 4000, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 122: Odum Anthony (R/AO/190626189BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626189BD', 'R/AO/190626189BD', 'Odum Anthony', '2871921', 'HTN+Dm', 'Metformin 500mg BD x 1/12, Nifedipine 40mg dly x 1/12, Vasoprin 75mg Dly x 1/12, Lisinopril 10mg Dly x 1/12, Glimepiride dly x 1/12 (30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-17-06-22","name":"Metformin Tablets 500mg","quantity":60,"unit_price":130,"amount":7800,"confidence":"high","source_term":"Metformin 500mg BD x 1/12"},{"code":"NHIA-12-04-59","name":"Nifedipine Tablet, 20mg Tab.","quantity":30,"unit_price":67,"amount":2010,"confidence":"medium","source_term":"Nifedipine 40mg dly x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Vasoprin 75mg Dly x 1/12"},{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"Lisinopril 10mg Dly x 1/12"},{"code":"NHIA-17-06-18","name":"Glimepiride Tab 2mg","quantity":30,"unit_price":102,"amount":3060,"confidence":"medium","source_term":"Glimepiride dly x 1/12 (30 TABS EACH )"}]'::jsonb, 15540, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 123: Olanike Akinboye (R/AO/190626190BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626190BD', 'R/AO/190626190BD', 'Olanike Akinboye', '2873020', 'sepsis KIV Immunosuppression', 'RVS, HBsAg',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-184-009","name":"HIV Screening","quantity":1,"unit_price":9992.86,"amount":9992.86,"confidence":"high","source_term":"RVS"},{"code":"NHIA-184-004","name":"Hepatitis B Surface Antigen (HbsAg)","quantity":1,"unit_price":4628.57,"amount":4628.57,"confidence":"high","source_term":"HBsAg"}]'::jsonb, 14621.43, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 124: Edet Etim (R/AO/190626191BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626191BD', 'R/AO/190626191BD', 'Edet Etim', '1640216', 'HTN', 'Tab Ramipril 5mg dly x 1/12, Vasoprin 75mg dly x 1/12 (30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-76","name":"Ramipril 5mg Tablet Tablet 5mg Tablet","quantity":30,"unit_price":90,"amount":2700,"confidence":"high","source_term":"Tab Ramipril 5mg dly x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Vasoprin 75mg dly x 1/12 (30 TABS EACH )"}]'::jsonb, 3030, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 125: Paul Okon (R/AO/190626192BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626192BD', 'R/AO/190626192BD', 'Paul Okon', '1458127', 'Acute urinary retention secondary to BPH', 'CONSULT',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"CONSULT"}]'::jsonb, 4000, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 126: Oloyede Babatunde (R/AO/190626193BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626193BD', 'R/AO/190626193BD', 'Oloyede Babatunde', '8240836', 'BPH,R/o hypertension,r/o Dyslipidemia, type 2 DM ,UTI, CHEST PAIN', 'Abdominopelvic USS, urine Mcs,EUCR,PSA,FLP, HBAIC,ECG',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    NULL, NULL, v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-179-006","name":"Abdominal Pelvic Scan","quantity":1,"unit_price":8500,"amount":8500,"confidence":"high","source_term":"Abdominopelvic USS"},{"code":"NHIA-183-005","name":"b) Microscopy, Culture & Sensitivity","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"urine Mcs"},{"code":"NHIA-181-030","name":"Electrolytes, Urea and Creatinine","quantity":1,"unit_price":9000,"amount":9000,"confidence":"high","source_term":"EUCR"},{"code":"NHIA-181-082","name":"Prostate Specific Antigen (PSA): (a - b)","quantity":1,"unit_price":15000,"amount":15000,"confidence":"high","source_term":"PSA"},{"code":"NHIA-181-018","name":"Total Cholesterol 2,500.00 Total Lipid Profile (a-d)","quantity":1,"unit_price":6000,"amount":6000,"confidence":"high","source_term":"FLP"},{"code":"NHIA-181-046","name":"Glycated Hemoglobin (HbA1c)","quantity":1,"unit_price":10000,"amount":10000,"confidence":"high","source_term":"HBAIC"},{"code":"NHIA-040-008","name":"Electrocardiography (ECG)","quantity":1,"unit_price":10000,"amount":10000,"confidence":"high","source_term":"ECG"}]'::jsonb, 62500, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 127: Ogunsanya Adeolu (R/AO/190626194BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626194BD', 'R/AO/190626194BD', 'Ogunsanya Adeolu', '2873190', 'HTN', 'Amlodipine 5mg dly x 1/12, HcT 25mg x 1/12, Vasoprin 75mg x 1/12 (30 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Amlodipine 5mg dly x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"HcT 25mg x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Vasoprin 75mg x 1/12 (30 TABS EACH)"}]'::jsonb, 3270, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 128: Babalola Rose (R/AO/190626195BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626195BD', 'R/AO/190626195BD', 'Babalola Rose', '1458280', 'Goitre', 'FOLLW UP',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-002","name":"Specialist Review (Per visit)","quantity":1,"unit_price":2600,"amount":2600,"confidence":"high","source_term":"FOLLW UP"}]'::jsonb, 2600, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 129: Babalola Rose (R/AO/190626196BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626196BD', 'R/AO/190626196BD', 'Babalola Rose', '1458280', 'Poorly controlled blood sugar in diabetes', 'CONSULT',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"CONSULT"}]'::jsonb, 4000, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 130: Omoniyi Jumoke Omowumi (R/AO/190626197BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626197BD', 'R/AO/190626197BD', 'Omoniyi Jumoke Omowumi', '7841654', 'Routine medical screening', 'FLP',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-181-018","name":"Total Cholesterol 2,500.00 Total Lipid Profile (a-d)","quantity":1,"unit_price":6000,"amount":6000,"confidence":"high","source_term":"FLP"}]'::jsonb, 6000, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 131: Omoniyi Jumoke Omowumi (R/AO/190626198BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626198BD', 'R/AO/190626198BD', 'Omoniyi Jumoke Omowumi', '7841654', '? Uterine Fibroid', 'Abdominopelvic scan',
    v_police_id, 'POLICE CLINIC, AGODI', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_police_id, 'POLICE CLINIC, AGODI', v_police_id, 'POLICE CLINIC, AGODI',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-179-006","name":"Abdominal Pelvic Scan","quantity":1,"unit_price":8500,"amount":8500,"confidence":"high","source_term":"Abdominopelvic scan"}]'::jsonb, 8500, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 132: Olufunmi Olorunnisomo (R/AO/190626199BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626199BD', 'R/AO/190626199BD', 'Olufunmi Olorunnisomo', '2557184', 'Hypertension', 'Tab Amlodipine 10mg daily x 1/12, Losartan 25mg daily x 1/12, Bisoprolol 2.5mg daily x 1/12 ( 30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Tab Amlodipine 10mg daily x 1/12"},{"code":"NHIA-12-04-48","name":"Losartan 25mg Tablet Tablet 25mg Tablet","quantity":30,"unit_price":108,"amount":3240,"confidence":"high","source_term":"Losartan 25mg daily x 1/12"},{"code":"NHIA-12-01-10","name":"Bisoprolol 2.5mg Tablet Tablet 2.5mg Tablet","quantity":30,"unit_price":131,"amount":3930,"confidence":"high","source_term":"Bisoprolol 2.5mg daily x 1/12 ( 30 TABS EACH )"}]'::jsonb, 9270, '2026-07-10T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-10T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 133: Olakanmi Bukola (R/AO/190626200BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626200BD', 'R/AO/190626200BD', 'Olakanmi Bukola', '2716946', 'HTN', 'Amlodipine 10mg Dly, Vasoprin 75mg dly, Amiloride/ hydrochlorothiazide 1 dly(1/12) (30 TAB EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10mg Dly"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Vasoprin 75mg dly"},{"code":"NHIA-12-03-01","name":"Amiloride + Hydrochlorothiazide Tablet 5mg+ 50mg Tab","quantity":30,"unit_price":36,"amount":1080,"confidence":"high","source_term":"Amiloride/ hydrochlorothiazide 1 dly(1/12) (30 TAB EACH)"}]'::jsonb, 3510, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 134: patunola eunice (R/AO/190626201BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626201BD', 'R/AO/190626201BD', 'patunola eunice', '2173544', 'presbyopia', 'manual refraction, consult, direct ophthalmoscopy, glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 31000, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 135: Odedele Apetunji (R/AO/190626202BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626202BD', 'R/AO/190626202BD', 'Odedele Apetunji', '1639938', 'Presbyopia', 'consultation, manual refraction, glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 27000, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 136: Alagbe Akinolu (R/AO/190626203BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626203BD', 'R/AO/190626203BD', 'Alagbe Akinolu', '2870772', 'Hypertension &DM', 'Amlodipine 5mg x 1/12, Tab Lisinopril 5mg x 1/12, Tab Moduretic T dly, Tab Metformin 1000mg x 1/12 Insulin lantus 1 pen',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Amlodipine 5mg x 1/12"},{"code":"NHIA-12-04-43","name":"Lisinopril Tablet 2.5mg Tab.","quantity":30,"unit_price":107,"amount":3210,"confidence":"high","source_term":"Tab Lisinopril 5mg x 1/12"},{"code":"NHIA-12-03-01","name":"Amiloride + Hydrochlorothiazide Tablet 5mg+ 50mg Tab","quantity":30,"unit_price":36,"amount":1080,"confidence":"high","source_term":"Tab Moduretic T dly"},{"code":"NHIA-17-06-03","name":"Insulin Soluble Injection 100 units/ml Vial","quantity":1,"unit_price":12474,"amount":12474,"confidence":"high","source_term":"Tab Metformin 1000mg x 1/12 Insulin lantus 1 pen"}]'::jsonb, 18504, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 137: Nureni Adewole (R/AO/190626204BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626204BD', 'R/AO/190626204BD', 'Nureni Adewole', '2839633', 'HTN', 'HTC 25mg dly 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"HTC 25mg dly 1/12"}]'::jsonb, 1200, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 138: OLUFUNMI OLORUNNISOMO (R/AO/190626205BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626205BD', 'R/AO/190626205BD', 'OLUFUNMI OLORUNNISOMO', '2557184', 'Bilateral knee Osteoarthritis', 'tab diclofenac 75mg bd x 2/52 (14 tabs )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-02-04-11","name":"Diclofenac sodium + Cholestyramine Tablet 75mg/65mg Tab","quantity":14,"unit_price":317,"amount":4438,"confidence":"high","source_term":"tab diclofenac 75mg bd x 2/52 (14 tabs )"}]'::jsonb, 4438, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 139: Omotade Kayode (R/AO/190626206BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626206BD', 'R/AO/190626206BD', 'Omotade Kayode', '1638755', 'HTN', 'amlodipine 10mgdly x 1/12, losartan 25mg dly x 1/12, Atorvastatin 20mg dly x 1/12 (30 TABS )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"amlodipine 10mgdly x 1/12"},{"code":"NHIA-12-04-48","name":"Losartan 25mg Tablet Tablet 25mg Tablet","quantity":30,"unit_price":108,"amount":3240,"confidence":"high","source_term":"losartan 25mg dly x 1/12"},{"code":"NHIA-12-06-02","name":"Atorvastatin Tab/Caps 20mg Tab/ Cap.","quantity":30,"unit_price":154,"amount":4620,"confidence":"high","source_term":"Atorvastatin 20mg dly x 1/12 (30 TABS )"}]'::jsonb, 9960, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 140: Oluwafeyikemi Ademuyiwa (R/AO/190626207BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626207BD', 'R/AO/190626207BD', 'Oluwafeyikemi Ademuyiwa', '1638754', 'Lumbar spondylosis', '3 sessions of physiotherapy',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-133-005","name":"Physiotherapy (3 Sessions)","quantity":3,"unit_price":7500,"amount":22500,"confidence":"high","source_term":"3 sessions of physiotherapy"}]'::jsonb, 22500, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 141: Adetuwo Stephen (R/AO/190626208BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626208BD', 'R/AO/190626208BD', 'Adetuwo Stephen', '7047437', 'DM, HTN', 'Metformin 500mg b.d x 1/12, glibenclamide 5mg Dly x 1/12 (30 Tabs )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-17-06-22","name":"Metformin Tablets 500mg","quantity":60,"unit_price":130,"amount":7800,"confidence":"high","source_term":"Metformin 500mg b.d x 1/12"},{"code":"NHIA-17-06-14","name":"Glibenclamide Tablets 5mg Tab","quantity":30,"unit_price":28,"amount":840,"confidence":"high","source_term":"glibenclamide 5mg Dly x 1/12 (30 Tabs )"}]'::jsonb, 8640, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 142: Ajayi ABOSEDE Rasheedat (R/AO/190626209BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626209BD', 'R/AO/190626209BD', 'Ajayi ABOSEDE Rasheedat', '1637751', 'Pain in the right lower limb secondary to lumbar spondylosis', '2 sessions of physiotherapy',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-133-005","name":"Physiotherapy (2 Sessions)","quantity":2,"unit_price":7500,"amount":15000,"confidence":"high","source_term":"2 sessions of physiotherapy"}]'::jsonb, 15000, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 143: Adeyinka Adedayo (R/AO/190626210BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626210BD', 'R/AO/190626210BD', 'Adeyinka Adedayo', '2839738', 'HTN', 'Nifedipine 20mg bd x 1/12,Tab Lisinopril 10mg dly 1/12, HCT 25mg dly x 1/12 (30 tABS )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-59","name":"Nifedipine Tablet, 20mg Tab.","quantity":60,"unit_price":67,"amount":4020,"confidence":"high","source_term":"Nifedipine 20mg bd x 1/12"},{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"Tab Lisinopril 10mg dly 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"HCT 25mg dly x 1/12 (30 tABS )"}]'::jsonb, 7560, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 144: ERHOUNAYE ISAAC (R/AO/190626211BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626211BD', 'R/AO/190626211BD', 'ERHOUNAYE ISAAC', '1638525', 'HTN + DM', 'tab nifedipine 40mg am dly x 1/12, tab lisinopril 10mg dly x 1/12, tab glimepiride 2mg dly x 1/12, tab hydrochlorothiazide 25mg dly x 1/12 (30 TABS )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-59","name":"Nifedipine Tablet, 20mg Tab.","quantity":30,"unit_price":67,"amount":2010,"confidence":"medium","source_term":"tab nifedipine 40mg am dly x 1/12"},{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"tab lisinopril 10mg dly x 1/12"},{"code":"NHIA-17-06-18","name":"Glimepiride Tab 2mg","quantity":30,"unit_price":102,"amount":3060,"confidence":"high","source_term":"tab glimepiride 2mg dly x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"tab hydrochlorothiazide 25mg dly x 1/12 (30 TABS )"}]'::jsonb, 8610, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 145: Aladegboye Paul (R/AO/190626212BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626212BD', 'R/AO/190626212BD', 'Aladegboye Paul', '2557371', 'HTN', 'Amlodipine 10mg dly x 1/12, Vasoprin 75mg dly x 1/12, HCT 25mg dly x 1/12, Lisinopril 10mg x 1/12 (30 TABS )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10mg dly x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Vasoprin 75mg dly x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"HCT 25mg dly x 1/12"},{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"Lisinopril 10mg x 1/12 (30 TABS )"}]'::jsonb, 5970, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 146: Fakayode Titilayo (R/AO/190626213BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626213BD', 'R/AO/190626213BD', 'Fakayode Titilayo', '2872006', 'HTN', 'Amlodipine 10mg dly x 1/12 (30 TABS )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10mg dly x 1/12 (30 TABS )"}]'::jsonb, 2100, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 147: Taslim Hammed (R/AO/190626214BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626214BD', 'R/AO/190626214BD', 'Taslim Hammed', '1638669', 'Presbyopia', 'consultation, manual refraction, D.O, Tonometry, glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-003","name":"Tonometry (Pulsair/Goldmann Applanation)","quantity":1,"unit_price":4562.5,"amount":4562.5,"confidence":"high","source_term":"Tonometry"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 35562.5, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 148: Olusesi Idowu (R/AO/190626215BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626215BD', 'R/AO/190626215BD', 'Olusesi Idowu', '1458725', 'Knee Osteoarthritis', '2 Physioctheraphy sessions',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-133-005","name":"Physiotherapy (3 Sessions)","quantity":3,"unit_price":7500,"amount":22500,"confidence":"high","source_term":"2 Physioctheraphy sessions"}]'::jsonb, 22500, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 149: Alade Iyabo (R/AO/190626216BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626216BD', 'R/AO/190626216BD', 'Alade Iyabo', '2871479', 'Presbyopia', 'Consultation, Manual Refraction, D.O, Glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 31000, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 150: Fakayode Titilayo (R/AO/190626217BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626217BD', 'R/AO/190626217BD', 'Fakayode Titilayo', '2872006', 'Lumbar Spondylosis', '2 sessions of physiotherapy',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-133-005","name":"Physiotherapy (2 Sessions)","quantity":2,"unit_price":7500,"amount":15000,"confidence":"high","source_term":"2 sessions of physiotherapy"}]'::jsonb, 15000, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 151: Ojo justina Christiana (R/AO/190626218BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626218BD', 'R/AO/190626218BD', 'Ojo justina Christiana', '2839566', 'HTN /DM', 'Tab Amlodipine 5mg dly x 1/12, losartan 25mg dly x 1/12, Glimepiride 4mg dly x 1/12, Metformin 1000mg bd x 1/12 (30 TABS)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Tab Amlodipine 5mg dly x 1/12"},{"code":"NHIA-12-04-48","name":"Losartan 25mg Tablet Tablet 25mg Tablet","quantity":30,"unit_price":108,"amount":3240,"confidence":"high","source_term":"losartan 25mg dly x 1/12"},{"code":"NHIA-17-06-19","name":"Glimepiride Tab 4mg","quantity":30,"unit_price":128,"amount":3840,"confidence":"high","source_term":"Glimepiride 4mg dly x 1/12"},{"code":"NHIA-17-06-21","name":"Metformin Tablets 1000mg","quantity":30,"unit_price":106,"amount":3180,"confidence":"high","source_term":"Metformin 1000mg bd x 1/12 (30 TABS)"}]'::jsonb, 12000, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 152: Raifu Muideen Kolawole (R/AO/190626219BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626219BD', 'R/AO/190626219BD', 'Raifu Muideen Kolawole', '2871825', 'HTN', 'Tab Lisinopril 7.5mg dly x 1/12, Tab Hydrochlorothiazide 25mg dly x 1/12, Atenolol 25mg Dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-43","name":"Lisinopril Tablet 2.5mg Tab.","quantity":30,"unit_price":107,"amount":3210,"confidence":"medium","source_term":"Tab Lisinopril 7.5mg dly x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"Tab Hydrochlorothiazide 25mg dly x 1/12"},{"code":"NHIA-12-01-01","name":"Atenolol Tablet 25mg Tab","quantity":30,"unit_price":115,"amount":3450,"confidence":"high","source_term":"Atenolol 25mg Dly x 1/12"}]'::jsonb, 7860, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 153: AUDU ISAAC (R/AO/190626220BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626220BD', 'R/AO/190626220BD', 'AUDU ISAAC', '1458832', 'Hypertension', 'Tab Nifedipine 20mg, Lisinopril 5mg dly x 1/12 (30 TABS )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-59","name":"Nifedipine Tablet, 20mg Tab.","quantity":30,"unit_price":67,"amount":2010,"confidence":"high","source_term":"Tab Nifedipine 20mg"},{"code":"NHIA-12-04-43","name":"Lisinopril Tablet 2.5mg Tab.","quantity":30,"unit_price":107,"amount":3210,"confidence":"high","source_term":"Lisinopril 5mg dly x 1/12 (30 TABS )"}]'::jsonb, 5220, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 154: Elizabeth Ajibade (R/AO/190626221BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626221BD', 'R/AO/190626221BD', 'Elizabeth Ajibade', '1458576', 'Kennedy class III Modifications I space on upper arch 54+2', 'Removably partial denture (RPD)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-070-022","name":"Removable Partial Denture","quantity":1,"unit_price":25000,"amount":25000,"confidence":"high","source_term":"Partial Denture"}]'::jsonb, 25000, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 155: Amuzuo Beriiah (R/AO/190626222BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626222BD', 'R/AO/190626222BD', 'Amuzuo Beriiah', '1639980', 'HTN + Dm', 'Amlodipine 10mg x 1/12, HCT 25mg x 1/12, Losartan 50mg x 1/12, Metformin 500mg BD x 1/12, Glimepiride 2mg dly x 1/12 (30 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10mg x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"HCT 25mg x 1/12"},{"code":"NHIA-12-04-49","name":"Losartan 50mg Tablet Tablet 50mg Tablet","quantity":30,"unit_price":100,"amount":3000,"confidence":"high","source_term":"Losartan 50mg x 1/12"},{"code":"NHIA-17-06-22","name":"Metformin Tablets 500mg","quantity":60,"unit_price":130,"amount":7800,"confidence":"high","source_term":"Metformin 500mg BD x 1/12"},{"code":"NHIA-17-06-18","name":"Glimepiride Tab 2mg","quantity":30,"unit_price":102,"amount":3060,"confidence":"high","source_term":"Glimepiride 2mg dly x 1/12 (30 TABS EACH)"}]'::jsonb, 17160, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 156: Oni Olugbenga (R/AO/190626223BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626223BD', 'R/AO/190626223BD', 'Oni Olugbenga', '1639040', 'Diabetes/ Hypertensive patient/ BPH.', 'Tab tamsulosin 0.04mg Dly x 1/12, Tab Metformin 1000mg BD x 1/12, Tab Glimepiride 2mg Dly x 1/12, Tab Amlodipine 5mg Dly x 1/12 (30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-17-08-03","name":"Tamsulosin Tablet 400mcg Tab","quantity":30,"unit_price":439,"amount":13170,"confidence":"high","source_term":"Tab tamsulosin 0.04mg Dly x 1/12"},{"code":"NHIA-17-06-21","name":"Metformin Tablets 1000mg","quantity":60,"unit_price":106,"amount":6360,"confidence":"high","source_term":"Tab Metformin 1000mg BD x 1/12"},{"code":"NHIA-17-06-18","name":"Glimepiride Tab 2mg","quantity":30,"unit_price":102,"amount":3060,"confidence":"high","source_term":"Tab Glimepiride 2mg Dly x 1/12"},{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Tab Amlodipine 5mg Dly x 1/12 (30 TABS EACH )"}]'::jsonb, 24330, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 157: Elizabeth Ajibade (R/AO/190626224BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626224BD', 'R/AO/190626224BD', 'Elizabeth Ajibade', '1458576', '? Bilateral shoulder lipoma', 'CONSULT',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"CONSULT"}]'::jsonb, 4000, '2026-07-16T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-16T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 158: Olaseyinde yetunde (R/AO/190626225BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626225BD', 'R/AO/190626225BD', 'Olaseyinde yetunde', '2872966', 'Hypertension+ Dyslipidemia', 'Tab Amiloride/ Hydrochlorothiazide Dly x 1/12, Tab Atorvastatin 10mg Dly x 1/12 (30 TABS )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-03-01","name":"Amiloride + Hydrochlorothiazide Tablet 5mg+ 50mg Tab","quantity":30,"unit_price":36,"amount":1080,"confidence":"high","source_term":"Tab Amiloride/ Hydrochlorothiazide Dly x 1/12"},{"code":"NHIA-12-06-01","name":"Atorvastatin Tab/Caps 10mg Tab/ Cap.","quantity":30,"unit_price":122,"amount":3660,"confidence":"high","source_term":"Tab Atorvastatin 10mg Dly x 1/12 (30 TABS )"}]'::jsonb, 4740, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 159: Faith Thomas (R/AO/190626226BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626226BD', 'R/AO/190626226BD', 'Faith Thomas', '2873111', 'DM with good BP control', 'Tab glimepiride 4mg dly x 1/12, Tab Metformin 1000mg bd x 1/12(60 tabs), Tab Lisinopril 5mg x 1/12 Dly, Tab Acetylsalicylic acid 75mg Dly x 1/12 ( 30 tabs each )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-17-06-19","name":"Glimepiride Tab 4mg","quantity":30,"unit_price":128,"amount":3840,"confidence":"high","source_term":"Tab glimepiride 4mg dly x 1/12"},{"code":"NHIA-17-06-21","name":"Metformin Tablets 1000mg","quantity":60,"unit_price":106,"amount":6360,"confidence":"high","source_term":"Tab Metformin 1000mg bd x 1/12(60 tabs)"},{"code":"NHIA-12-04-43","name":"Lisinopril Tablet 2.5mg Tab.","quantity":30,"unit_price":107,"amount":3210,"confidence":"high","source_term":"Tab Lisinopril 5mg x 1/12 Dly"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Tab Acetylsalicylic acid 75mg Dly x 1/12 ( 30 tabs each )"}]'::jsonb, 13740, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 160: Akomolafe Mary (R/AO/190626227BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626227BD', 'R/AO/190626227BD', 'Akomolafe Mary', '1639824', 'Essential Hypertension and DM', 'Tab Lisinopril 10mg dly x 1/12, Tab Metformin 1000mg BD x 1/12, Tab glibenclamide 5mg Dly x 1/12, Tab Amlodipine 10mg Dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"Tab Lisinopril 10mg dly x 1/12"},{"code":"NHIA-17-06-21","name":"Metformin Tablets 1000mg","quantity":60,"unit_price":106,"amount":6360,"confidence":"high","source_term":"Tab Metformin 1000mg BD x 1/12"},{"code":"NHIA-17-06-14","name":"Glibenclamide Tablets 5mg Tab","quantity":30,"unit_price":28,"amount":840,"confidence":"high","source_term":"Tab glibenclamide 5mg Dly x 1/12"},{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Tab Amlodipine 10mg Dly x 1/12"}]'::jsonb, 11640, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 161: Olaleye Sanusi (R/AO/190626228BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626228BD', 'R/AO/190626228BD', 'Olaleye Sanusi', '2839529', 'good BP Control/ ? glycemic control', 'Tab telmisartan 80mg for Dly x 1/12 (30 TABS )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-84","name":"Telmisartan + Hydrochlorthiazide Tablet Telmisartan 80mg/HCTZ 12.5mg Tab","quantity":30,"unit_price":327,"amount":9810,"confidence":"high","source_term":"Tab telmisartan 80mg for Dly x 1/12 (30 TABS )"}]'::jsonb, 9810, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 162: Alice Olowojaiye (R/AO/190626229BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626229BD', 'R/AO/190626229BD', 'Alice Olowojaiye', '2852750', 'Hypertension, Dyslipidemia post stroke review', 'E/U/Cr, FLP',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-181-030","name":"Electrolytes, Urea and Creatinine","quantity":1,"unit_price":9000,"amount":9000,"confidence":"high","source_term":"E/U/Cr"},{"code":"NHIA-181-018","name":"Total Cholesterol 2,500.00 Total Lipid Profile (a-d)","quantity":1,"unit_price":6000,"amount":6000,"confidence":"high","source_term":"FLP"}]'::jsonb, 15000, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 163: GODSON EHIMATIE (R/AO/190626230BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626230BD', 'R/AO/190626230BD', 'GODSON EHIMATIE', '2871050', 'HTN', 'Amlodipine 10mg dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10mg dly x 1/12"}]'::jsonb, 2100, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 164: Adeyemo Adeniyi (R/AO/190626301BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626301BD', 'R/AO/190626301BD', 'Adeyemo Adeniyi', '1458187', 'Glaucoma + Cataract', 'CONSULT',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"CONSULT"}]'::jsonb, 4000, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 165: Sado Imudagbe (R/AO/190626302BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626302BD', 'R/AO/190626302BD', 'Sado Imudagbe', '1638292', 'Goite', 'SOP Specialist review for post Thyroidectomy surgery',
    COALESCE(v_ab10_id, v_jaja_id), 'A. B. 10 HOSPITAL', COALESCE(v_ab10_id, v_jaja_id), 'A. B. 10 HOSPITAL',
    NULL, NULL, COALESCE(v_ab10_id, v_jaja_id), 'A. B. 10 HOSPITAL',
    'pending', 'historical_import', TRUE, '[{"code":"DECLINED","name":"SOP Specialist review for post Thyroidectomy surgery","quantity":1,"unit_price":0,"amount":0,"confidence":"high","source_term":"SOP Specialist review for post Thyroidectomy surgery","declined":true}]'::jsonb, 0, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 166: Lanre Abass Bolatito (R/AO/190626303BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626303BD', 'R/AO/190626303BD', 'Lanre Abass Bolatito', '2871882', 'poorly Controlled Hypertension', 'Losartan 25mg dly x 1/12, bisoprolol 5mg x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-48","name":"Losartan 25mg Tablet Tablet 25mg Tablet","quantity":30,"unit_price":108,"amount":3240,"confidence":"high","source_term":"Losartan 25mg dly x 1/12"},{"code":"NHIA-12-01-11","name":"Bisoprolol 5mg Tablet Tablet 5mg Tablet","quantity":30,"unit_price":178,"amount":5340,"confidence":"high","source_term":"bisoprolol 5mg x 1/12"}]'::jsonb, 8580, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 167: Olayiwola Moshood (R/AO/190626304BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626304BD', 'R/AO/190626304BD', 'Olayiwola Moshood', '1458097', 'HTN + Dyslipidemia + URTI', 'Tab Amlodipine 5mg dly x 1/12, HCT 25mg dly x 1/12, Atorvastatin 10mg dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Tab Amlodipine 5mg dly x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"HCT 25mg dly x 1/12"},{"code":"NHIA-12-06-01","name":"Atorvastatin Tab/Caps 10mg Tab/ Cap.","quantity":30,"unit_price":122,"amount":3660,"confidence":"high","source_term":"Atorvastatin 10mg dly x 1/12"}]'::jsonb, 6600, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 168: Ademola Oduola (R/AO/190626305BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626305BD', 'R/AO/190626305BD', 'Ademola Oduola', '1458553', 'Elevated hypertension', 'Amlodipine 5mg dly x 1/12, Hydrochlorothiazide 25mg dly x 1/12 (30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Amlodipine 5mg dly x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"Hydrochlorothiazide 25mg dly x 1/12 (30 TABS EACH )"}]'::jsonb, 2940, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 169: Akinyele Dorcas Abiodun (R/AO/190626306BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626306BD', 'R/AO/190626306BD', 'Akinyele Dorcas Abiodun', '2173662', 'HTN', 'Tab Amlodipine 5mg dly x 1/12, Clopidogrel 75 mg dly x 1/12, Tab Hydrochlorothiazide 25mg dly x 1/12 ( 30 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Tab Amlodipine 5mg dly x 1/12"},{"code":"NHIA-11-03-04","name":"Clopidogrel Tablet 75mg Tab.","quantity":30,"unit_price":190,"amount":5700,"confidence":"high","source_term":"Clopidogrel 75 mg dly x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"Tab Hydrochlorothiazide 25mg dly x 1/12 ( 30 TABS EACH)"}]'::jsonb, 8640, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 170: Iyanda Bamiji (R/AO/190626307BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626307BD', 'R/AO/190626307BD', 'Iyanda Bamiji', '1458201', 'HTN', 'Tab Amlodipine 5mg dly x 1/12, Tab Vasoprin 75mg daily x 1/12 ( 30 TAB EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Tab Amlodipine 5mg dly x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Tab Vasoprin 75mg daily x 1/12 ( 30 TAB EACH )"}]'::jsonb, 2070, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 171: Oyekunle Bunmi (R/AO/190626308BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626308BD', 'R/AO/190626308BD', 'Oyekunle Bunmi', '7842257', 'Hypertension, DM, dyslipidemia, Psychosis', 'Lisinopril 10mg dly x 1/12, Amlodipine 10mg dly, Bisoprolol 5mg dly x 1/12, Atorvastatin 10mg dly x 1/12, Benxehexol 5mg dly x 1/12, Chlorpromazine 300mg dly x 1/12, Metformin 1000mg dly x 1/12, Glimepiride 4mg dly x 1/12 (30 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"Lisinopril 10mg dly x 1/12"},{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10mg dly"},{"code":"NHIA-12-01-11","name":"Bisoprolol 5mg Tablet Tablet 5mg Tablet","quantity":30,"unit_price":178,"amount":5340,"confidence":"high","source_term":"Bisoprolol 5mg dly x 1/12"},{"code":"NHIA-12-06-01","name":"Atorvastatin Tab/Caps 10mg Tab/ Cap.","quantity":30,"unit_price":122,"amount":3660,"confidence":"high","source_term":"Atorvastatin 10mg dly x 1/12"},{"code":"NHIA-09-01-02","name":"Benzhexol Tablets 5 mg (as HCl) Tab.","quantity":30,"unit_price":16,"amount":480,"confidence":"high","source_term":"Benxehexol 5mg dly x 1/12"},{"code":"NHIA-23-03-06","name":"Chlorpromazine Tablet 100mg (HCL) Tab.","quantity":30,"unit_price":82,"amount":2460,"confidence":"high","source_term":"Chlorpromazine 300mg dly x 1/12"},{"code":"NHIA-17-06-21","name":"Metformin Tablets 1000mg","quantity":30,"unit_price":106,"amount":3180,"confidence":"high","source_term":"Metformin 1000mg dly x 1/12"},{"code":"NHIA-17-06-19","name":"Glimepiride Tab 4mg","quantity":30,"unit_price":128,"amount":3840,"confidence":"high","source_term":"Glimepiride 4mg dly x 1/12 (30 TABS EACH)"}]'::jsonb, 23400, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 172: Ibenegbu Chioma comfort (R/AO/190626309BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626309BD', 'R/AO/190626309BD', 'Ibenegbu Chioma comfort', '2716990', 'Severe hypertension secondary to poor drug compliance + hypokalemia', 'Tab HCT 25 mg 1/12 (30 TABS), Potassium chloride i dly x 2/52 ( 14 TABS )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"Tab HCT 25 mg 1/12 (30 TABS)"},{"code":"MANUAL_REVIEW","name":"Potassium chloride i dly x 2/52 ( 14 TABS )","quantity":14,"unit_price":0,"amount":0,"confidence":"manual","source_term":"Potassium chloride i dly x 2/52 ( 14 TABS )"}]'::jsonb, 1200, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 173: Ayankoso Rachael (R/AO/190626310BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626310BD', 'R/AO/190626310BD', 'Ayankoso Rachael', '2852795', 'Presbyopia', 'Consultation, Manual Refraction, D/O, Glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 31000, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 174: Fabian Ibeto (R/AO/190626311BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626311BD', 'R/AO/190626311BD', 'Fabian Ibeto', '7842443', 'HTN+ myelopathy atrain', 'Tab Amlodipine 5mg dly x 1/12 (30 TABS )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Tab Amlodipine 5mg dly x 1/12 (30 TABS )"}]'::jsonb, 1740, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 175: Olusi Aderonke (R/AO/190626312BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626312BD', 'R/AO/190626312BD', 'Olusi Aderonke', '1639255', 'HTN', 'Acetyl salicyclic acid 75mg dly x 1/12, Amlodipine 5mg dly x 1/12 (30 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Acetyl salicyclic acid 75mg dly x 1/12"},{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Amlodipine 5mg dly x 1/12 (30 TABS EACH)"}]'::jsonb, 2070, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 176: Daramola Catherine (R/AO/190626313BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626313BD', 'R/AO/190626313BD', 'Daramola Catherine', '2173423', 'Hypertension + PUD', 'Tab Amlodipine 5mg dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Tab Amlodipine 5mg dly x 1/12"}]'::jsonb, 1740, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 177: Ajayi Olaitan (R/AO/190626314BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626314BD', 'R/AO/190626314BD', 'Ajayi Olaitan', '1639183', 'Hypertensive heart disease', 'FOLLW UP',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-002","name":"Specialist Review (Per visit)","quantity":1,"unit_price":2600,"amount":2600,"confidence":"high","source_term":"FOLLW UP"}]'::jsonb, 2600, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 178: Tehingbola Akinola (R/AO/190626315BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626315BD', 'R/AO/190626315BD', 'Tehingbola Akinola', '2871250', 'HTN', 'Lisinopril 10mg dly x 1/12, Amlodipine 10mg Dly x 1/12 (30 TABS )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"Lisinopril 10mg dly x 1/12"},{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10mg Dly x 1/12 (30 TABS )"}]'::jsonb, 4440, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 179: Justina Dikeogu (R/AO/190626316BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626316BD', 'R/AO/190626316BD', 'Justina Dikeogu', '1637707', 'Presbyopia', 'Consultation, Manual Refraction, D/O, Glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 31000, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 180: Tehingbola Folake (R/AO/190626317BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626317BD', 'R/AO/190626317BD', 'Tehingbola Folake', '2871250', 'Oligomenorrhoea? Hormonal imbalance', 'Pelvic scan',
    v_police_id, 'POLICE CLINIC, AGODI', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_police_id, 'POLICE CLINIC, AGODI', v_police_id, 'POLICE CLINIC, AGODI',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-179-006","name":"Abdominal Pelvic Scan","quantity":1,"unit_price":8500,"amount":8500,"confidence":"high","source_term":"Pelvic scan"}]'::jsonb, 8500, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 181: Olaogun Kayode (R/AO/190626318BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626318BD', 'R/AO/190626318BD', 'Olaogun Kayode', '2839684', 'Pterygium', 'FOLLOW UP',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-002","name":"Specialist Review (Per visit)","quantity":1,"unit_price":2600,"amount":2600,"confidence":"high","source_term":"FOLLOW UP"}]'::jsonb, 2600, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 182: Olusi Aderonke (R/AO/190626319BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626319BD', 'R/AO/190626319BD', 'Olusi Aderonke', '1639255', 'Dyslipidemia with background HTN', 'FLP',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-181-018","name":"Total Cholesterol 2,500.00 Total Lipid Profile (a-d)","quantity":1,"unit_price":6000,"amount":6000,"confidence":"high","source_term":"FLP"}]'::jsonb, 6000, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 183: Alice Olowojaiye (R/AO/190626320BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626320BD', 'R/AO/190626320BD', 'Alice Olowojaiye', '2852750', 'Dementia', 'Tab donepezil 5mg daily x 1/12 (30 TABS )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-10-02-02","name":"Donepezil HCL Tablet 5mg, 10mg tablet","quantity":30,"unit_price":417,"amount":12510,"confidence":"high","source_term":"Tab donepezil 5mg daily x 1/12 (30 TABS )"}]'::jsonb, 12510, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 184: Olaniyi Ilori (R/AO/190626321BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626321BD', 'R/AO/190626321BD', 'Olaniyi Ilori', '1639573', 'Systemic Hypertension', 'Tab Nifedipine 20mg B.D x 1/12(600 TABS), Amiloride/Hydrochlorothiazide dly x 1/12, Vasoprin 75mg dly 1/12, Lisinopril 10mg dly 1/12 (30 TABS EACH FOR THE REST )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-59","name":"Nifedipine Tablet, 20mg Tab.","quantity":600,"unit_price":67,"amount":40200,"confidence":"high","source_term":"Tab Nifedipine 20mg B.D x 1/12(600 TABS)"},{"code":"NHIA-12-03-01","name":"Amiloride + Hydrochlorothiazide Tablet 5mg+ 50mg Tab","quantity":30,"unit_price":36,"amount":1080,"confidence":"high","source_term":"Amiloride/Hydrochlorothiazide dly x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Vasoprin 75mg dly 1/12"},{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"Lisinopril 10mg dly 1/12 (30 TABS EACH FOR THE REST )"}]'::jsonb, 43950, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 185: Maria Ogunsola (R/AO/190626322BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626322BD', 'R/AO/190626322BD', 'Maria Ogunsola', '1458676', 'Lipoma', 'CONSULT',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"CONSULT"}]'::jsonb, 4000, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 186: Somide Oluwaseun (R/AO/190626323BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626323BD', 'R/AO/190626323BD', 'Somide Oluwaseun', '2873274', 'Diabetes Mellitus, Hypertension', 'Tab Amlodipine 10mg daily x 1/12, Tab Lisinopril 5mg daily x 1/12, Tab Metformin 1000mg daily x 1/12, Tab Daonil 5mg daily x 1/12, Tab Acetylsalicylic 75mg daily x 1/12, Lipid Profile, E/U/Cr',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Tab Amlodipine 10mg daily x 1/12"},{"code":"NHIA-12-04-43","name":"Lisinopril Tablet 2.5mg Tab.","quantity":30,"unit_price":107,"amount":3210,"confidence":"high","source_term":"Tab Lisinopril 5mg daily x 1/12"},{"code":"NHIA-17-06-21","name":"Metformin Tablets 1000mg","quantity":30,"unit_price":106,"amount":3180,"confidence":"high","source_term":"Tab Metformin 1000mg daily x 1/12"},{"code":"NHIA-17-06-14","name":"Glibenclamide Tablets 5mg Tab","quantity":30,"unit_price":28,"amount":840,"confidence":"high","source_term":"Tab Daonil 5mg daily x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Tab Acetylsalicylic 75mg daily x 1/12"},{"code":"NHIA-181-018","name":"Total Cholesterol 2,500.00 Total Lipid Profile (a-d)","quantity":1,"unit_price":6000,"amount":6000,"confidence":"high","source_term":"Lipid Profile"},{"code":"NHIA-181-030","name":"Electrolytes, Urea and Creatinine","quantity":1,"unit_price":9000,"amount":9000,"confidence":"high","source_term":"E/U/Cr"}]'::jsonb, 24660, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 187: Olagunju Alice (R/AO/190626324BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626324BD', 'R/AO/190626324BD', 'Olagunju Alice', '2873004', 'DM, Hypertension', 'Tab Metformin 1000mg BD Daily x 1/12, Amlodipine 5mg daily x 1/12, Insulisn 1 pen',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-17-06-21","name":"Metformin Tablets 1000mg","quantity":60,"unit_price":106,"amount":6360,"confidence":"high","source_term":"Tab Metformin 1000mg BD Daily x 1/12"},{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Amlodipine 5mg daily x 1/12"},{"code":"NHIA-17-06-03","name":"Insulin Soluble Injection 100 units/ml Vial","quantity":1,"unit_price":12474,"amount":12474,"confidence":"high","source_term":"Insulisn 1 pen"}]'::jsonb, 20574, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 188: Adewale Awojesu (R/AO/190626325BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626325BD', 'R/AO/190626325BD', 'Adewale Awojesu', '1640227', 'Hypertension', 'Tab Amlodipine 10mg dly 1/12, Lisinopril 10mg dly 1/12, Vasoprin 75mg dly 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Tab Amlodipine 10mg dly 1/12"},{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"Lisinopril 10mg dly 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Vasoprin 75mg dly 1/12"}]'::jsonb, 4770, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 189: Maria Ogunsola (R/AO/190626326BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626326BD', 'R/AO/190626326BD', 'Maria Ogunsola', '1458676', 'Hypertensive urgency', 'Tab Amlodipine 10mg daily x 2/52, Tab Hydrochlorothiazide 25mg daily x 2/52 (14 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":14,"unit_price":70,"amount":980,"confidence":"high","source_term":"Tab Amlodipine 10mg daily x 2/52"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":14,"unit_price":40,"amount":560,"confidence":"high","source_term":"Tab Hydrochlorothiazide 25mg daily x 2/52 (14 TABS EACH )"}]'::jsonb, 1540, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 190: Akande Adebola (R/AO/190626327BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626327BD', 'R/AO/190626327BD', 'Akande Adebola', '2871171', 'HTN', 'Atenolol 50mg, Lisinopril 5mg, Spironolactone 25mg for drugs for one month (30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-01-02","name":"Atenolol Tablet 50mg Tab","quantity":30,"unit_price":119,"amount":3570,"confidence":"high","source_term":"Atenolol 50mg"},{"code":"NHIA-12-04-43","name":"Lisinopril Tablet 2.5mg Tab.","quantity":30,"unit_price":107,"amount":3210,"confidence":"high","source_term":"Lisinopril 5mg"},{"code":"NHIA-12-03-07","name":"Spironolactone Tablet 25mg Tab.","quantity":30,"unit_price":86,"amount":2580,"confidence":"high","source_term":"Spironolactone 25mg for drugs for one month (30 TABS EACH )"}]'::jsonb, 9360, '2026-07-17T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-17T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 191: Fadeyibi Victor (R/AO/190626328BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626328BD', 'R/AO/190626328BD', 'Fadeyibi Victor', '2873084', 'DM, HTN', 'Tab Acetylsalicylic acid 75mg dly ×1/12, Tab metformin 1000mg b.d ×1/12 (60 TABS ) , Amlodipine 10mg dly, Lisinopril 10mg dly ×1/12 (30 TABS EACH )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Tab Acetylsalicylic acid 75mg dly ×1/12"},{"code":"NHIA-17-06-21","name":"Metformin Tablets 1000mg","quantity":60,"unit_price":106,"amount":6360,"confidence":"high","source_term":"Tab metformin 1000mg b.d ×1/12 (60 TABS )"},{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10mg dly"},{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"Lisinopril 10mg dly ×1/12 (30 TABS EACH )"}]'::jsonb, 11130, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 192: Odeseye Adenike (R/AO/190626329BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626329BD', 'R/AO/190626329BD', 'Odeseye Adenike', '2870839', 'Refractive Error', 'consultation, manual refraction, D.O, glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 31000, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 193: Lamidi Mufutau (R/AO/190626330BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626330BD', 'R/AO/190626330BD', 'Lamidi Mufutau', '1638237', 'Hypertension', 'Tab Acetylsalicylic acid 75mg x 1/12, Amlodipine 5mg dly 1/12, Losartan 50mg dly 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Tab Acetylsalicylic acid 75mg x 1/12"},{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Amlodipine 5mg dly 1/12"},{"code":"NHIA-12-04-49","name":"Losartan 50mg Tablet Tablet 50mg Tablet","quantity":30,"unit_price":100,"amount":3000,"confidence":"high","source_term":"Losartan 50mg dly 1/12"}]'::jsonb, 5070, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 194: Anyaeche Christopher (R/AO/190626331BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626331BD', 'R/AO/190626331BD', 'Anyaeche Christopher', '2556955', 'BPH', 'FOLLOW UP',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-002","name":"Specialist Review (Per visit)","quantity":1,"unit_price":2600,"amount":2600,"confidence":"high","source_term":"FOLLOW UP"}]'::jsonb, 2600, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 195: MODUPE BELLO (R/AO/190626332BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626332BD', 'R/AO/190626332BD', 'MODUPE BELLO', '1500113', 'Glaucoma', 'CONSULT',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    NULL, NULL, v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"CONSULT"}]'::jsonb, 4000, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 196: Alege Emmanuel (R/AO/190626333BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626333BD', 'R/AO/190626333BD', 'Alege Emmanuel', '1640066', 'HTN', 'Amlodipine 10mg dly x 1/12, Losartan 50mg dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10mg dly x 1/12"},{"code":"NHIA-12-04-49","name":"Losartan 50mg Tablet Tablet 50mg Tablet","quantity":30,"unit_price":100,"amount":3000,"confidence":"high","source_term":"Losartan 50mg dly x 1/12"}]'::jsonb, 5100, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 197: Owumi Angela (R/AO/190626334BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626334BD', 'R/AO/190626334BD', 'Owumi Angela', '1458084', 'HTN', 'Tab Amlodipine 5mg x 1/12, Tab Vasoprin 75mgdly x 1/12, Tab losartan 50mg x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Tab Amlodipine 5mg x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Tab Vasoprin 75mgdly x 1/12"},{"code":"NHIA-12-04-49","name":"Losartan 50mg Tablet Tablet 50mg Tablet","quantity":30,"unit_price":100,"amount":3000,"confidence":"high","source_term":"Tab losartan 50mg x 1/12"}]'::jsonb, 5070, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 198: Oyeyebi Nureni (R/AO/190626335BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626335BD', 'R/AO/190626335BD', 'Oyeyebi Nureni', '2173605', 'Hypertension + Myofascial Strain', 'Amlodipine 5mg dly x 1/12,, Acetylsalicylic 75mg DLY x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Amlodipine 5mg dly x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Acetylsalicylic 75mg DLY x 1/12"}]'::jsonb, 2070, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 199: Opadare Oluwaseun (R/AO/190626336BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626336BD', 'R/AO/190626336BD', 'Opadare Oluwaseun', '2870779', 'Acute on Chronic Apical Periodintitis of T6', 'Extraction of T6',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    NULL, NULL, v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-070-004","name":"Simple Tooth Extraction","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Extraction"}]'::jsonb, 4000, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 200: Faloye John (R/AO/190626337BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626337BD', 'R/AO/190626337BD', 'Faloye John', '1458637', 'Fracture of the left femur', 'XRAY',
    v_police_id, 'POLICE CLINIC, AGODI', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_police_id, 'POLICE CLINIC, AGODI', v_police_id, 'POLICE CLINIC, AGODI',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-173-001","name":"Chest (PA/AP) (1 view)","quantity":1,"unit_price":6000,"amount":6000,"confidence":"high","source_term":"XRAY"}]'::jsonb, 6000, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 201: Akinbode Elizabeth (R/AO/190626338BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626338BD', 'R/AO/190626338BD', 'Akinbode Elizabeth', '2173406', 'HTN', 'Tab Hydrochlorothiazide 25mg x 1/12, Tab Amlodipine 10mg x 1/12, Tab Atorvastatin 10 mg dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"Tab Hydrochlorothiazide 25mg x 1/12"},{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Tab Amlodipine 10mg x 1/12"},{"code":"NHIA-12-06-01","name":"Atorvastatin Tab/Caps 10mg Tab/ Cap.","quantity":30,"unit_price":122,"amount":3660,"confidence":"high","source_term":"Tab Atorvastatin 10 mg dly x 1/12"}]'::jsonb, 6960, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 202: Akomolafe olufunke (R/AO/190626339BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626339BD', 'R/AO/190626339BD', 'Akomolafe olufunke', '2871832', 'HTN, PUD, Myofractic strain', 'Lisinopril 5mg dly 1/12 Modiuretic T dly',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-43","name":"Lisinopril Tablet 2.5mg Tab.","quantity":30,"unit_price":107,"amount":3210,"confidence":"high","source_term":"Lisinopril 5mg dly 1/12 Modiuretic T dly"}]'::jsonb, 3210, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 203: Ademola Moshood (R/AO/190626340BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626340BD', 'R/AO/190626340BD', 'Ademola Moshood', '1458013', 'HTN and DM', 'Tab Lisinopril 10mg dly 1/12, Metformin 1000mg bd x 1/12, Glimepiride 2mg dly x 1/12, Clopidogrel 75mg dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"Tab Lisinopril 10mg dly 1/12"},{"code":"NHIA-17-06-21","name":"Metformin Tablets 1000mg","quantity":60,"unit_price":106,"amount":6360,"confidence":"high","source_term":"Metformin 1000mg bd x 1/12"},{"code":"NHIA-17-06-18","name":"Glimepiride Tab 2mg","quantity":30,"unit_price":102,"amount":3060,"confidence":"high","source_term":"Glimepiride 2mg dly x 1/12"},{"code":"NHIA-11-03-04","name":"Clopidogrel Tablet 75mg Tab.","quantity":30,"unit_price":190,"amount":5700,"confidence":"high","source_term":"Clopidogrel 75mg dly x 1/12"}]'::jsonb, 17460, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 204: Andrew Adebayo (R/AO/190626341BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626341BD', 'R/AO/190626341BD', 'Andrew Adebayo', '1500639', 'HTN', 'Tab Amlodipine 5mgdly x 1/12 (30 TABS )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Tab Amlodipine 5mgdly x 1/12 (30 TABS )"}]'::jsonb, 1740, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 205: Adetunji Kayode (R/AO/190626342BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626342BD', 'R/AO/190626342BD', 'Adetunji Kayode', '1638578', 'Osteoarthritis Hypertension, Background Asthma', 'Tab Lisinopril 50mg dly x 1/12 (30 TABS ) , Diclofenac+ misoprostol 75mg BD x 5/7 (10 TABS )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-43","name":"Lisinopril Tablet 2.5mg Tab.","quantity":30,"unit_price":107,"amount":3210,"confidence":"medium","source_term":"Tab Lisinopril 50mg dly x 1/12 (30 TABS )"},{"code":"NHIA-02-04-11","name":"Diclofenac sodium + Cholestyramine Tablet 75mg/65mg Tab","quantity":10,"unit_price":317,"amount":3170,"confidence":"high","source_term":"Diclofenac+ misoprostol 75mg BD x 5/7 (10 TABS )"}]'::jsonb, 6380, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 206: Abiola Folorunso (R/AO/190626343BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626343BD', 'R/AO/190626343BD', 'Abiola Folorunso', '2716976', 'HTN /dyslipidemia', 'Tab Indapimide 1.5mg dly x 1/12 , Tab atorvastatin 20mg Dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-31","name":"Indapamide 1.5mg tab Tab 1.5mg Tab","quantity":30,"unit_price":310,"amount":9300,"confidence":"high","source_term":"Tab Indapimide 1.5mg dly x 1/12"},{"code":"NHIA-12-06-02","name":"Atorvastatin Tab/Caps 20mg Tab/ Cap.","quantity":30,"unit_price":154,"amount":4620,"confidence":"high","source_term":"Tab atorvastatin 20mg Dly x 1/12"}]'::jsonb, 13920, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 207: Amao Josephine (DECLINED without code)
  IF NOT EXISTS (SELECT 1 FROM public.authorization_requests WHERE request_id = 'REQ-HIST-0207') THEN
    INSERT INTO public.authorization_requests (
      request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
      hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
      referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
      status, source, is_historical, approved_items, total_amount, decided_at,
      authorized_by_name, submitted_by, decided_by, created_at, updated_at
    ) VALUES (
      'REQ-HIST-0207', NULL, 'Amao Josephine', '2872928', 'Refractive Error', 'consultation, manual refraction, D.O, Tonometry, glasses',
      v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
      NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
      'declined', 'historical_import', TRUE, '[{"code":"DECLINED","name":"consultation, manual refraction, D.O, Tonometry, glasses","quantity":1,"unit_price":0,"amount":0,"confidence":"high","source_term":"consultation, manual refraction, D.O, Tonometry, glasses","declined":true}]'::jsonb, 0, '2026-07-23T12:00:00.000Z'::timestamptz,
      'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
    );
  END IF;

  -- Row 208: Jacob Udeme (R/AO/190626344BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626344BD', 'R/AO/190626344BD', 'Jacob Udeme', '2839735', 'Diabetes Mellitus', 'Metformin 1000mg am, 500mg nocte x 1/12, glimepiride 2mg dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-17-06-21","name":"Metformin Tablets 1000mg","quantity":30,"unit_price":106,"amount":3180,"confidence":"high","source_term":"Metformin 1000mg am"},{"code":"NHIA-17-06-22","name":"Metformin Tablets 500mg","quantity":30,"unit_price":130,"amount":3900,"confidence":"high","source_term":"Metformin 500mg nocte x 1/12"},{"code":"NHIA-17-06-18","name":"Glimepiride Tab 2mg","quantity":30,"unit_price":102,"amount":3060,"confidence":"high","source_term":"glimepiride 2mg dly x 1/12"}]'::jsonb, 10140, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 209: Onifade Adekunle (R/AO/190626345BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626345BD', 'R/AO/190626345BD', 'Onifade Adekunle', '2873174', 'Poorly controlled Hypertension', 'Tab Amlodipine 5mg dly 1/12, Lisinopril 5mg dly 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Tab Amlodipine 5mg dly 1/12"},{"code":"NHIA-12-04-43","name":"Lisinopril Tablet 2.5mg Tab.","quantity":30,"unit_price":107,"amount":3210,"confidence":"high","source_term":"Lisinopril 5mg dly 1/12"}]'::jsonb, 4950, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 210: Owumi Angela (R/AO/190626346BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626346BD', 'R/AO/190626346BD', 'Owumi Angela', '1458084', 'Increase in ocular pressure', 'Tonometry',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-081-003","name":"Tonometry (Pulsair/Goldmann Applanation)","quantity":1,"unit_price":4562.5,"amount":4562.5,"confidence":"high","source_term":"Tonometry"}]'::jsonb, 4562.5, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 211: Okunade Oladunni (R/AO/190626347BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626347BD', 'R/AO/190626347BD', 'Okunade Oladunni', '2839480', 'Poorly controlled Hypertension', 'Tab Amlodipine 5mg dly 1/12, telmisartan 40mg x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Tab Amlodipine 5mg dly 1/12"},{"code":"NHIA-12-04-81","name":"Telmisartan Tablet Telmisartan 40mg Tab","quantity":30,"unit_price":270,"amount":8100,"confidence":"high","source_term":"telmisartan 40mg x 1/12"}]'::jsonb, 9840, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 212: Oyewole Babatunde (R/AO/190626348BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626348BD', 'R/AO/190626348BD', 'Oyewole Babatunde', '1638406', 'HTN', 'Amlodipine 5mg dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Amlodipine 5mg dly x 1/12"}]'::jsonb, 1740, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 213: Olusola Oyetunji (R/AO/190626349BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626349BD', 'R/AO/190626349BD', 'Olusola Oyetunji', '1638781', 'Hypertension + DM + BPH in UTI', 'PSA',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-181-082","name":"Prostate Specific Antigen (PSA): (a - b)","quantity":1,"unit_price":15000,"amount":15000,"confidence":"high","source_term":"PSA"}]'::jsonb, 15000, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 214: Olusola Oyetunji (R/AO/190626350BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626350BD', 'R/AO/190626350BD', 'Olusola Oyetunji', '1638781', 'Hypertension + DM + dyslipidemia', 'tab Amlodipine 10mg x 1/12, tab Metformin 1000mg b.d x 1/12 (60), tab Glimepiride 4mg dly x 1/12, Atorvastatin 20mg x 1/12, Clopidogrel 75mg dly x 1/12. (30 EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"tab Amlodipine 10mg x 1/12"},{"code":"NHIA-17-06-21","name":"Metformin Tablets 1000mg","quantity":60,"unit_price":106,"amount":6360,"confidence":"high","source_term":"tab Metformin 1000mg b.d x 1/12 (60)"},{"code":"NHIA-17-06-19","name":"Glimepiride Tab 4mg","quantity":30,"unit_price":128,"amount":3840,"confidence":"high","source_term":"tab Glimepiride 4mg dly x 1/12"},{"code":"NHIA-12-06-02","name":"Atorvastatin Tab/Caps 20mg Tab/ Cap.","quantity":30,"unit_price":154,"amount":4620,"confidence":"high","source_term":"Atorvastatin 20mg x 1/12"},{"code":"NHIA-11-03-04","name":"Clopidogrel Tablet 75mg Tab.","quantity":30,"unit_price":190,"amount":5700,"confidence":"high","source_term":"Clopidogrel 75mg dly x 1/12. (30 EACH)"}]'::jsonb, 22620, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 215: Dorcas Oyebanji (R/AO/190626351BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626351BD', 'R/AO/190626351BD', 'Dorcas Oyebanji', '1637671', 'HTN', 'Amlodipine 20mg DLY x 1/12, Moduretic 5Mg DLY x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"medium","source_term":"Amlodipine 20mg DLY x 1/12"},{"code":"NHIA-12-03-01","name":"Amiloride + Hydrochlorothiazide Tablet 5mg+ 50mg Tab","quantity":30,"unit_price":36,"amount":1080,"confidence":"high","source_term":"Moduretic 5Mg DLY x 1/12"}]'::jsonb, 2820, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 216: Adebiyi Sheriff (R/AO/190626352BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626352BD', 'R/AO/190626352BD', 'Adebiyi Sheriff', '1639875', 'Hypertension', 'Lisinopril 10mg Dly x 1/12, hydrochlorothiazide 25mg Dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"Lisinopril 10mg Dly x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"hydrochlorothiazide 25mg Dly x 1/12"}]'::jsonb, 3540, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 217: OLUEBUBECHUKWU EKEMEZIE (R/AO/190626353BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626353BD', 'R/AO/190626353BD', 'OLUEBUBECHUKWU EKEMEZIE', '2872805', 'pes planusi ?Plantar fascitis', 'FOLLOW UP',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-002","name":"Specialist Review (Per visit)","quantity":1,"unit_price":2600,"amount":2600,"confidence":"high","source_term":"FOLLOW UP"}]'::jsonb, 2600, '2026-07-23T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-23T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 218: Olaniran Farodoye (R/AO/190626354BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626354BD', 'R/AO/190626354BD', 'Olaniran Farodoye', '2872384', 'HYPERTENSION', 'Lisinopril 10mg dly×1/12, Amlodipine 10mg Dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"Lisinopril 10mg dly×1/12"},{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10mg Dly x 1/12"}]'::jsonb, 4440, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 219: Aleru Jonathan (R/AO/190626355BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626355BD', 'R/AO/190626355BD', 'Aleru Jonathan', '1637486', 'Hypertension and DM', 'tab Lisinopril 10mg dly x 1/12, tab Acetylsalicylic acid 75mg dly x 1/12, tab hydrochlorothiazide 12.5mg dly x 1/12 , Tab Atenolol 25mg dly x 1/12(30 TABS EACH), Tab Metformin 500mg BD 1/12 (60 TABS )',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"tab Lisinopril 10mg dly x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"tab Acetylsalicylic acid 75mg dly x 1/12"},{"code":"NHIA-12-04-58","name":"Nebivolol + Hydrochlorothiazide Tablet 5mg /12.5mg Tablet","quantity":30,"unit_price":200,"amount":6000,"confidence":"high","source_term":"tab hydrochlorothiazide 12.5mg dly x 1/12"},{"code":"NHIA-12-01-01","name":"Atenolol Tablet 25mg Tab","quantity":30,"unit_price":115,"amount":3450,"confidence":"high","source_term":"Tab Atenolol 25mg dly x 1/12(30 TABS EACH)"},{"code":"NHIA-17-06-22","name":"Metformin Tablets 500mg","quantity":60,"unit_price":130,"amount":7800,"confidence":"high","source_term":"Tab Metformin 500mg BD 1/12 (60 TABS )"}]'::jsonb, 19920, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 220: Adebola Ojo (R/AO/1906256356BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO1906256356BD', 'R/AO/1906256356BD', 'Adebola Ojo', '7842468', 'Hypercholesterolemia KIV hyperglycemia', 'FLP',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-181-018","name":"Total Cholesterol 2,500.00 Total Lipid Profile (a-d)","quantity":1,"unit_price":6000,"amount":6000,"confidence":"high","source_term":"FLP"}]'::jsonb, 6000, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 221: Adeola Abiola (R/AO/190626357BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626357BD', 'R/AO/190626357BD', 'Adeola Abiola', '2557123', 'HTN', 'methyldopa 25mg x 1/12 BD, Clopidogrel 75mg Dly x 1/12, telmisartan 80mg Dly x 1/12, Indapimide 1.5mg Dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-51","name":"Methyldopa Tablet 500mg Tablet","quantity":60,"unit_price":69,"amount":4140,"confidence":"medium","source_term":"methyldopa 25mg x 1/12 BD"},{"code":"NHIA-11-03-04","name":"Clopidogrel Tablet 75mg Tab.","quantity":30,"unit_price":190,"amount":5700,"confidence":"high","source_term":"Clopidogrel 75mg Dly x 1/12"},{"code":"NHIA-12-04-84","name":"Telmisartan + Hydrochlorthiazide Tablet Telmisartan 80mg/HCTZ 12.5mg Tab","quantity":30,"unit_price":327,"amount":9810,"confidence":"high","source_term":"telmisartan 80mg Dly x 1/12"},{"code":"NHIA-12-04-31","name":"Indapamide 1.5mg tab Tab 1.5mg Tab","quantity":30,"unit_price":310,"amount":9300,"confidence":"high","source_term":"Indapimide 1.5mg Dly x 1/12"}]'::jsonb, 28950, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 222: Ebelechukwu Ajuka (R/AO/190626358BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626358BD', 'R/AO/190626358BD', 'Ebelechukwu Ajuka', '2873194', 'Oblique fracture of distal L fibula', 'FOLLOW UP',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-002","name":"Specialist Review (Per visit)","quantity":1,"unit_price":2600,"amount":2600,"confidence":"high","source_term":"FOLLOW UP"}]'::jsonb, 2600, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 223: Alli JESUSEMEN (R/AO/190626359BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626359BD', 'R/AO/190626359BD', 'Alli JESUSEMEN', '2871812', 'Presbyopia', 'Manual refraction, Consultation, Direct ophthalmoscopy, Glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 31000, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 224: Olutayo Omobowale (R/AO/190626360BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626360BD', 'R/AO/190626360BD', 'Olutayo Omobowale', '2871325', 'Myopic Astigmatism', 'Manual refraction, Consultation, Direct ophthalmoscopy, Glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 31000, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 225: Temitope Fatona (R/AO/190626361BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626361BD', 'R/AO/190626361BD', 'Temitope Fatona', '1638220', 'Essential Hypertension', 'Nifedipine 20mg BD x 1/12, Hydrochlorothiazide 25mg Dly x 1/12, Vasoprin 75mg Dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-59","name":"Nifedipine Tablet, 20mg Tab.","quantity":60,"unit_price":67,"amount":4020,"confidence":"high","source_term":"Nifedipine 20mg BD x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"Hydrochlorothiazide 25mg Dly x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Vasoprin 75mg Dly x 1/12"}]'::jsonb, 5550, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 226: Olutola Favour (R/AO/190626362BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626362BD', 'R/AO/190626362BD', 'Olutola Favour', '7842140', 'Angles Class 1 malocclusion on SK1 complicated by palately, peg shaped, severe spacing', 'Extraction of retained deciduous teeth',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-070-004","name":"Simple Tooth Extraction","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Extraction"}]'::jsonb, 4000, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 227: Ategbero Lydia (R/AO/190626363BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626363BD', 'R/AO/190626363BD', 'Ategbero Lydia', '1637584', 'Painful Ingrowing toe nail (Big toe)', 'CONSULT',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"CONSULT"}]'::jsonb, 4000, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 228: Ategbero Lydia (R/AO/190626364BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626364BD', 'R/AO/190626364BD', 'Ategbero Lydia', '1637584', 'HTN', 'Amlodipine 10mg dly x 1/12, HCT 25mg dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10mg dly x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"HCT 25mg dly x 1/12"}]'::jsonb, 3300, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 229: Oyediran Kabir (R/AO/190626365BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626365BD', 'R/AO/190626365BD', 'Oyediran Kabir', '2870716', 'Chronic diarrhea', 'Stool microscopy and culture',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-183-004","name":"a) Microscopy R/E only","quantity":1,"unit_price":2314.29,"amount":2314.29,"confidence":"high","source_term":"Stool microscopy and culture"}]'::jsonb, 2314.29, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 230: Babalola Funmilola (R/AO/190626366BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626366BD', 'R/AO/190626366BD', 'Babalola Funmilola', '2871400', 'HTN', 'Amlodipine 5mg dly x 1/12, Vasoprin 75mg dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-02","name":"Amlodipine Tablet (Besylate) 5mg Tab.","quantity":30,"unit_price":58,"amount":1740,"confidence":"high","source_term":"Amlodipine 5mg dly x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Vasoprin 75mg dly x 1/12"}]'::jsonb, 2070, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 231: Adewoyin Dauda (R/AO/190626367BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626367BD', 'R/AO/190626367BD', 'Adewoyin Dauda', '2173415', 'Lumbar Spondylosis', '2 sessions of physiotherapy',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-133-005","name":"Physiotherapy (2 Sessions)","quantity":2,"unit_price":7500,"amount":15000,"confidence":"high","source_term":"2 sessions of physiotherapy"}]'::jsonb, 15000, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 232: Ige Salome (R/AO/190626368BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626368BD', 'R/AO/190626368BD', 'Ige Salome', '2870595', 'Retained deciduous 2nd molar', 'Extraction',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-070-004","name":"Simple Tooth Extraction","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Extraction"}]'::jsonb, 4000, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 233: ELLIOT AJIBOYE (R/AO/190626369BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626369BD', 'R/AO/190626369BD', 'ELLIOT AJIBOYE', '1458179', 'HTN + Arthritis', 'AMLODIPINE 10MG DLY x 1/12, HCT 25MG DLY x 1/12, LISINOPRIL 10MG DLY x 1/12, Clopidogrel 75mg dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"AMLODIPINE 10MG DLY x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"HCT 25MG DLY x 1/12"},{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"LISINOPRIL 10MG DLY x 1/12"},{"code":"NHIA-11-03-04","name":"Clopidogrel Tablet 75mg Tab.","quantity":30,"unit_price":190,"amount":5700,"confidence":"high","source_term":"Clopidogrel 75mg dly x 1/12"}]'::jsonb, 11340, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 234: Adiaha Ugwunba (R/AO/190626370BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626370BD', 'R/AO/190626370BD', 'Adiaha Ugwunba', '1638192', 'HTN + Dyslipidemia', 'AMLODIPINE 10MG DLY x 1/12, HCT 12.5MG DLY x 1/12, Atorvastatin 10MG DLY x 1/12, acetylsalicylic 75mg dly x 1/12, FLP, SERUM E/U creatinine',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"AMLODIPINE 10MG DLY x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"HCT 12.5MG DLY x 1/12"},{"code":"NHIA-12-06-01","name":"Atorvastatin Tab/Caps 10mg Tab/ Cap.","quantity":30,"unit_price":122,"amount":3660,"confidence":"high","source_term":"Atorvastatin 10MG DLY x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"acetylsalicylic 75mg dly x 1/12"},{"code":"NHIA-181-018","name":"Total Cholesterol 2,500.00 Total Lipid Profile (a-d)","quantity":1,"unit_price":6000,"amount":6000,"confidence":"high","source_term":"FLP"},{"code":"NHIA-181-030","name":"Electrolytes, Urea and Creatinine","quantity":1,"unit_price":9000,"amount":9000,"confidence":"high","source_term":"SERUM E/U creatinine"}]'::jsonb, 22290, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 235: Togun Adeniyi (R/AO/190626371BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626371BD', 'R/AO/190626371BD', 'Togun Adeniyi', '7629775', 'HTN', 'Losartan 100mg dly x 1/12, Amlodipine 10mg dly x 1/12, HCT 25 mg x 1/12 (30 TABS EACH)',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-50","name":"Losartan 100mg Tablet Tab 100mg Tablet","quantity":30,"unit_price":126,"amount":3780,"confidence":"high","source_term":"Losartan 100mg dly x 1/12"},{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10mg dly x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"HCT 25 mg x 1/12 (30 TABS EACH)"}]'::jsonb, 7080, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 236: FADINA OLUBUNMI (R/AO/190626372BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626372BD', 'R/AO/190626372BD', 'FADINA OLUBUNMI', '1458287', 'HYPERTENSION & DM', 'tab metformin 1000mg BD x 1/12, HCT 25mg Dlyx x 1/12, Glimepiride 4mg dly x 1/12, amlodipine 10mg dly x 1/12, lisinopril 10mg dly x 1/12, vasoprin 75mg dly x 1/12, Bisoprolol 2.5mg dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-17-06-21","name":"Metformin Tablets 1000mg","quantity":60,"unit_price":106,"amount":6360,"confidence":"high","source_term":"tab metformin 1000mg BD x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"HCT 25mg Dlyx x 1/12"},{"code":"NHIA-17-06-19","name":"Glimepiride Tab 4mg","quantity":30,"unit_price":128,"amount":3840,"confidence":"high","source_term":"Glimepiride 4mg dly x 1/12"},{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"amlodipine 10mg dly x 1/12"},{"code":"NHIA-12-04-45","name":"Lisinopril Tablet 10mg Tablet","quantity":30,"unit_price":78,"amount":2340,"confidence":"high","source_term":"lisinopril 10mg dly x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"vasoprin 75mg dly x 1/12"},{"code":"NHIA-12-01-10","name":"Bisoprolol 2.5mg Tablet Tablet 2.5mg Tablet","quantity":30,"unit_price":131,"amount":3930,"confidence":"high","source_term":"Bisoprolol 2.5mg dly x 1/12"}]'::jsonb, 20100, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 237: Tolulope Adebimpe (R/AO/190626373BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626373BD', 'R/AO/190626373BD', 'Tolulope Adebimpe', '2173758', 'Hypertension', 'Amlodipine 10mg dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Amlodipine 10mg dly x 1/12"}]'::jsonb, 2100, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 238: Amao Emmanuel Ayoola (R/AO/190626374BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626374BD', 'R/AO/190626374BD', 'Amao Emmanuel Ayoola', '2872928', 'Refractive Error', 'consultation, manual refraction, Direct ophthalmoscopy, glasses',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Consultation"},{"code":"NHIA-081-001","name":"Manual Refraction","quantity":1,"unit_price":3000,"amount":3000,"confidence":"high","source_term":"Manual Refraction"},{"code":"NHIA-081-007","name":"Direct Ophthalmoscopy","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"Direct Ophthalmoscopy"},{"code":"NHIA-081-015","name":"Low-priced spectacles/contact lens - frame and lens","quantity":1,"unit_price":20000,"amount":20000,"confidence":"high","source_term":"Glasses"}]'::jsonb, 31000, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 239: ADENIYI BOLANLE (R/AO/190626375BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626375BD', 'R/AO/190626375BD', 'ADENIYI BOLANLE', '1638858', 'Dyslipidemia', 'Rosuvastatin 10mg nocte x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-06-07","name":"Rosuvastatin Tab/Caps 10mg Tab/ Cap.","quantity":30,"unit_price":212,"amount":6360,"confidence":"high","source_term":"Rosuvastatin 10mg nocte x 1/12"}]'::jsonb, 6360, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 240: ELLIOT AJIBOYE (R/AO/190626376BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626376BD', 'R/AO/190626376BD', 'ELLIOT AJIBOYE', '1458179', 'Knee Osteoarthritis', '2 sessions of Physiotherapy',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-133-005","name":"Physiotherapy (2 Sessions)","quantity":2,"unit_price":7500,"amount":15000,"confidence":"high","source_term":"2 sessions of Physiotherapy"}]'::jsonb, 15000, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 241: Olaniyi Monsurat (R/AO/190626377BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626377BD', 'R/AO/190626377BD', 'Olaniyi Monsurat', '1637727', 'HTN', 'Tab Amlodipine 10mg Dly x 1/12,Tab HCT 25mg Dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Tab Amlodipine 10mg Dly x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"Tab HCT 25mg Dly x 1/12"}]'::jsonb, 3300, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 242: Oyawale Mary (R/AO/190626378BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626378BD', 'R/AO/190626378BD', 'Oyawale Mary', '2871289', 'HTN', 'Tab Amlodipine 10mg Dly x 1/12,Tab HCT 25mg Dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-03","name":"Amlodipine Tablet (Besylate) 10mg Tab.","quantity":30,"unit_price":70,"amount":2100,"confidence":"high","source_term":"Tab Amlodipine 10mg Dly x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"Tab HCT 25mg Dly x 1/12"}]'::jsonb, 3300, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 243: Adedokun Adeleye (R/AO/190626379BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626379BD', 'R/AO/190626379BD', 'Adedokun Adeleye', '2872689', 'HTN', 'Amlodipine(10mg) + Valsartan (160mg) daily x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-06","name":"Amlodipine + Valsartan + HCT (10/160/12.5mg) Tablet Tablet 10mg/160mg/12.5mg Tablet","quantity":30,"unit_price":484,"amount":14520,"confidence":"high","source_term":"Amlodipine(10mg) + Valsartan (160mg) daily x 1/12"}]'::jsonb, 14520, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 244: Ayininuola Gbenga (R/AO/190626380BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626380BD', 'R/AO/190626380BD', 'Ayininuola Gbenga', '2870858', 'HTN', 'Lisinopril 5mg dly x 1/12, Simvastatin 20mg dly x 1/12, HCT 25mg dly x 1/12, Vasoprin 75mg dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-43","name":"Lisinopril Tablet 2.5mg Tab.","quantity":30,"unit_price":107,"amount":3210,"confidence":"high","source_term":"Lisinopril 5mg dly x 1/12"},{"code":"NHIA-12-06-10","name":"Simvastatin Tab/Caps 20mg Tab/ Cap.","quantity":30,"unit_price":100,"amount":3000,"confidence":"high","source_term":"Simvastatin 20mg dly x 1/12"},{"code":"NHIA-12-03-05","name":"Hydrochlorothiazide Tablet 25mg Tab.","quantity":30,"unit_price":40,"amount":1200,"confidence":"high","source_term":"HCT 25mg dly x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Vasoprin 75mg dly x 1/12"}]'::jsonb, 7740, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 245: Samuel Agbede (R/AO/190626381BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626381BD', 'R/AO/190626381BD', 'Samuel Agbede', '3386794', 'seizure disorder', 'CONSULT',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"CONSULT"}]'::jsonb, 4000, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 246: Andrew Adebayo Adeyemi (R/AO/190626382BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626382BD', 'R/AO/190626382BD', 'Andrew Adebayo Adeyemi', '1500639', 'HBsAg Positive HTN', 'E/U/CR, ECG',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-181-030","name":"Electrolytes, Urea and Creatinine","quantity":1,"unit_price":9000,"amount":9000,"confidence":"high","source_term":"E/U/CR"},{"code":"NHIA-040-008","name":"Electrocardiography (ECG)","quantity":1,"unit_price":10000,"amount":10000,"confidence":"high","source_term":"ECG"}]'::jsonb, 19000, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 247: Andrew Adebayo Adeyemi (R/AO/190626383BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626383BD', 'R/AO/190626383BD', 'Andrew Adebayo Adeyemi', '1500639', 'HBsAg Positive HTN', 'abdominal scan',
    v_police_id, 'POLICE CLINIC, AGODI', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_police_id, 'POLICE CLINIC, AGODI', v_police_id, 'POLICE CLINIC, AGODI',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-179-006","name":"Abdominal Pelvic Scan","quantity":1,"unit_price":8500,"amount":8500,"confidence":"high","source_term":"abdominal scan"}]'::jsonb, 8500, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 248: Chioma Ekemezie (R/AO/190626384BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626384BD', 'R/AO/190626384BD', 'Chioma Ekemezie', '2872805', 'Hypertension', 'Tab losartan 50mg Dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-04-49","name":"Losartan 50mg Tablet Tablet 50mg Tablet","quantity":30,"unit_price":100,"amount":3000,"confidence":"high","source_term":"Tab losartan 50mg Dly x 1/12"}]'::jsonb, 3000, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 249: Taiwo Olajide (R/AO/190626385BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626385BD', 'R/AO/190626385BD', 'Taiwo Olajide', '2557055', 'Newly diagnosed hepatitis B Positive', 'CONSULT',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"CONSULT"}]'::jsonb, 4000, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 250: Olusola Oyetunji (R/AO/190626386BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626386BD', 'R/AO/190626386BD', 'Olusola Oyetunji', '1638781', '?BPH', 'CONSULT',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"CONSULT"}]'::jsonb, 4000, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 251: Ajibuwa Festus Kolawole (R/AO/190626387BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626387BD', 'R/AO/190626387BD', 'Ajibuwa Festus Kolawole', '2871043', 'BPH', 'cONSULT',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"cONSULT"}]'::jsonb, 4000, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 252: Ekemezie Oluebubechukwu (R/AO/190626388BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626388BD', 'R/AO/190626388BD', 'Ekemezie Oluebubechukwu', '2872805', 'Chronic Headache + Visual disturbance', 'CONSULT',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL', v_uch_id, 'UNIVERSITY COLLEGE HOSPITAL',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-010-001","name":"Specialist Initial Consultation","quantity":1,"unit_price":4000,"amount":4000,"confidence":"high","source_term":"CONSULT"}]'::jsonb, 4000, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 253: Mary Aloba (R/AO/190626389BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626389BD', 'R/AO/190626389BD', 'Mary Aloba', '2872345', 'DM', 'Insulin 1PEN, Glimepiride 2mg Dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-17-06-03","name":"Insulin Soluble Injection 100 units/ml Vial","quantity":1,"unit_price":12474,"amount":12474,"confidence":"high","source_term":"Insulin 1PEN"},{"code":"NHIA-17-06-18","name":"Glimepiride Tab 2mg","quantity":30,"unit_price":102,"amount":3060,"confidence":"high","source_term":"Glimepiride 2mg Dly x 1/12"}]'::jsonb, 15534, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 254: Adejumobi Olumuyiwa (R/AO/190626390BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626390BD', 'R/AO/190626390BD', 'Adejumobi Olumuyiwa', '2871066', 'Wrist Tendinitis, HTN', 'E/U/Cr, follow up',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-181-030","name":"Electrolytes, Urea and Creatinine","quantity":1,"unit_price":9000,"amount":9000,"confidence":"high","source_term":"E/U/Cr"},{"code":"NHIA-010-002","name":"Specialist Review (Per visit)","quantity":1,"unit_price":2600,"amount":2600,"confidence":"high","source_term":"follow up"}]'::jsonb, 11600, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 255: Fedrick olotu (R/AO/190626391BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626391BD', 'R/AO/190626391BD', 'Fedrick olotu', '1638558', 'Enlarged prostate, R/O Diabetes', 'PSA',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-181-082","name":"Prostate Specific Antigen (PSA): (a - b)","quantity":1,"unit_price":15000,"amount":15000,"confidence":"high","source_term":"PSA"}]'::jsonb, 15000, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Row 256: Fedrick olotu (R/AO/190626392BD)
  INSERT INTO public.authorization_requests (
    request_id, authorization_code, patient_name, policy_number, diagnosis, treatment,
    hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name,
    referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name,
    status, source, is_historical, approved_items, total_amount, decided_at,
    authorized_by_name, submitted_by, decided_by, created_at, updated_at
  ) VALUES (
    'REQ-HIST-RAO190626392BD', 'R/AO/190626392BD', 'Fedrick olotu', '1638558', 'HTN', 'Moduretic BD x 1/12 ,Nifedipine 20mg dly x 1/12 , Acetylsalicylic acid 75MG dly x 1/12',
    v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)', v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    NULL, NULL, v_jaja_id, 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)',
    'approved', 'historical_import', TRUE, '[{"code":"NHIA-12-03-01","name":"Amiloride + Hydrochlorothiazide Tablet 5mg+ 50mg Tab","quantity":60,"unit_price":36,"amount":2160,"confidence":"high","source_term":"Moduretic BD x 1/12"},{"code":"NHIA-12-04-59","name":"Nifedipine Tablet, 20mg Tab.","quantity":30,"unit_price":67,"amount":2010,"confidence":"high","source_term":"Nifedipine 20mg dly x 1/12"},{"code":"NHIA-11-03-01","name":"Acetylsalicylic acid Tablet 75 mg Tab","quantity":30,"unit_price":11,"amount":330,"confidence":"high","source_term":"Acetylsalicylic acid 75MG dly x 1/12"}]'::jsonb, 4500, '2026-07-24T12:00:00.000Z'::timestamptz,
    'Authorizing Officer (AO)', v_admin_id, v_admin_id, '2026-07-24T12:00:00.000Z'::timestamptz, now()
  )
  ON CONFLICT (request_id) DO UPDATE SET
    patient_name = EXCLUDED.patient_name,
    policy_number = EXCLUDED.policy_number,
    diagnosis = EXCLUDED.diagnosis,
    treatment = EXCLUDED.treatment,
    hospital_id = COALESCE(EXCLUDED.hospital_id, public.authorization_requests.hospital_id),
    hospital_name = EXCLUDED.hospital_name,
    requesting_hospital_id = COALESCE(EXCLUDED.requesting_hospital_id, public.authorization_requests.requesting_hospital_id),
    requesting_hospital_name = EXCLUDED.requesting_hospital_name,
    referred_hospital_id = COALESCE(EXCLUDED.referred_hospital_id, public.authorization_requests.referred_hospital_id),
    referred_hospital_name = EXCLUDED.referred_hospital_name,
    claiming_hospital_id = COALESCE(EXCLUDED.claiming_hospital_id, public.authorization_requests.claiming_hospital_id),
    claiming_hospital_name = EXCLUDED.claiming_hospital_name,
    status = EXCLUDED.status,
    approved_items = EXCLUDED.approved_items,
    total_amount = EXCLUDED.total_amount,
    decided_at = EXCLUDED.decided_at,
    authorized_by_name = EXCLUDED.authorized_by_name,
    is_historical = TRUE,
    source = 'historical_import',
    updated_at = now();

  -- Audit log entry
  INSERT INTO public.audit_logs (
    action, user_id, details, created_at
  ) VALUES (
    'import_historical_authorisations',
    v_admin_id,
    jsonb_build_object('source_file', 'july ao.xlsx', 'total_records', 256, 'approved_count', 251, 'total_amount', 3381634.14),
    now()
  );
END $$;

-- Re-enable triggers after historical seeding
ALTER TABLE public.authorization_requests ENABLE TRIGGER USER;

COMMIT;