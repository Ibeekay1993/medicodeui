-- migration: 20260630000003_admin_unenroll_mfa.sql

CREATE OR REPLACE FUNCTION public.admin_unenroll_mfa(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    -- Verify the caller has the 'admin' role in user_roles
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can unenroll MFA factors for users.';
    END IF;

    -- Delete all MFA factors for the target user
    DELETE FROM auth.mfa_factors
    WHERE user_id = p_user_id;

    -- Delete associated amr claims to prevent stale session states
    DELETE FROM auth.mfa_amr_claims
    WHERE session_id IN (
        SELECT id FROM auth.sessions WHERE user_id = p_user_id
    );

    -- Log the action
    INSERT INTO public.audit_logs (
        actor_id,
        action,
        entity_type,
        entity_id,
        details
    ) VALUES (
        auth.uid(),
        'ADMIN_UNENROLL_MFA',
        'user',
        p_user_id,
        jsonb_build_object('target_user_id', p_user_id)
    );
END;
$$;
