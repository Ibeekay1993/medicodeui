-- Pending duplicate of R/AG/011008262BD (Omidiji Joseph, 19/05/2026) — not in user's May 9–19 list
UPDATE public.authorization_requests
SET
  status = 'rejected',
  decision_reason = 'Duplicate submission — approved as R/AG/011008262BD'
WHERE id = '8bb43202-b755-443a-964f-fc9e37a8eecd'
  AND authorization_code IS NULL
  AND status = 'pending';
