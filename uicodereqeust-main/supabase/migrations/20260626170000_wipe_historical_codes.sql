-- Migration to add wipe_historical_codes RPC for completely clearing historical data before an import.
-- Strict security: Only users with the 'admin' role can execute this.

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

  -- 2. Execute Wipe
  TRUNCATE TABLE public.historical_codes CASCADE;

END;
$$;
