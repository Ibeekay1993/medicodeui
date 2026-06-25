-- Function to unlock an account after a successful password reset
-- Only unlocks if the account was locked due to brute force (failed_attempts >= 5)
CREATE OR REPLACE FUNCTION public.unlock_account_after_reset(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_email TEXT;
  v_attempts INTEGER;
  v_status TEXT;
  v_user_role_id UUID;
BEGIN
  clean_email := lower(trim(p_email));
  
  SELECT id, failed_attempts, access_status INTO v_user_role_id, v_attempts, v_status
  FROM public.user_roles
  WHERE lower(trim(email)) = clean_email
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'User not found');
  END IF;

  -- Only heal if they were revoked and they had 5 or more failed attempts
  IF v_status = 'revoked' AND v_attempts >= 5 THEN
    UPDATE public.user_roles
    SET failed_attempts = 0,
        access_status = 'active',
        updated_at = now()
    WHERE id = v_user_role_id;
    RETURN jsonb_build_object('success', true, 'message', 'Account unlocked and attempts reset');
  ELSE
    -- Just reset attempts if they weren't revoked for brute force
    UPDATE public.user_roles
    SET failed_attempts = 0,
        updated_at = now()
    WHERE id = v_user_role_id;
    RETURN jsonb_build_object('success', true, 'message', 'Attempts reset, status unchanged');
  END IF;
END;
$$;
