-- Final Recalibration for Ibadan Case Standards
-- Ensures exactly 9 numeric digits + R/AG/ + BD suffix
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
  
  -- Use exactly 9 numeric digits as seen in user image (e.g., 011007598)
  RETURN 'R/AG/' || LPAD(next_val::TEXT, 9, '0') || 'BD';
END;
$$;
