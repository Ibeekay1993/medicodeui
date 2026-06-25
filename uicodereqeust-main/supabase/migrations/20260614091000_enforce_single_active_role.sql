BEGIN;

UPDATE public.user_roles
SET role = 'nurse'
WHERE role::text IN ('bureau', 'support');

WITH ranked AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY
        CASE role::text
          WHEN 'admin' THEN 1
          WHEN 'nurse' THEN 2
          WHEN 'claims' THEN 3
          WHEN 'hospital' THEN 4
          ELSE 5
        END,
        updated_at DESC NULLS LAST,
        id
    ) AS rn
  FROM public.user_roles
)
DELETE FROM public.user_roles
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_one_active_role_per_user
  ON public.user_roles(user_id);

COMMIT;
