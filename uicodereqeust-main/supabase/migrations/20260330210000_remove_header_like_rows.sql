-- Remove accidental workbook header rows imported as data
DELETE FROM public.authorization_requests
WHERE
  (
    lower(trim(coalesce(patient_name, ''))) LIKE 'patient name%'
    AND lower(trim(coalesce(policy_number, ''))) IN ('nhis/id', 'nhis id', 'policy number')
  )
  OR (
    lower(trim(coalesce(patient_name, ''))) LIKE 'patient name%'
    AND lower(trim(coalesce(authorization_code, ''))) IN ('diagnosis', 'pre authorisation code', 'pre authorization code')
  )
  OR (
    lower(trim(coalesce(diagnosis, ''))) IN ('service', 'diagnosis')
    AND lower(trim(coalesce(treatment, ''))) IN ('service', 'treatment')
  );
