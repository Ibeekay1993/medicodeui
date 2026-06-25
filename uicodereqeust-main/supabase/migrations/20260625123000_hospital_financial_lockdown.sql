-- 1. Secure Claim Creation (Preventing Fake Authorizations)
DROP POLICY IF EXISTS "Hospitals can create own claims" ON public.hospital_claims;
CREATE POLICY "Hospitals can create own claims"
  ON public.hospital_claims
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'hospital')
    AND created_by = auth.uid()
    AND status = 'draft'
    AND hospital_id::uuid IN (
      SELECT ur.hospital_id::uuid 
      FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() AND ur.role = 'hospital'
    )
    AND EXISTS (
      SELECT 1 FROM public.authorization_requests ar
      WHERE ar.id::uuid = request_id::uuid
        AND lower(ar.status) = 'approved'
        AND ar.authorization_code::text = auth_code::text
    )
  );

-- 2. Secure Financial Fields (Preventing Infinite Claims)
CREATE OR REPLACE FUNCTION public.protect_hospital_claims_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.total_amount := 0;
    NEW.approved_amount := 0;
    NEW.under_contest_amount := 0;
    NEW.declined_amount := 0;
    NEW.approved_items := NULL;
    NEW.audit_summary := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    IF public.has_role(auth.uid(), 'hospital') THEN
      NEW.total_amount := OLD.total_amount;
      NEW.approved_amount := OLD.approved_amount;
      NEW.under_contest_amount := OLD.under_contest_amount;
      NEW.declined_amount := OLD.declined_amount;
      NEW.approved_items := OLD.approved_items;
      NEW.audit_summary := OLD.audit_summary;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_hospital_claims_totals_trigger ON public.hospital_claims;
CREATE TRIGGER protect_hospital_claims_totals_trigger
BEFORE INSERT OR UPDATE ON public.hospital_claims
FOR EACH ROW
EXECUTE FUNCTION public.protect_hospital_claims_totals();

-- 3. Secure Authorization Creation
DROP POLICY IF EXISTS "Hospitals can create pending requests" ON public.authorization_requests;
CREATE POLICY "Hospitals can create pending requests"
  ON public.authorization_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'hospital')
    AND hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
    AND lower(status) = 'pending'
    AND coalesce(nullif(authorization_code, ''), '') = ''
  );
