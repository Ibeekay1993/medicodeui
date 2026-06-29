-- Migration: Phase 6 Security Hardening
-- Description: Move sensitive mutations to SECURITY DEFINER functions to prevent direct client access.

-- Utility function to check if caller is an admin
CREATE OR REPLACE FUNCTION is_admin(user_id uuid)
RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.user_roles WHERE user_roles.user_id = $1;
  RETURN v_role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 1. Approve Name Change
CREATE OR REPLACE FUNCTION rpc_approve_name_change(p_request_id UUID, p_new_name TEXT, p_target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can approve name changes.';
  END IF;

  UPDATE public.name_change_requests 
  SET status = 'approved' 
  WHERE id = p_request_id;

  UPDATE public.user_roles 
  SET full_name = p_new_name 
  WHERE user_id = p_target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Reject Name Change
CREATE OR REPLACE FUNCTION rpc_reject_name_change(p_request_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can reject name changes.';
  END IF;

  UPDATE public.name_change_requests 
  SET status = 'rejected' 
  WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Update User Role
CREATE OR REPLACE FUNCTION rpc_update_user_role(p_target_user_id UUID, p_role TEXT)
RETURNS VOID AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can update user roles.';
  END IF;

  UPDATE public.user_roles 
  SET role = p_role 
  WHERE user_id = p_target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Toggle User Access
CREATE OR REPLACE FUNCTION rpc_toggle_user_access(p_target_user_id UUID, p_is_active BOOLEAN)
RETURNS VOID AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can toggle user access.';
  END IF;

  UPDATE public.user_roles 
  SET is_active = p_is_active 
  WHERE user_id = p_target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. Delete User
CREATE OR REPLACE FUNCTION rpc_delete_user(p_target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can delete users.';
  END IF;

  DELETE FROM public.user_roles 
  WHERE user_id = p_target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. Request Authorization Deletion
-- (Note: Non-admins might need to request deletion, so we check if they are authenticated at least)
CREATE OR REPLACE FUNCTION rpc_delete_authorization_request(p_request_id UUID, p_reason TEXT)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Must be logged in.';
  END IF;

  UPDATE public.authorization_requests 
  SET status = 'deleted', deletion_reason = p_reason 
  WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 7. Resolve Delete Request (Admin only)
CREATE OR REPLACE FUNCTION rpc_resolve_delete_request(p_request_id UUID, p_action TEXT)
RETURNS VOID AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can resolve deletion requests.';
  END IF;

  UPDATE public.authorization_requests 
  SET deletion_status = p_action, deletion_reviewed_at = NOW() 
  WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 8. Hard Delete Authorization Request (Admin only)
CREATE OR REPLACE FUNCTION rpc_hard_delete_authorization_request(p_request_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can permanently delete records.';
  END IF;

  DELETE FROM public.authorization_requests 
  WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
