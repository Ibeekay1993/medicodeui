-- Migration to strictly prevent hospitals from updating HMO-controlled fields

-- 1. Create the function that will enforce this rule
CREATE OR REPLACE FUNCTION public.block_hospital_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only apply these strict rules if the user is a hospital
  IF public.has_role(auth.uid(), 'hospital') THEN
    -- Forcefully keep the HMO-controlled fields to their original (OLD) values
    NEW.status := OLD.status;
    NEW.authorization_code := OLD.authorization_code;
    NEW.decision_reason := OLD.decision_reason;
    NEW.clinical_notes := OLD.clinical_notes;
    NEW.decided_at := OLD.decided_at;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Attach the trigger to the authorization_requests table BEFORE UPDATE
DROP TRIGGER IF EXISTS block_hospital_self_approval_trigger ON public.authorization_requests;

CREATE TRIGGER block_hospital_self_approval_trigger
BEFORE UPDATE ON public.authorization_requests
FOR EACH ROW
EXECUTE FUNCTION public.block_hospital_self_approval();
