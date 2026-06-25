ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS access_status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_access_status_check;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_access_status_check
  CHECK (access_status IN ('active', 'suspended'));

CREATE INDEX IF NOT EXISTS idx_user_roles_access_status
  ON public.user_roles(access_status);
