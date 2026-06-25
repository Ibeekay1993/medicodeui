-- SECURITY DEFINER function to backfill missing user_ids in user_roles
-- This runs as the function owner (superuser) so it can access auth.users
CREATE OR REPLACE FUNCTION backfill_user_role_ids()
RETURNS void
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Backfill user_id for rows that have email but no user_id
  UPDATE public.user_roles ur
  SET user_id = u.id
  FROM auth.users u
  WHERE ur.user_id IS NULL
    AND ur.email IS NOT NULL
    AND ur.email <> ''
    AND LOWER(ur.email) = LOWER(u.email);

  -- Also backfill email for rows that have user_id but no email  
  UPDATE public.user_roles ur
  SET email = u.email
  FROM auth.users u
  WHERE (ur.email IS NULL OR ur.email = '')
    AND ur.user_id = u.id;

  RAISE NOTICE 'Backfill complete: % rows updated', (
    SELECT COUNT(*) FROM public.user_roles WHERE user_id IS NOT NULL
  );
END;
$$ LANGUAGE plpgsql;

-- Grant execute to service_role (used by edge functions)
GRANT EXECUTE ON FUNCTION backfill_user_role_ids() TO service_role;