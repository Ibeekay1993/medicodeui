-- Prevent concurrent WhatsApp authorization inserts from generating the same
-- REQ-YYYYMMDD-NNN request_id.
CREATE OR REPLACE FUNCTION public.generate_request_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_count INTEGER;
  date_str TEXT;
  pattern TEXT;
BEGIN
  date_str := to_char(now(), 'YYYYMMDD');
  pattern := 'REQ-' || date_str || '-([0-9]+)$';

  LOCK TABLE public.authorization_requests IN EXCLUSIVE MODE;

  SELECT COALESCE(MAX(CAST(substring(request_id from pattern) AS INTEGER)), 0) + 1
  INTO today_count
  FROM public.authorization_requests
  WHERE request_id LIKE 'REQ-' || date_str || '-%';

  NEW.request_id := 'REQ-' || date_str || '-' || LPAD(today_count::TEXT, 3, '0');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_request_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_request_id() TO service_role;
