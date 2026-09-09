-- Fix admin approval workflow so an approved delete request actually deletes the record.
-- Previously the approval RPC only set deletion_status='approved' and left the record in circulation.

CREATE OR REPLACE FUNCTION public.rpc_resolve_delete_request(p_request_id UUID, p_action TEXT)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can resolve deletion requests.';
  END IF;

  IF p_action = 'approved' THEN
    PERFORM public.permanently_delete_authorization(p_request_id);
    RETURN;
  END IF;

  IF p_action = 'rejected' THEN
    UPDATE public.authorization_requests
    SET deletion_status = 'rejected',
        deletion_reviewed_at = NOW()
    WHERE id = p_request_id;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Unsupported delete action: %', p_action;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
