ALTER TABLE public.authorization_requests
  ADD COLUMN IF NOT EXISTS nurse_initials TEXT,
  ADD COLUMN IF NOT EXISTS authorized_by_name TEXT,
  ADD COLUMN IF NOT EXISTS authorized_by_email TEXT;

CREATE INDEX IF NOT EXISTS idx_authorization_requests_nurse_initials
  ON public.authorization_requests(nurse_initials);

CREATE OR REPLACE FUNCTION public.generate_auth_code(nurse_initials TEXT DEFAULT 'AG')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_val BIGINT;
  clean_initials TEXT;
BEGIN
  clean_initials := upper(regexp_replace(coalesce(nurse_initials, 'AG'), '[^A-Za-z]', '', 'g'));
  clean_initials := left(clean_initials, 4);
  IF clean_initials = '' THEN
    clean_initials := 'AG';
  END IF;

  UPDATE public.auth_code_sequence
  SET current_value = current_value + 1
  WHERE id = 1
  RETURNING current_value INTO next_val;

  RETURN 'R/' || clean_initials || '/' || LPAD(next_val::TEXT, 9, '0') || 'BD';
END;
$$;
