CREATE OR REPLACE FUNCTION public.rpc_get_utilization_manager_directory(_user_ids uuid[])
RETURNS TABLE (user_id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.user_id, COALESCE(NULLIF(BTRIM(ur.full_name), ''), 'Utilization Manager') AS full_name
  FROM public.user_roles ur
  WHERE ur.user_id = ANY(COALESCE(_user_ids, ARRAY[]::uuid[]))
    AND ur.role IN ('utilization_manager'::public.app_role, 'utilization_manager_lead'::public.app_role)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'utilization_manager_lead'::public.app_role)
      OR ur.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.rpc_get_utilization_manager_directory(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_utilization_manager_directory(uuid[]) TO authenticated;
