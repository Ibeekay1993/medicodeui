ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS is_team_lead boolean NOT NULL DEFAULT false;

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_team_lead_supported_role;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_team_lead_supported_role
  CHECK (NOT is_team_lead OR role IN ('hospital'::public.app_role, 'claims'::public.app_role, 'finance'::public.app_role));

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_one_lead_per_team_idx
  ON public.user_roles (role)
  WHERE is_team_lead OR role = 'utilization_manager_lead'::public.app_role;
