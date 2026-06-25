-- Migration: secure_invitation_onboarding
BEGIN;

-- 1. Add onboarding columns to public.user_roles
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_status TEXT NOT NULL DEFAULT 'pending';

-- 2. Drop existing constraint if it exists and add the new one
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_invite_status_check;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_invite_status_check
  CHECK (invite_status IN ('pending', 'completed', 'expired', 'revoked'));

-- 3. Create indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_user_roles_invite_status ON public.user_roles(invite_status);
CREATE INDEX IF NOT EXISTS idx_user_roles_onboarding_completed ON public.user_roles(onboarding_completed);

-- 4. Update the trigger handle_new_auth_user to initialize onboarding fields
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  default_role public.app_role := 'nurse';
  meta_role text;
  meta_fullname text;
  meta_hospital_id uuid;
BEGIN
  meta_role := new.raw_user_meta_data->>'role';
  meta_fullname := new.raw_user_meta_data->>'full_name';
  IF new.raw_user_meta_data->>'hospital_id' IS NOT NULL THEN
    BEGIN
      meta_hospital_id := (new.raw_user_meta_data->>'hospital_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      meta_hospital_id := NULL;
    END;
  END IF;

  INSERT INTO public.user_roles (
    user_id, role, full_name, email, phone, hospital_id, access_status, created_at, last_sign_in,
    onboarding_completed, onboarding_completed_at, invite_status
  )
  VALUES (
    new.id,
    COALESCE(meta_role::public.app_role, default_role),
    COALESCE(meta_fullname, 'Unnamed User'),
    new.email,
    new.phone,
    meta_hospital_id,
    'active',
    new.created_at,
    new.last_sign_in_at,
    false,
    null,
    'pending'
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    phone = COALESCE(EXCLUDED.phone, user_roles.phone),
    full_name = COALESCE(EXCLUDED.full_name, user_roles.full_name),
    role = COALESCE(EXCLUDED.role, user_roles.role),
    hospital_id = COALESCE(EXCLUDED.hospital_id, user_roles.hospital_id),
    last_sign_in = EXCLUDED.last_sign_in;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Update the harden_user_roles function to allow users to update their own onboarding columns
CREATE OR REPLACE FUNCTION public.harden_user_roles()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow if running as service_role / postgres (no JWT = auth.uid() is NULL)
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Allow users to update their own onboarding/profile status
  IF TG_OP = 'UPDATE' AND auth.uid() = NEW.user_id THEN
    -- Prevent role elevation or status changes by non-admins
    IF NEW.role IS DISTINCT FROM OLD.role OR
       NEW.access_status IS DISTINCT FROM OLD.access_status OR
       NEW.user_id IS DISTINCT FROM OLD.user_id OR
       NEW.email IS DISTINCT FROM OLD.email THEN
      
      -- If they are trying to change role/status/user_id/email, verify they are admin
      IF NOT public.has_role(auth.uid(), 'admin') THEN
        RAISE EXCEPTION 'CyberSecurity Violation: Access Role Modification Denied';
      END IF;
    END IF;
    
    RETURN NEW;
  END IF;
  
  -- Otherwise require admin role
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'CyberSecurity Violation: Access Role Modification Denied';
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create RPC function to check invite status anonymously
CREATE OR REPLACE FUNCTION public.check_invite_status(p_user_id UUID)
RETURNS TABLE (
  role public.app_role,
  hospital_id UUID,
  invite_status TEXT,
  onboarding_completed BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT ur.role, ur.hospital_id, ur.invite_status, ur.onboarding_completed
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_invite_status(UUID) TO anon, authenticated;

-- 7. Add RLS update policy for user_roles to allow self updating onboarding columns
DROP POLICY IF EXISTS "Users can update their own onboarding columns" ON public.user_roles;
CREATE POLICY "Users can update their own onboarding columns"
  ON public.user_roles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 8. Add RLS policies for hospitals to allow self provisioning during onboarding
DROP POLICY IF EXISTS "Hospitals can update their own record" ON public.hospitals;
CREATE POLICY "Hospitals can update their own record"
  ON public.hospitals FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR email = (auth.jwt() ->> 'email')
  )
  WITH CHECK (
    user_id = auth.uid()
    OR email = (auth.jwt() ->> 'email')
  );

DROP POLICY IF EXISTS "Hospitals can insert their own record" ON public.hospitals;
CREATE POLICY "Hospitals can insert their own record"
  ON public.hospitals FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND email = (auth.jwt() ->> 'email')
  );

COMMIT;
