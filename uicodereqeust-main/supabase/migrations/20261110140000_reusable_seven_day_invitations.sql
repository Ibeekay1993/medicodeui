BEGIN;

CREATE TABLE IF NOT EXISTS public.user_invitation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  intended_email text NOT NULL,
  issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  consumed_at timestamptz,
  revoked_at timestamptz,
  CHECK (expires_at > issued_at)
);

CREATE INDEX IF NOT EXISTS idx_user_invitation_tokens_pending_user
  ON public.user_invitation_tokens (user_id, issued_at DESC)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

ALTER TABLE public.user_invitation_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_invitation_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_invitation_tokens TO service_role;

-- An invited account is not usable until activation is completed. Previously
-- opened one-time links can leave Auth confirmed while onboarding is pending.
UPDATE public.user_roles
SET access_status = 'suspended'
WHERE invite_status = 'pending'
  AND onboarding_completed = false
  AND access_status <> 'suspended';

-- RLS policies throughout the application call has_role(). Exclude suspended
-- accounts there as well as in the frontend so a confirmed-but-unfinished
-- invite cannot use its assigned role through a direct API request.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND lower(coalesce(ur.access_status, '')) = 'active'
      AND (
        ur.role = _role
        OR (
          _role IN ('nurse'::public.app_role, 'utilization_manager'::public.app_role)
          AND ur.role = 'utilization_manager_lead'::public.app_role
        )
        OR (_role = 'nurse'::public.app_role AND ur.role = 'utilization_manager'::public.app_role)
        OR (_role = 'utilization_manager'::public.app_role AND ur.role = 'nurse'::public.app_role)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.claim_user_invitation_token(p_token_hash text)
RETURNS TABLE(user_id uuid, intended_email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.user_invitation_tokens AS token
  SET claimed_at = now()
  WHERE token.token_hash = p_token_hash
    AND token.consumed_at IS NULL
    AND token.revoked_at IS NULL
    AND token.expires_at > now()
    AND (token.claimed_at IS NULL OR token.claimed_at < now() - interval '5 minutes')
  RETURNING token.user_id, token.intended_email;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_user_invitation_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_user_invitation_token(text) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_user_invitation(
  p_token_hash text,
  p_full_name text,
  p_hospital_name text DEFAULT NULL
)
RETURNS TABLE(role text, hospital_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_invitation public.user_invitation_tokens%rowtype;
  v_role public.app_role;
  v_hospital_id uuid;
  v_hospital_user_id uuid;
  v_name text := nullif(trim(p_full_name), '');
  v_hospital_name text := nullif(trim(p_hospital_name), '');
BEGIN
  IF v_name IS NULL OR length(v_name) > 200 THEN
    RAISE EXCEPTION 'A valid full name is required.' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_hospital_name, '')) > 200 THEN
    RAISE EXCEPTION 'Hospital name must be 200 characters or fewer.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_invitation
  FROM public.user_invitation_tokens token
  WHERE token.token_hash = p_token_hash
    AND token.consumed_at IS NULL
    AND token.revoked_at IS NULL
    AND token.expires_at > now()
    AND token.claimed_at > now() - interval '5 minutes'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation is invalid, expired, revoked, or already used.' USING ERRCODE = '22023';
  END IF;

  SELECT ur.role, ur.hospital_id INTO v_role, v_hospital_id
  FROM public.user_roles ur
  WHERE ur.user_id = v_invitation.user_id
    AND lower(trim(ur.email)) = lower(trim(v_invitation.intended_email))
    AND ur.invite_status = 'pending'
    AND ur.onboarding_completed = false
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation account is not pending activation.' USING ERRCODE = '22023';
  END IF;

  IF v_role = 'hospital'::public.app_role THEN
    IF v_hospital_id IS NOT NULL THEN
      SELECT hospital.user_id INTO v_hospital_user_id
      FROM public.hospitals hospital
      WHERE hospital.id = v_hospital_id
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'The assigned hospital could not be found.' USING ERRCODE = '22023';
      END IF;
      IF v_hospital_user_id IS NOT NULL AND v_hospital_user_id <> v_invitation.user_id THEN
        RAISE EXCEPTION 'The assigned hospital is already linked to another account.' USING ERRCODE = '23505';
      END IF;
      UPDATE public.hospitals
      SET user_id = v_invitation.user_id
      WHERE id = v_hospital_id AND (user_id IS NULL OR user_id = v_invitation.user_id);
    ELSE
      IF v_hospital_name IS NULL THEN
        RAISE EXCEPTION 'Hospital name is required to complete this invitation.' USING ERRCODE = '22023';
      END IF;
      SELECT hospital.id, hospital.user_id INTO v_hospital_id, v_hospital_user_id
      FROM public.hospitals hospital
      WHERE lower(trim(hospital.email)) = lower(trim(v_invitation.intended_email))
      ORDER BY hospital.created_at
      LIMIT 1
      FOR UPDATE;
      IF FOUND THEN
        IF v_hospital_user_id IS NOT NULL AND v_hospital_user_id <> v_invitation.user_id THEN
          RAISE EXCEPTION 'The hospital email is already linked to another account.' USING ERRCODE = '23505';
        END IF;
        UPDATE public.hospitals
        SET name = v_hospital_name, user_id = v_invitation.user_id
        WHERE id = v_hospital_id;
      ELSE
        INSERT INTO public.hospitals (name, user_id, email, code)
        VALUES (
          v_hospital_name,
          v_invitation.user_id,
          lower(trim(v_invitation.intended_email)),
          'HOSP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
        )
        RETURNING id INTO v_hospital_id;
      END IF;
    END IF;
  END IF;

  UPDATE public.user_roles
  SET full_name = v_name,
      hospital_id = CASE WHEN v_role = 'hospital'::public.app_role THEN v_hospital_id ELSE hospital_id END,
      access_status = 'active',
      onboarding_completed = true,
      onboarding_completed_at = now(),
      invite_status = 'completed'
  WHERE user_id = v_invitation.user_id;

  INSERT INTO public.consent_logs (user_id, action, policy_version)
  VALUES (v_invitation.user_id, 'accept_all', '2026-07');

  UPDATE public.user_invitation_tokens
  SET consumed_at = now(), claimed_at = NULL
  WHERE id = v_invitation.id;

  RETURN QUERY SELECT v_role::text, v_hospital_id;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_user_invitation(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_user_invitation(text, text, text) TO service_role;

COMMIT;
