BEGIN;

DROP POLICY IF EXISTS "Users can insert their own profile name update requests"
  ON public.profile_name_update_requests;

CREATE POLICY "Users can insert their own profile name update requests"
  ON public.profile_name_update_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND decided_by IS NULL
    AND decided_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles AS ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text = profile_name_update_requests.role
    )
  );

COMMIT;
