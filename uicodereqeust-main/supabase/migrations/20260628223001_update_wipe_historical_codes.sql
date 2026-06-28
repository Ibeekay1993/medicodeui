BEGIN;

CREATE OR REPLACE FUNCTION public.wipe_historical_codes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Security Check: Only admins are allowed
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can wipe the historical codes database.';
  END IF;

  -- 2. Delete synced historical authorizations from the main table
  DELETE FROM public.authorization_requests WHERE is_historical = true;

  -- 3. Execute Wipe on the historical codes themselves
  TRUNCATE TABLE public.historical_codes CASCADE;

END;
$$;

COMMIT;
