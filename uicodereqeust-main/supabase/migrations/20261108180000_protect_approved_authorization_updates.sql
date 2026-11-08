BEGIN;

CREATE OR REPLACE FUNCTION public.protect_approved_authorization_requests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NULLIF(OLD.authorization_code, ''), '') <> '' THEN
    NEW.authorization_code := COALESCE(NULLIF(NEW.authorization_code, ''), OLD.authorization_code);
  END IF;

  IF LOWER(COALESCE(OLD.status, '')) = 'approved' AND LOWER(COALESCE(NEW.status, '')) = 'pending' THEN
    NEW.status := OLD.status;
    NEW.decided_at := COALESCE(NEW.decided_at, OLD.decided_at);
    NEW.decision_reason := COALESCE(NULLIF(NEW.decision_reason, ''), OLD.decision_reason);
    NEW.clinical_notes := COALESCE(NULLIF(NEW.clinical_notes, ''), OLD.clinical_notes);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_approved_authorization_requests_trigger ON public.authorization_requests;
CREATE TRIGGER protect_approved_authorization_requests_trigger
BEFORE UPDATE ON public.authorization_requests
FOR EACH ROW
EXECUTE FUNCTION public.protect_approved_authorization_requests();

COMMIT;