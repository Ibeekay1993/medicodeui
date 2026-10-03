-- Integration checks for rpc_toggle_hospitals_status.
--
-- Run against a disposable Supabase database after applying
-- 20260912091500_add_bulk_hospital_status_rpc.sql:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/hospital_bulk_status.sql
--
-- Everything runs inside one transaction and is rolled back. The test uses
-- replica mode only to allow fake auth UUIDs for the authorization fixtures.

BEGIN;
SET LOCAL session_replication_role = replica;

DO $$
DECLARE
  v_definition TEXT;
  v_admin UUID := '00000000-0000-0000-0000-000000000001';
  v_user UUID := '00000000-0000-0000-0000-000000000002';
  v_a UUID := '00000000-0000-0000-0000-000000000011';
  v_b UUID := '00000000-0000-0000-0000-000000000012';
  v_c UUID := '00000000-0000-0000-0000-000000000013';
  v_unrelated UUID := '00000000-0000-0000-0000-000000000014';
  v_before TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  SELECT pg_get_functiondef(
    'public.rpc_toggle_hospitals_status(uuid[],boolean)'::regprocedure
  )
  INTO v_definition;

  IF v_definition NOT LIKE '%is_admin(auth.uid())%' OR
     v_definition NOT LIKE '%SECURITY DEFINER%' OR
     v_definition NOT LIKE '%cardinality(p_hospital_ids)%' OR
     v_definition NOT LIKE '%id = ANY(p_hospital_ids)%' OR
     v_definition NOT LIKE '%updated_at = NOW()%' THEN
    RAISE EXCEPTION 'Bulk hospital RPC definition does not preserve required safeguards';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_admin, 'admin'), (v_user, 'hospital');

  INSERT INTO public.hospitals (id, name, code, is_active, updated_at)
  VALUES
    (v_a, 'Bulk Test A', 'BULK-TEST-A', false, '2020-01-01T00:00:00Z'),
    (v_b, 'Bulk Test B', 'BULK-TEST-B', false, '2020-01-01T00:00:00Z'),
    (v_c, 'Bulk Test C', 'BULK-TEST-C', true, '2020-01-01T00:00:00Z'),
    (v_unrelated, 'Bulk Test Unrelated', 'BULK-TEST-U', false, '2020-01-01T00:00:00Z');

  PERFORM set_config('request.jwt.claim.sub', v_admin::TEXT, true);
  PERFORM public.rpc_toggle_hospitals_status(ARRAY[v_a, v_b, v_c], true);

  SELECT COUNT(*) INTO v_count
  FROM public.hospitals
  WHERE id IN (v_a, v_b, v_c) AND is_active = true;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Authorized bulk activation did not update all selected hospitals';
  END IF;

  SELECT updated_at INTO v_before FROM public.hospitals WHERE id = v_a;
  IF v_before <= '2020-01-01T00:00:00Z'::TIMESTAMPTZ THEN
    RAISE EXCEPTION 'Bulk activation did not update timestamps';
  END IF;

  PERFORM public.rpc_toggle_hospitals_status(ARRAY[v_a, v_b, v_c], false);
  SELECT COUNT(*) INTO v_count
  FROM public.hospitals
  WHERE id IN (v_a, v_b, v_c) AND is_active = false;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Authorized bulk deactivation did not update all selected hospitals';
  END IF;

  -- Empty and nonexistent IDs must not update unrelated rows.
  PERFORM public.rpc_toggle_hospitals_status('{}'::UUID[], true);
  PERFORM public.rpc_toggle_hospitals_status(
    ARRAY['00000000-0000-0000-0000-000000000099'::UUID], true
  );
  IF (SELECT is_active FROM public.hospitals WHERE id = v_unrelated) THEN
    RAISE EXCEPTION 'Empty or nonexistent IDs changed an unrelated hospital';
  END IF;

  -- The authorization check must reject non-admin callers independently of UI visibility.
  PERFORM set_config('request.jwt.claim.sub', v_user::TEXT, true);
  BEGIN
    PERFORM public.rpc_toggle_hospitals_status(ARRAY[v_a, v_b], true);
    RAISE EXCEPTION 'Unauthorized caller was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM = 'Unauthorized caller was accepted' THEN
        RAISE;
      END IF;
  END;

  -- Regression: the existing single-hospital RPC remains usable.
  PERFORM set_config('request.jwt.claim.sub', v_admin::TEXT, true);
  PERFORM public.rpc_toggle_hospital_status(v_a, true);
  IF NOT (SELECT is_active FROM public.hospitals WHERE id = v_a) THEN
    RAISE EXCEPTION 'Existing single-hospital toggle no longer works';
  END IF;
END;
$$;

ROLLBACK;
