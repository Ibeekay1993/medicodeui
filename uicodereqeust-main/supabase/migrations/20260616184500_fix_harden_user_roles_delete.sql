-- Fix harden_user_roles trigger function to return OLD on DELETE
CREATE OR REPLACE FUNCTION public.harden_user_roles()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'CyberSecurity Violation: Access Role Modification Denied';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
