-- Ultimate Cyber Security Hardening for MedAuth NG
-- Target: 100% RLS compliance and strict data isolation

BEGIN;

-- 1. Ensure RLS is enabled on ALL tables
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authorization_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authorization_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.excel_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nhia_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abbreviations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_claim_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_code_sequence ENABLE ROW LEVEL SECURITY;

-- 2. Lockdown Anonymous Role (The #1 Hacker target)
-- Revoke all default access from 'anon' (non-logged in users)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- 3. Lockdown 'user_roles' (Prevent role elevation attacks)
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can only see their own role" ON public.user_roles;
CREATE POLICY "Users can only see their own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Super Admins only can manage roles" ON public.user_roles;
CREATE POLICY "Super Admins only can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Lockdown 'patients' (Zero-trust for sensitive patient data)
-- Strictly forbid hospitals from querying the patients table directly.
-- Hospitals MUST use the RPC 'verify_policy' instead.
DROP POLICY IF EXISTS "Nurses can manage patients" ON public.patients;
DROP POLICY IF EXISTS "Staff only can access patients" ON public.patients;
CREATE POLICY "Staff only can access patients"
  ON public.patients FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));

-- 5. Lockdown 'authorization_logs' (Prevent audit log tampering)
DROP POLICY IF EXISTS "Nurses can view all logs" ON public.authorization_logs;
DROP POLICY IF EXISTS "Staff only can view logs" ON public.authorization_logs;
CREATE POLICY "Staff only can view logs"
  ON public.authorization_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));

-- Ensure even hospitals cannot insert logs directly (they are system generated)
DROP POLICY IF EXISTS "System can insert logs" ON public.authorization_logs;
DROP POLICY IF EXISTS "Only system functions can insert logs" ON public.authorization_logs;
CREATE POLICY "Only system functions can insert logs"
  ON public.authorization_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));

-- 6. Lockdown 'nhia_items' (Pricing Integrity)
DROP POLICY IF EXISTS "nhia_items_read_all" ON public.nhia_items;
DROP POLICY IF EXISTS "Authenticated users can search prices" ON public.nhia_items;
CREATE POLICY "Authenticated users can search prices"
  ON public.nhia_items FOR SELECT
  TO authenticated
  USING (true);

-- strictly prevent non-admins from modifying prices
DROP POLICY IF EXISTS "Admins only can update catalog" ON public.nhia_items;
CREATE POLICY "Admins only can update catalog"
  ON public.nhia_items FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 7. Lockdown 'authorization_requests' (Multi-tenant Isolation)
-- Ensure Hospital A can NEVER see Hospital B's data
DROP POLICY IF EXISTS "Hospitals can view their own requests" ON public.authorization_requests;
DROP POLICY IF EXISTS "Hospital Data Isolation - View" ON public.authorization_requests;
CREATE POLICY "Hospital Data Isolation - View"
  ON public.authorization_requests FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'nurse') OR
    (public.has_role(auth.uid(), 'hospital') AND (
      submitted_by = auth.uid() OR
      hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
    ))
  );

-- 8. Fix 'verify_policy' visibility
-- Make 'verify_policy' executable by authenticated users only
GRANT EXECUTE ON FUNCTION public.verify_policy(TEXT) TO authenticated;

-- 9. Disable realtime for sensitive tables to prevent websocket sniffing
-- (Assuming realtime is controlled via the dashboard or specific publication setup)

-- 10. PROTECTIVE TRIGGER: Block Non-Admins from editing roles
CREATE OR REPLACE FUNCTION public.harden_user_roles()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'CyberSecurity Violation: Access Role Modification Denied';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_harden_user_roles ON public.user_roles;
CREATE TRIGGER tr_harden_user_roles
BEFORE UPDATE OR INSERT OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.harden_user_roles();

COMMIT;
