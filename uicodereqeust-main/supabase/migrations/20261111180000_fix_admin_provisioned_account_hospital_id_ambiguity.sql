BEGIN;

-- RETURNS TABLE exposes hospital_id as a PL/pgSQL output variable. Qualify the
-- user_roles reference below so it cannot conflict with that output variable.
CREATE OR REPLACE FUNCTION public.complete_admin_provisioned_account(
  p_user_id uuid,
  p_full_name text,
  p_hospital_name text DEFAULT NULL
)
RETURNS TABLE(role text, hospital_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, pg_temp
AS $$
DECLARE
  v_role public.app_role;
  v_hospital_id uuid;
  v_hospital_user_id uuid;
  v_email text;
  v_name text := nullif(trim(p_full_name), '');
  v_hospital_name text := nullif(trim(p_hospital_name), '');
BEGIN
  IF p_user_id IS NULL OR v_name IS NULL OR length(v_name) > 200 THEN
    RAISE EXCEPTION 'A valid user and full name are required.' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_hospital_name, '')) > 200 THEN
    RAISE EXCEPTION 'Hospital name must be 200 characters or fewer.' USING ERRCODE = '22023';
  END IF;

  SELECT ur.role, ur.hospital_id, lower(trim(ur.email))
    INTO v_role, v_hospital_id, v_email
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id
    AND ur.access_status = 'active'
    AND ur.invite_status = 'pending'
    AND ur.onboarding_completed IS FALSE
    AND ur.account_setup_required IS TRUE
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This account is not awaiting setup.' USING ERRCODE = '22023';
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
      IF v_hospital_user_id IS NOT NULL AND v_hospital_user_id <> p_user_id THEN
        RAISE EXCEPTION 'The assigned hospital is already linked to another account.' USING ERRCODE = '23505';
      END IF;
      UPDATE public.hospitals
      SET user_id = p_user_id
      WHERE id = v_hospital_id AND (user_id IS NULL OR user_id = p_user_id);
    ELSE
      IF v_hospital_name IS NULL THEN
        RAISE EXCEPTION 'Hospital name is required to complete this account.' USING ERRCODE = '22023';
      END IF;
      SELECT hospital.id, hospital.user_id INTO v_hospital_id, v_hospital_user_id
      FROM public.hospitals hospital
      WHERE lower(trim(hospital.email)) = v_email
      ORDER BY hospital.created_at
      LIMIT 1
      FOR UPDATE;
      IF FOUND THEN
        IF v_hospital_user_id IS NOT NULL AND v_hospital_user_id <> p_user_id THEN
          RAISE EXCEPTION 'The hospital email is already linked to another account.' USING ERRCODE = '23505';
        END IF;
        UPDATE public.hospitals
        SET name = v_hospital_name, user_id = p_user_id
        WHERE id = v_hospital_id;
      ELSE
        INSERT INTO public.hospitals (name, user_id, email, code)
        VALUES (
          v_hospital_name,
          p_user_id,
          v_email,
          'HOSP-' || upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 8))
        )
        RETURNING id INTO v_hospital_id;
      END IF;
    END IF;
  END IF;

  UPDATE public.user_roles AS ur
  SET full_name = v_name,
      hospital_id = CASE WHEN v_role = 'hospital'::public.app_role THEN v_hospital_id ELSE ur.hospital_id END,
      onboarding_completed = true,
      onboarding_completed_at = now(),
      invite_status = 'completed'
  WHERE ur.user_id = p_user_id;

  INSERT INTO public.consent_logs (user_id, action, policy_version)
  VALUES (p_user_id, 'accept_all', '2026-07');

  RETURN QUERY SELECT v_role::text, v_hospital_id;
END;
$$;

COMMIT;
