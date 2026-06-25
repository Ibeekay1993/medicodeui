-- HIGH PRIORITY: Final Ibadan Sequence Calibration
-- Recalibrates Auth Code to match the 9-digit medical record standard (e.g. 011007598)
CREATE OR REPLACE FUNCTION public.generate_auth_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_val BIGINT;
BEGIN
  UPDATE public.auth_code_sequence
  SET current_value = current_value + 1
  WHERE id = 1
  RETURNING current_value INTO next_val;
  
  -- Hardcoded 9-digit format for the R/AG/XXXXXXXXXBD pattern
  RETURN 'R/AG/' || LPAD(next_val::TEXT, 9, '0') || 'BD';
END;
$$;
