ALTER TABLE public.authorization_requests
ADD COLUMN IF NOT EXISTS patient_phone TEXT;

CREATE INDEX IF NOT EXISTS idx_authorization_requests_patient_phone
ON public.authorization_requests (patient_phone);

WITH computed AS (
  SELECT
    id,
    NULLIF(
      REGEXP_REPLACE(
        COALESCE(
          NULLIF(
            CASE
              WHEN LEFT(BTRIM(COALESCE(whatsapp_raw_message, '')), 1) = '{'
                THEN COALESCE(
                  NULLIF(whatsapp_raw_message::jsonb ->> 'patient_phone', ''),
                  NULLIF(whatsapp_raw_message::jsonb ->> 'phone_number', ''),
                  NULLIF(whatsapp_raw_message::jsonb ->> 'phone', '')
                )
              ELSE NULL
            END,
            ''
          ),
          NULLIF(SUBSTRING(COALESCE(patient_name, '') FROM '(?:\+?\d[\d\s().-]{6,}\d)'), ''),
          NULLIF(
            CASE
              WHEN LEFT(BTRIM(COALESCE(whatsapp_raw_message, '')), 1) = '{'
                THEN SUBSTRING(COALESCE(whatsapp_raw_message::jsonb ->> 'raw_message', '') FROM '(?:\+?\d[\d\s().-]{6,}\d)')
              ELSE NULL
            END,
            ''
          ),
          NULLIF(SUBSTRING(COALESCE(whatsapp_raw_message, '') FROM '(?:\+?\d[\d\s().-]{6,}\d)'), '')
        ),
        '[^0-9+]',
        '',
        'g'
      ),
      ''
    ) AS recovered_phone
  FROM public.authorization_requests
)
UPDATE public.authorization_requests r
SET patient_phone = c.recovered_phone
FROM computed c
WHERE r.id = c.id
  AND COALESCE(NULLIF(r.patient_phone, ''), '') = ''
  AND c.recovered_phone IS NOT NULL;
