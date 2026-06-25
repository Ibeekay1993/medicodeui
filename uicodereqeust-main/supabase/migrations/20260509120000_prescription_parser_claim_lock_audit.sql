-- Prescription parser support, one-authorization-one-claim status, and audit sync.

BEGIN;

ALTER TABLE public.authorization_requests
  ADD COLUMN IF NOT EXISTS claimed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS claim_status TEXT NOT NULL DEFAULT 'not_claimed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'authorization_requests_claim_status_check'
      AND conrelid = 'public.authorization_requests'::regclass
  ) THEN
    ALTER TABLE public.authorization_requests
      ADD CONSTRAINT authorization_requests_claim_status_check
      CHECK (claim_status IN ('not_claimed', 'submitted', 'under_investigation', 'approved', 'paid', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_authorization_requests_claim_status
  ON public.authorization_requests(claim_status);

UPDATE public.authorization_requests ar
SET claimed = true,
    claim_status = CASE
      WHEN hc.status = 'under_review' THEN 'under_investigation'
      WHEN hc.status IN ('approved', 'paid', 'rejected') THEN hc.status
      ELSE 'submitted'
    END
FROM public.hospital_claims hc
WHERE hc.request_id = ar.id;

INSERT INTO public.abbreviations (shorthand, item_code, confidence)
SELECT item.shorthand, ni.code, 'high'
FROM (
  VALUES
    ('ECG', 'Electrocardiography (ECG)'),
    ('EKG', 'Electrocardiography (ECG)'),
    ('FBC', 'Full Blood Count (FBC)'),
    ('CBC', 'Full Blood Count (FBC)'),
    ('TSH', 'Thyroid Stimulating Hormones (TSH)'),
    ('CS', 'Caesarean Section'),
    ('C/S', 'Caesarean Section'),
    ('Follow-up', 'Specialist Review'),
    ('Follow up', 'Specialist Review'),
    ('Review', 'Specialist Review')
) AS item(shorthand, name_pattern)
JOIN LATERAL (
  SELECT code
  FROM public.nhia_items
  WHERE name ILIKE '%' || item.name_pattern || '%'
    AND is_active = true
  ORDER BY amount DESC, code
  LIMIT 1
) ni ON true
ON CONFLICT (lower(shorthand), item_code) DO NOTHING;

INSERT INTO public.abbreviations (shorthand, item_code, confidence)
SELECT item.shorthand, ni.code, 'medium'
FROM (
  VALUES
    ('CXR', 'Chest')
) AS item(shorthand, name_pattern)
JOIN LATERAL (
  SELECT code
  FROM public.nhia_items
  WHERE name ILIKE '%' || item.name_pattern || '%'
    AND is_active = true
  ORDER BY
    CASE WHEN name ILIKE '%x-ray%' OR name ILIKE '%x ray%' THEN 0 ELSE 1 END,
    amount DESC,
    code
  LIMIT 1
) ni ON true
ON CONFLICT (lower(shorthand), item_code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.audit_authorization_claim_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs(action, user_id, details, severity)
    VALUES (
      'AUTHORIZATION_SUBMITTED',
      NEW.submitted_by,
      jsonb_build_object('request_id', NEW.id, 'request_ref', NEW.request_id, 'hospital_id', NEW.hospital_id),
      'info'
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.status, '') IS DISTINCT FROM COALESCE(NEW.status, '') THEN
      INSERT INTO public.audit_logs(action, user_id, details, severity)
      VALUES (
        'AUTHORIZATION_' || upper(COALESCE(NEW.status, 'updated')),
        NEW.decided_by,
        jsonb_build_object('request_id', NEW.id, 'auth_code', NEW.authorization_code, 'old_status', OLD.status, 'new_status', NEW.status, 'total_amount', NEW.total_amount),
        CASE WHEN NEW.status = 'rejected' THEN 'warning' ELSE 'info' END
      );
    END IF;

    IF COALESCE(OLD.claim_status, 'not_claimed') IS DISTINCT FROM COALESCE(NEW.claim_status, 'not_claimed') THEN
      INSERT INTO public.audit_logs(action, user_id, details, severity)
      VALUES (
        'AUTHORIZATION_CLAIM_' || upper(COALESCE(NEW.claim_status, 'updated')),
        auth.uid(),
        jsonb_build_object('request_id', NEW.id, 'auth_code', NEW.authorization_code, 'old_claim_status', OLD.claim_status, 'new_claim_status', NEW.claim_status),
        'info'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_authorization_claim_status_trigger ON public.authorization_requests;
CREATE TRIGGER audit_authorization_claim_status_trigger
AFTER INSERT OR UPDATE ON public.authorization_requests
FOR EACH ROW
EXECUTE FUNCTION public.audit_authorization_claim_status();

COMMIT;
