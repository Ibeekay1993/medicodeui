-- Fix block_hospital_self_approval to allow hospitals to accept/decline referrals
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
    -- ALLOW hospitals to accept or decline referrals
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status NOT IN ('referral_accepted', 'referral_declined') THEN
        NEW.status := OLD.status;
      END IF;
    END IF;
    
    NEW.authorization_code := OLD.authorization_code;
    
    -- Allow hospital to provide a decision reason ONLY when declining a referral
    IF NEW.status = 'referral_declined' THEN
      -- Do nothing, keep NEW.decision_reason
    ELSE
      NEW.decision_reason := OLD.decision_reason;
    END IF;
    
    NEW.clinical_notes := OLD.clinical_notes;
    NEW.decided_at := OLD.decided_at;
  END IF;

  RETURN NEW;
END;
$$;
