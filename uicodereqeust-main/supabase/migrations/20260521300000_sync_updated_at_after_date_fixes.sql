-- Date-fix migrations updated created_at but left updated_at at migration run time (e.g. 2026-05-20),
-- which inflated dashboard charts. Align updated_at with the Excel-correct created_at.
BEGIN;

UPDATE public.authorization_requests
SET updated_at = created_at
WHERE updated_at IS NOT NULL
  AND created_at IS NOT NULL
  AND updated_at >= '2026-05-19'::timestamptz
  AND created_at < updated_at - interval '12 hours';

UPDATE public.hospital_claims
SET updated_at = created_at
WHERE updated_at IS NOT NULL
  AND created_at IS NOT NULL
  AND updated_at >= '2026-05-19'::timestamptz
  AND created_at < updated_at - interval '12 hours';

COMMIT;
