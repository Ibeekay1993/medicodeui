-- Migration: Fix existing records where referred_hospital_id was cleared by the old approval bug
-- 
-- Problem: The old code in useClinicalActions.ts was setting:
--   referred_hospital_id: editReferralHospitalName.trim() ? editReferralHospitalId : null
-- When a nurse approved a referral without touching the referral field, 
-- editReferralHospitalName was empty string, causing referred_hospital_id to be set to null.
--
-- This affected records where:
--   status IN ('referral_approved', 'referral_accepted', 'referral_declined', 'referral_expired')
--   AND referred_hospital_name IS NOT NULL
--   AND referred_hospital_id IS NULL
--
-- Fix: Join with hospitals table on name to restore the ID

-- Preview the records that will be fixed
SELECT 
    ar.id AS request_id,
    ar.patient_name,
    ar.referred_hospital_name,
    ar.referred_hospital_id AS current_referred_id,
    h.id AS correct_hospital_id,
    h.name AS hospital_name,
    h.code AS hospital_code,
    ar.status
FROM authorization_requests ar
LEFT JOIN hospitals h ON LOWER(TRIM(h.name)) = LOWER(TRIM(ar.referred_hospital_name))
WHERE ar.referred_hospital_name IS NOT NULL
  AND ar.referred_hospital_id IS NULL
  AND ar.status IN ('referral_approved', 'referral_accepted', 'referral_declined', 'referral_expired', 'pending_referral')
ORDER BY ar.created_at DESC;

-- Fix: Restore referred_hospital_id by matching on hospital name
UPDATE authorization_requests ar
SET 
    referred_hospital_id = h.id,
    claiming_hospital_id = h.id,
    claiming_hospital_name = h.name,
    updated_at = NOW()
FROM hospitals h
WHERE 
    LOWER(TRIM(h.name)) = LOWER(TRIM(ar.referred_hospital_name))
    AND ar.referred_hospital_name IS NOT NULL
    AND ar.referred_hospital_id IS NULL
    AND ar.status IN ('referral_approved', 'referral_accepted', 'referral_declined', 'referral_expired', 'pending_referral');

-- Verify the fix
SELECT 
    COUNT(*) AS fixed_records
FROM authorization_requests
WHERE referred_hospital_name IS NOT NULL
  AND referred_hospital_id IS NOT NULL
  AND status IN ('referral_approved', 'referral_accepted', 'referral_declined', 'referral_expired', 'pending_referral');