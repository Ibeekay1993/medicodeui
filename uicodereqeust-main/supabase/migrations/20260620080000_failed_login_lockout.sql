-- Add failed_attempts column to user_roles
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0 NOT NULL;

-- Function to record failed login attempts
CREATE OR REPLACE FUNCTION public.record_failed_login(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role_id UUID;
  v_attempts INTEGER;
  v_status TEXT;
  clean_email TEXT;
BEGIN
  clean_email := lower(trim(p_email));
  
  -- Find the user role record by email
  SELECT id, failed_attempts, access_status INTO v_user_role_id, v_attempts, v_status
  FROM public.user_roles
  WHERE lower(trim(email)) = clean_email
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'User not found');
  END IF;

  -- If already revoked, do nothing
  IF v_status = 'revoked' OR v_status = 'suspended' THEN
    RETURN jsonb_build_object('success', true, 'failed_attempts', v_attempts, 'status', v_status);
  END IF;

  -- Increment attempts
  v_attempts := v_attempts + 1;
  
  IF v_attempts >= 5 THEN
    UPDATE public.user_roles
    SET failed_attempts = v_attempts,
        access_status = 'revoked',
        updated_at = now()
    WHERE id = v_user_role_id;
    v_status := 'revoked';
  ELSE
    UPDATE public.user_roles
    SET failed_attempts = v_attempts,
        updated_at = now()
    WHERE id = v_user_role_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'failed_attempts', v_attempts, 'status', v_status);
END;
$$;

-- Function to reset failed login attempts
CREATE OR REPLACE FUNCTION public.reset_failed_login(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_email TEXT;
BEGIN
  clean_email := lower(trim(p_email));
  
  UPDATE public.user_roles
  SET failed_attempts = 0,
      updated_at = now()
  WHERE lower(trim(email)) = clean_email;

  RETURN jsonb_build_object('success', true);
END;
$$;
