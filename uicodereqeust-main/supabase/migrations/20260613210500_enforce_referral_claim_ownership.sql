BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_authorization_request_referral_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.referred_hospital_id IS NOT NULL THEN
    IF NEW.claiming_hospital_id IS NOT NULL
       AND NEW.claiming_hospital_id <> NEW.referred_hospital_id THEN
      RAISE EXCEPTION 'claiming_hospital_id must match referred_hospital_id for referred authorizations'
        USING ERRCODE = '23514';
    END IF;

    NEW.claiming_hospital_id := NEW.referred_hospital_id;

    IF NEW.claiming_hospital_name IS NULL THEN
      NEW.claiming_hospital_name := NEW.referred_hospital_name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_authorization_request_referral_owner ON public.authorization_requests;
CREATE TRIGGER enforce_authorization_request_referral_owner
BEFORE INSERT OR UPDATE ON public.authorization_requests
FOR EACH ROW
EXECUTE FUNCTION public.enforce_authorization_request_referral_owner();

CREATE OR REPLACE FUNCTION public.enforce_hospital_claim_referral_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_request public.authorization_requests%ROWTYPE;
  v_hospital public.hospitals%ROWTYPE;
BEGIN
  IF NEW.request_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_request
  FROM public.authorization_requests
  WHERE id = NEW.request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authorization request not found for claim'
      USING ERRCODE = '23503';
  END IF;

  IF v_request.referred_hospital_id IS NOT NULL THEN
    IF NEW.hospital_id <> v_request.referred_hospital_id THEN
      RAISE EXCEPTION 'Only the referred hospital can create or submit claims for a referred authorization'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.claiming_hospital_id IS NOT NULL
       AND NEW.claiming_hospital_id <> v_request.referred_hospital_id THEN
      RAISE EXCEPTION 'claiming_hospital_id must match referred_hospital_id for referred claims'
        USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_hospital
    FROM public.hospitals
    WHERE id = v_request.referred_hospital_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referred hospital not found'
        USING ERRCODE = '23503';
    END IF;

    NEW.referred_hospital_id := v_request.referred_hospital_id;
    NEW.referred_hospital_name := COALESCE(NEW.referred_hospital_name, v_request.referred_hospital_name, v_hospital.name);
    NEW.claiming_hospital_id := v_request.referred_hospital_id;
    NEW.claiming_hospital_name := COALESCE(NEW.claiming_hospital_name, v_request.claiming_hospital_name, v_request.referred_hospital_name, v_hospital.name);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_hospital_claim_referral_owner ON public.hospital_claims;
CREATE TRIGGER enforce_hospital_claim_referral_owner
BEFORE INSERT OR UPDATE ON public.hospital_claims
FOR EACH ROW
EXECUTE FUNCTION public.enforce_hospital_claim_referral_owner();

UPDATE public.authorization_requests
SET
  claiming_hospital_id = referred_hospital_id,
  claiming_hospital_name = COALESCE(claiming_hospital_name, referred_hospital_name)
WHERE referred_hospital_id IS NOT NULL
  AND claiming_hospital_id IS DISTINCT FROM referred_hospital_id;

UPDATE public.hospital_claims hc
SET
  hospital_id = ar.referred_hospital_id,
  hospital_name = rh.name,
  referred_hospital_id = ar.referred_hospital_id,
  referred_hospital_name = COALESCE(hc.referred_hospital_name, ar.referred_hospital_name, rh.name),
  claiming_hospital_id = ar.referred_hospital_id,
  claiming_hospital_name = COALESCE(hc.claiming_hospital_name, ar.claiming_hospital_name, ar.referred_hospital_name, rh.name)
FROM public.authorization_requests ar
JOIN public.hospitals rh ON rh.id = ar.referred_hospital_id
WHERE hc.request_id = ar.id
  AND ar.referred_hospital_id IS NOT NULL
  AND (
    hc.hospital_id IS DISTINCT FROM ar.referred_hospital_id
    OR hc.referred_hospital_id IS DISTINCT FROM ar.referred_hospital_id
    OR hc.claiming_hospital_id IS DISTINCT FROM ar.referred_hospital_id
  );

DROP POLICY IF EXISTS "Hospitals can create own claims" ON public.hospital_claims;
CREATE POLICY "Hospitals can create own claims"
  ON public.hospital_claims
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'hospital')
    AND created_by = auth.uid()
    AND status = 'draft'
    AND hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
    AND hospital_name = (
      SELECT h.name
      FROM public.hospitals h
      WHERE h.id = hospital_id
    )
    AND request_id IN (
      SELECT ar.id
      FROM public.authorization_requests ar
      WHERE ar.status = 'approved'
        AND COALESCE(ar.referred_hospital_id, ar.claiming_hospital_id, ar.hospital_id) IN (
          SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid()
        )
        AND COALESCE(ar.referred_hospital_id, ar.claiming_hospital_id, ar.hospital_id) = hospital_id
        AND (ar.referred_hospital_id IS NULL OR ar.referred_hospital_id = hospital_id)
    )
  );

COMMIT;
