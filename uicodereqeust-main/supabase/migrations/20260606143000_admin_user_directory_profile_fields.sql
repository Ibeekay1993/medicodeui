ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_user_roles_email
  ON public.user_roles(LOWER(email));

CREATE INDEX IF NOT EXISTS idx_user_roles_hospital_id
  ON public.user_roles(hospital_id);

CREATE OR REPLACE FUNCTION public.set_user_roles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_user_roles_updated_at_trigger ON public.user_roles;
CREATE TRIGGER set_user_roles_updated_at_trigger
BEFORE UPDATE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.set_user_roles_updated_at();
