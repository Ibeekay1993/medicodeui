-- ============================================================================
-- Rate Limiting + Export Audit Logging
-- Global healthcare standard (HIPAA §164.312(d), NDPR Art. 2.4)
--
-- 1. rate_limit_log table: sliding-window per-user call tracking
-- 2. check_rate_limit() helper used by sensitive RPCs
-- 3. audit_data_export() — called by frontend on every Excel/PDF export
-- 4. Rate-limit the search_nhis_beneficiaries RPC (20 calls/min per user)
-- ============================================================================
BEGIN;

-- ─── 1. Rate limit tracking table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  user_id      uuid        NOT NULL,
  action       text        NOT NULL,
  window_start timestamptz NOT NULL DEFAULT date_trunc('minute', now()),
  hit_count    integer     NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, action, window_start)
);

-- Only the service_role (backend/edge functions) and authenticated users
-- should touch this table; never anon.
ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rate_limit_log: users see own rows"
  ON public.rate_limit_log FOR SELECT TO authenticated
  USING (user_id = auth.uid());
-- Writes done by SECURITY DEFINER functions — no direct-write policy needed.
REVOKE INSERT, UPDATE, DELETE ON public.rate_limit_log FROM PUBLIC, anon;
GRANT SELECT ON public.rate_limit_log TO authenticated;
GRANT ALL ON public.rate_limit_log TO service_role;

-- ─── 2. check_rate_limit() helper ──────────────────────────────────────────
-- Returns TRUE if under limit, raises exception if over.
-- max_calls: maximum calls per window_minutes window (defaults: 20/min).
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_action       text,
  p_max_calls    integer DEFAULT 20,
  p_window_mins  integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_window     timestamptz := date_trunc('minute', now());
  v_hit_count  integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- Upsert the hit counter for this (user, action, window)
  INSERT INTO public.rate_limit_log(user_id, action, window_start, hit_count)
  VALUES (v_user_id, p_action, v_window, 1)
  ON CONFLICT (user_id, action, window_start)
  DO UPDATE SET hit_count = rate_limit_log.hit_count + 1
  RETURNING hit_count INTO v_hit_count;

  IF v_hit_count > p_max_calls THEN
    RAISE EXCEPTION 'Rate limit exceeded. Try again in a moment.' USING ERRCODE = '42501';
  END IF;

  -- Prune entries older than 1 hour to prevent unbounded growth
  DELETE FROM public.rate_limit_log
  WHERE user_id = v_user_id
    AND action  = p_action
    AND window_start < now() - interval '1 hour';
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO authenticated, service_role;

-- ─── 3. Apply rate limit to search_nhis_beneficiaries ──────────────────────
-- Hospital users: max 30 patient searches per minute (generous for normal use,
-- blocks automated scraping).
CREATE OR REPLACE FUNCTION public.search_nhis_beneficiaries(p_query text)
RETURNS TABLE (
  full_name          text,
  policy_number      text,
  beneficiary_number text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_query text;
BEGIN
  -- Rate limit: 30 searches per minute per user
  PERFORM public.check_rate_limit('search_nhis_beneficiaries', 30, 1);

  clean_query := trim(coalesce(p_query, ''));
  IF length(clean_query) < 3 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT b.full_name, b.policy_number, b.beneficiary_number
  FROM   public.nhis_beneficiaries b
  WHERE  b.policy_number        ILIKE '%' || clean_query || '%'
     OR  b.beneficiary_number   ILIKE '%' || clean_query || '%'
     OR  b.full_name            ILIKE '%' || clean_query || '%'
  ORDER BY b.full_name ASC
  LIMIT 10;
END;
$$;

REVOKE ALL ON FUNCTION public.search_nhis_beneficiaries(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_nhis_beneficiaries(text) TO authenticated, service_role;

-- ─── 4. Data export audit RPC ──────────────────────────────────────────────
-- Frontend calls this on every Excel/PDF/CSV export.
-- Records: who exported, what type, how many rows, what filters were active.
CREATE OR REPLACE FUNCTION public.audit_data_export(
  p_export_type   text,     -- e.g. 'excel', 'pdf', 'csv'
  p_resource      text,     -- e.g. 'authorization_requests', 'claims', 'reports'
  p_row_count     integer,
  p_filters       jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_logs (
    user_id,
    action,
    resource_type,
    metadata,
    created_at
  ) VALUES (
    auth.uid(),
    'data_export',
    p_resource,
    jsonb_build_object(
      'export_type',  p_export_type,
      'row_count',    p_row_count,
      'filters',      p_filters,
      'exported_at',  now()
    ),
    now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.audit_data_export(text, text, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_data_export(text, text, integer, jsonb) TO authenticated, service_role;

COMMIT;
