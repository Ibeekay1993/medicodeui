-- Migrate existing users to the new native role
UPDATE public.user_roles 
SET role = 'utilization_manager' 
WHERE role = 'nurse';

-- Override has_role to natively bridge the gap for the 70+ legacy RLS policies
-- that explicitly check for 'nurse'.
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND (
      role = _role
      OR (_role = 'nurse'::app_role AND role = 'utilization_manager'::app_role)
      OR (_role = 'utilization_manager'::app_role AND role = 'nurse'::app_role)
    )
  )
$$;
