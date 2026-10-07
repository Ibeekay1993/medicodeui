BEGIN;

-- Permanent deletion must go through the audited approval RPC. Client roles
-- keep request/approval access, but cannot issue DELETE against the table.
DROP POLICY IF EXISTS "deletecode" ON public.authorization_requests;
DROP POLICY IF EXISTS "Nurses can delete pending requests only" ON public.authorization_requests;
DROP POLICY IF EXISTS "Hospitals can delete their own requests" ON public.authorization_requests;
REVOKE DELETE ON TABLE public.authorization_requests FROM anon, authenticated;

-- Hospital request creation had two permissive policies. The older broad
-- policy let a hospital bypass the newer pending-only ownership checks.
DROP POLICY IF EXISTS "Hospitals can create requests" ON public.authorization_requests;
DROP POLICY IF EXISTS "Hospitals can create pending requests" ON public.authorization_requests;
CREATE POLICY "Hospitals can create pending requests"
  ON public.authorization_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'hospital'::public.app_role)
    AND submitted_by = auth.uid()
    AND lower(coalesce(status, '')) IN ('pending', 'pending_referral')
    AND hospital_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'hospital'::public.app_role
        AND ur.hospital_id = authorization_requests.hospital_id
    )
    AND hospital_name = (
      SELECT h.name
      FROM public.hospitals h
      WHERE h.id = authorization_requests.hospital_id
    )
    AND (requesting_hospital_id IS NULL OR requesting_hospital_id = hospital_id)
    AND (referring_hospital_id IS NULL OR referring_hospital_id = hospital_id)
    AND coalesce(authorization_code, '') = ''
  );

-- Scope hospital reads to requests actually involving their assigned facility.
-- The old `ur.hospital_id = ur.hospital_id` branch was always true.
DROP POLICY IF EXISTS "Hospitals can view their own requests" ON public.authorization_requests;
CREATE POLICY "Hospitals can view their own requests"
  ON public.authorization_requests
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'hospital'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'hospital'::public.app_role
        AND ur.hospital_id IS NOT NULL
        AND ur.hospital_id = ANY (ARRAY[
          authorization_requests.hospital_id,
          authorization_requests.requesting_hospital_id,
          authorization_requests.referring_hospital_id,
          authorization_requests.referred_hospital_id,
          authorization_requests.claiming_hospital_id
        ])
    )
  );

-- Preserve the referral acceptance/treatment workflow while fixing the same
-- tautology in its UPDATE policy, so unrelated hospital requests are excluded.
DROP POLICY IF EXISTS "Hospitals can update their own requests" ON public.authorization_requests;
CREATE POLICY "Hospitals can update their own requests"
  ON public.authorization_requests
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'hospital'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'hospital'::public.app_role
        AND ur.hospital_id IS NOT NULL
        AND ur.hospital_id = ANY (ARRAY[
          authorization_requests.hospital_id,
          authorization_requests.requesting_hospital_id,
          authorization_requests.referring_hospital_id,
          authorization_requests.referred_hospital_id,
          authorization_requests.claiming_hospital_id
        ])
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'hospital'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'hospital'::public.app_role
        AND ur.hospital_id IS NOT NULL
        AND ur.hospital_id = ANY (ARRAY[
          authorization_requests.hospital_id,
          authorization_requests.requesting_hospital_id,
          authorization_requests.referring_hospital_id,
          authorization_requests.referred_hospital_id,
          authorization_requests.claiming_hospital_id
        ])
    )
  );

-- Non-approvers may submit a deletion request. A hospital may request deletion
-- only for a request it submitted from its assigned hospital account.
CREATE OR REPLACE FUNCTION public.rpc_request_deletion_approval(
  p_request_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'utilization_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'claims'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'hospital'::public.app_role)
      AND EXISTS (
        SELECT 1
        FROM public.authorization_requests ar
        JOIN public.user_roles ur
          ON ur.user_id = auth.uid()
         AND ur.role = 'hospital'::public.app_role
         AND ur.hospital_id = ar.hospital_id
        WHERE ar.id = p_request_id
          AND ar.submitted_by = auth.uid()
      )
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: submit a deletion request only for an eligible request.';
  END IF;

  UPDATE public.authorization_requests
  SET deletion_status = 'awaiting_admin_approval',
      deletion_requested_at = now(),
      deletion_requested_by = auth.uid(),
      deletion_reason = nullif(trim(p_reason), '')
  WHERE id = p_request_id
    AND coalesce(deletion_status, 'none') <> 'awaiting_admin_approval';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already awaiting deletion approval.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_request_deletion_approval(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_request_deletion_approval(uuid, text) TO authenticated;

COMMIT;
