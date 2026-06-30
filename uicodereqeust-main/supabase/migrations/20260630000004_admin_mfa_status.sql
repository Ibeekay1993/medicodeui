-- Create an RPC to safely check MFA status for all users (Admin only)
CREATE OR REPLACE FUNCTION admin_get_users_mfa_status()
RETURNS TABLE (
  user_id uuid,
  mfa_enabled boolean
)
SECURITY DEFINER
AS $$
BEGIN
  -- Ensure caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT 
    u.id as user_id,
    EXISTS (
      SELECT 1 FROM auth.mfa_factors f 
      WHERE f.user_id = u.id AND f.status = 'verified'
    ) as mfa_enabled
  FROM auth.users u;
END;
$$ LANGUAGE plpgsql;
