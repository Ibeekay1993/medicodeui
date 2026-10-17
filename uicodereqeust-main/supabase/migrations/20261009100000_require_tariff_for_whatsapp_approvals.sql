-- Deterministic WhatsApp intake deliberately skips automatic tariff matching.
-- Enforce the required human tariff selection at the database boundary so a
-- direct authorization_requests update cannot bypass the reviewer UI check.

-- The WhatsApp sender and tariff guards below must see a canonical source value.
-- Otherwise an authenticated insert using a padded/case-variant source could
-- skip the existing source='whatsapp' provenance trigger.
CREATE OR REPLACE FUNCTION public.canonicalize_whatsapp_authorization_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  normalized_source text := lower(btrim(coalesce(NEW.source, '')));
BEGIN
  IF normalized_source IN ('whatsapp', 'whatsapp_parser') THEN
    NEW.source := normalized_source;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.canonicalize_whatsapp_authorization_source()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS a_canonicalize_whatsapp_authorization_source
  ON public.authorization_requests;
CREATE TRIGGER a_canonicalize_whatsapp_authorization_source
  BEFORE INSERT
  ON public.authorization_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.canonicalize_whatsapp_authorization_source();

-- Authenticated browser inserts are limited to the hospital portal. Staff
-- WhatsApp parser submissions must pass through submit-authorization, which
-- verifies the bearer token and derives source/submitted_by server-side.
-- service_role is used only by trusted Edge Functions; it is not exposed to
-- browser clients and retains the webhook/worker intake path.
CREATE OR REPLACE FUNCTION public.derive_authorization_request_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  actor_role text := auth.role();
BEGIN
  IF actor_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authorization requests require a trusted intake path';
  END IF;

  IF public.has_role(actor_id, 'hospital'::public.app_role)
     AND NEW.hospital_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.user_roles ur
       WHERE ur.user_id = actor_id
         AND ur.role = 'hospital'::public.app_role
         AND ur.hospital_id = NEW.hospital_id
     ) THEN
    -- Derive the portal origin from the authenticated hospital identity.
    -- Client-supplied source/message markers are never trusted.
    NEW.source := 'hospital_portal';
    NEW.submitted_by := actor_id;
    NEW.whatsapp_message_id := NULL;
    NEW.whatsapp_raw_message := NULL;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Authorization requests must use the authenticated intake path';
END;
$$;

REVOKE ALL ON FUNCTION public.derive_authorization_request_provenance()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS a_derive_authorization_request_provenance
  ON public.authorization_requests;
CREATE TRIGGER a_derive_authorization_request_provenance
  BEFORE INSERT
  ON public.authorization_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.derive_authorization_request_provenance();

-- Remove every historical permissive client insert policy for clinical staff.
-- Their parser requests now use the authenticated Edge Function; the hospital
-- portal's ownership-scoped pending-only policy remains in place.
DROP POLICY IF EXISTS "Nurses can insert requests" ON public.authorization_requests;
DROP POLICY IF EXISTS "Nurses can manage requests" ON public.authorization_requests;
DROP POLICY IF EXISTS "Authenticated can insert requests" ON public.authorization_requests;
DROP POLICY IF EXISTS "Hospitals can create requests" ON public.authorization_requests;

CREATE OR REPLACE FUNCTION public.validate_whatsapp_approval_items(p_items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  item_code text;
  item_is_active boolean;
  has_selected_item boolean := false;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'WhatsApp approvals require at least one tariff item';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'WhatsApp approvals require at least one tariff item';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    item_code := NULLIF(trim(item->>'code'), '');
    IF item_code IS NULL THEN
      RAISE EXCEPTION 'WhatsApp approval items require a non-empty tariff code';
    END IF;

    SELECT is_active INTO item_is_active
    FROM public.nhia_items
    WHERE code = item_code
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'WhatsApp approval items must match an NHIA tariff';
    END IF;

    IF coalesce((item->>'declined')::boolean, false) IS FALSE THEN
      IF item_is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'Selected WhatsApp approval items must match an active NHIA tariff';
      END IF;
      has_selected_item := true;
    END IF;
  END LOOP;

  IF NOT has_selected_item THEN
    RAISE EXCEPTION 'WhatsApp approval requires at least one selected tariff item';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_whatsapp_approval_items(jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_whatsapp_tariff_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_is_whatsapp boolean := false;
  new_is_whatsapp boolean := false;
BEGIN
  new_is_whatsapp := lower(btrim(coalesce(NEW.source, ''))) IN ('whatsapp', 'whatsapp_parser')
    OR nullif(trim(coalesce(NEW.whatsapp_message_id, '')), '') IS NOT NULL
    OR nullif(trim(coalesce(NEW.whatsapp_raw_message, '')), '') IS NOT NULL;

  IF TG_OP = 'INSERT'
     AND lower(btrim(coalesce(NEW.source, ''))) = 'whatsapp'
     AND nullif(trim(coalesce(NEW.whatsapp_message_id, '')), '') IS NOT NULL
     AND NEW.whatsapp_message_id IS DISTINCT FROM NEW.whatsapp_raw_message THEN
    RAISE EXCEPTION 'WhatsApp authorization message identifiers must match';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    old_is_whatsapp := lower(btrim(coalesce(OLD.source, ''))) IN ('whatsapp', 'whatsapp_parser')
      OR nullif(trim(coalesce(OLD.whatsapp_message_id, '')), '') IS NOT NULL
      OR nullif(trim(coalesce(OLD.whatsapp_raw_message, '')), '') IS NOT NULL;

    -- Keep both the source and message identity immutable so a client cannot
    -- remove the WhatsApp origin marker before changing its decision.
    IF (old_is_whatsapp OR new_is_whatsapp) AND (
      NEW.source IS DISTINCT FROM OLD.source
      OR NEW.request_id IS DISTINCT FROM OLD.request_id
      OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
      OR NEW.patient_name IS DISTINCT FROM OLD.patient_name
      OR NEW.policy_number IS DISTINCT FROM OLD.policy_number
      OR NEW.beneficiary_number IS DISTINCT FROM OLD.beneficiary_number
      OR NEW.patient_phone IS DISTINCT FROM OLD.patient_phone
      OR NEW.hospital_id IS DISTINCT FROM OLD.hospital_id
      OR NEW.hospital_name IS DISTINCT FROM OLD.hospital_name
      OR NEW.requesting_hospital_id IS DISTINCT FROM OLD.requesting_hospital_id
      OR NEW.requesting_hospital_name IS DISTINCT FROM OLD.requesting_hospital_name
      OR NEW.referring_hospital_id IS DISTINCT FROM OLD.referring_hospital_id
      OR NEW.referring_hospital_name IS DISTINCT FROM OLD.referring_hospital_name
      OR (
        nullif(trim(coalesce(OLD.whatsapp_message_id, '')), '') IS NOT NULL
        AND NEW.whatsapp_message_id IS DISTINCT FROM OLD.whatsapp_message_id
      )
      OR (
        nullif(trim(coalesce(OLD.whatsapp_raw_message, '')), '') IS NOT NULL
        AND NEW.whatsapp_raw_message IS DISTINCT FROM OLD.whatsapp_raw_message
      )
      OR (
        NOT old_is_whatsapp
        AND (
          nullif(trim(coalesce(NEW.whatsapp_message_id, '')), '') IS NOT NULL
          OR nullif(trim(coalesce(NEW.whatsapp_raw_message, '')), '') IS NOT NULL
        )
      )
    ) THEN
      RAISE EXCEPTION 'The source, identity, and provenance of a WhatsApp authorization request cannot be changed';
    END IF;

    IF OLD.source = 'hospital_portal' AND (
      NEW.source IS DISTINCT FROM OLD.source
      OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
      OR NEW.whatsapp_message_id IS DISTINCT FROM OLD.whatsapp_message_id
      OR NEW.whatsapp_raw_message IS DISTINCT FROM OLD.whatsapp_raw_message
    ) THEN
      RAISE EXCEPTION 'The source and submitter of a hospital portal request cannot be changed';
    END IF;

    IF (old_is_whatsapp OR new_is_whatsapp)
       AND lower(coalesce(NEW.status, '')) = 'authorization_approved' THEN
      IF lower(coalesce(OLD.status, '')) <> 'authorization_approved' THEN
        RAISE EXCEPTION 'WhatsApp approvals must use a protected decision status';
      END IF;
    END IF;

    IF (old_is_whatsapp OR new_is_whatsapp)
       AND lower(coalesce(NEW.status, '')) = 'referral_accepted'
       AND lower(coalesce(OLD.status, '')) <> 'referral_accepted'
       AND lower(coalesce(OLD.status, '')) <> 'referral_approved' THEN
      RAISE EXCEPTION 'WhatsApp referral acceptance requires a prior approved referral';
    END IF;

    IF (old_is_whatsapp OR new_is_whatsapp)
       AND lower(coalesce(NEW.status, '')) = 'paid'
       AND lower(coalesce(OLD.status, '')) NOT IN (
         'approved', 'partially_approved', 'referral_approved',
         'referral_accepted', 'authorization_approved'
       ) THEN
      RAISE EXCEPTION 'WhatsApp payment status requires a prior approved authorization';
    END IF;
  ELSIF new_is_whatsapp
    AND lower(coalesce(NEW.status, '')) IN (
      'approved', 'partially_approved', 'referral_approved',
      'referral_accepted', 'authorization_approved', 'paid'
    ) THEN
    -- An INSERT is intake, never an approval decision. Requiring the UPDATE
    -- path preserves the existing clinical authorization and notification
    -- triggers, which cannot be bypassed by inserting a finalized row.
    RAISE EXCEPTION 'WhatsApp authorizations must be inserted pending and finalized through an approval update';
  END IF;

  IF old_is_whatsapp OR new_is_whatsapp THEN
    IF lower(coalesce(NEW.status, '')) IN (
      'approved', 'partially_approved', 'referral_approved', 'authorization_approved'
    ) AND (
      TG_OP <> 'UPDATE'
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.approved_items IS DISTINCT FROM OLD.approved_items
      OR NEW.diagnosis IS DISTINCT FROM OLD.diagnosis
      OR NEW.treatment IS DISTINCT FROM OLD.treatment
      OR NEW.source IS DISTINCT FROM OLD.source
      OR NEW.whatsapp_message_id IS DISTINCT FROM OLD.whatsapp_message_id
      OR NEW.whatsapp_raw_message IS DISTINCT FROM OLD.whatsapp_raw_message
    ) THEN
      -- Check current catalog activity when the insurer creates or materially
      -- edits its approval, including the clinical diagnosis and treatment.
      -- approval. Later stage-two/payment transitions keep that approval even
      -- if NHIA later retires the code. Revalidate only when the decision,
      -- selected cart, clinical decision content, or provenance changes so a
      -- harmless metadata update to a historical approved row does not require
      -- reconstructing its legacy tariff cart.
      PERFORM public.validate_whatsapp_approval_items(NEW.approved_items);
    ELSIF TG_OP = 'UPDATE'
       AND lower(coalesce(NEW.status, '')) IN ('referral_accepted', 'paid')
       AND NEW.approved_items IS DISTINCT FROM OLD.approved_items THEN
      PERFORM public.validate_whatsapp_approval_items(NEW.approved_items);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_whatsapp_tariff_confirmation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS a_require_whatsapp_tariff_confirmation
  ON public.authorization_requests;
DROP TRIGGER IF EXISTS a_require_whatsapp_tariff_confirmation_insert
  ON public.authorization_requests;
CREATE TRIGGER a_require_whatsapp_tariff_confirmation_insert
  BEFORE INSERT
  ON public.authorization_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_whatsapp_tariff_confirmation();

DROP TRIGGER IF EXISTS a_require_whatsapp_tariff_confirmation_update
  ON public.authorization_requests;
CREATE TRIGGER a_require_whatsapp_tariff_confirmation_update
  BEFORE UPDATE
  ON public.authorization_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_whatsapp_tariff_confirmation();

-- Decision authorization and notification checks are UPDATE triggers. Keep
-- WhatsApp inserts from bypassing those checks by creating an already-finalized
-- row. This trigger sorts after the existing hospital-portal sanitizer, which
-- normalizes new portal requests to pending/pending_referral first.
CREATE OR REPLACE FUNCTION public.prevent_finalized_whatsapp_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  is_whatsapp boolean;
BEGIN
  is_whatsapp := lower(btrim(coalesce(NEW.source, ''))) IN ('whatsapp', 'whatsapp_parser')
    OR nullif(trim(coalesce(NEW.whatsapp_message_id, '')), '') IS NOT NULL
    OR nullif(trim(coalesce(NEW.whatsapp_raw_message, '')), '') IS NOT NULL;

  -- Keep the insert-only decision restriction scoped to WhatsApp. Existing
  -- manual and hospital workflows retain their established insert behavior.
  IF is_whatsapp AND lower(coalesce(NEW.status, '')) IN (
    'approved', 'partially_approved', 'rejected', 'referral_approved',
    'referral_accepted', 'referral_declined', 'referral_expired',
    'authorization_approved', 'paid', 'declined'
  ) THEN
    RAISE EXCEPTION 'WhatsApp decisions must be finalized through an update';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_finalized_whatsapp_insert()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_prevent_finalized_authorization_insert
  ON public.authorization_requests;
DROP TRIGGER IF EXISTS zz_prevent_finalized_whatsapp_insert
  ON public.authorization_requests;
CREATE TRIGGER zz_prevent_finalized_whatsapp_insert
  BEFORE INSERT
  ON public.authorization_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_finalized_whatsapp_insert();

-- The stage-two hospital flow accepts only referrals that were approved by
-- the insurer first. The existing transition trigger checks ownership for
-- that path but otherwise permits a direct pending_referral -> accepted jump.
CREATE OR REPLACE FUNCTION public.require_approved_referral_before_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF lower(coalesce(NEW.status, '')) = 'referral_accepted'
     AND lower(coalesce(OLD.status, '')) NOT IN ('referral_approved', 'referral_accepted') THEN
    RAISE EXCEPTION 'Referral acceptance requires a prior approved referral';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.require_approved_referral_before_acceptance()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS b_require_approved_referral_before_acceptance
  ON public.authorization_requests;
CREATE TRIGGER b_require_approved_referral_before_acceptance
  BEFORE UPDATE OF status
  ON public.authorization_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.require_approved_referral_before_acceptance();
