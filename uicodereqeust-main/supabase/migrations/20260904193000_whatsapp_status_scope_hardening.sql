-- Second-stage WhatsApp hardening.
--
-- The worker resolves status/details from whatsapp_messages -> authorization_requests.
-- This migration makes that link itself security-sensitive:
--   * only active hospital contacts may set authorization_request_id;
--   * the linked request must belong to that sender's hospital;
--   * legacy links belonging to non-hospital senders are removed;
--   * security-definer RPCs are not callable by public/anon/authenticated clients.

REVOKE ALL ON FUNCTION public.resolve_whatsapp_hospital_contact(text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_whatsapp_hospital_contact(text)
TO service_role;

REVOKE ALL ON FUNCTION public.resolve_whatsapp_authorization_context(text, text, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_whatsapp_authorization_context(text, text, text)
TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_whatsapp_message_request_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sender_context jsonb;
  request_hospital_id uuid;
BEGIN
  -- Only protect the sensitive authorization_request_id relationship.
  IF NEW.authorization_request_id IS NULL THEN
    RETURN NEW;
  END IF;

  sender_context := public.resolve_whatsapp_hospital_contact(NEW.phone_number);

  IF coalesce((sender_context->>'authorized')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'WhatsApp request access denied: sender is not an active hospital contact';
  END IF;

  SELECT ar.hospital_id
  INTO request_hospital_id
  FROM public.authorization_requests ar
  WHERE ar.id = NEW.authorization_request_id;

  IF request_hospital_id IS NULL THEN
    RAISE EXCEPTION 'WhatsApp request access denied: request hospital is missing';
  END IF;

  IF request_hospital_id <> (sender_context->>'hospital_id')::uuid THEN
    RAISE EXCEPTION 'WhatsApp request access denied: request belongs to another hospital';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_whatsapp_message_request_scope
ON public.whatsapp_messages;

CREATE TRIGGER trg_enforce_whatsapp_message_request_scope
BEFORE UPDATE OF authorization_request_id ON public.whatsapp_messages
FOR EACH ROW
EXECUTE FUNCTION public.enforce_whatsapp_message_request_scope();

-- Remove legacy request links from numbers that are not currently registered
-- as active hospital contacts. Keep the raw message/audit row intact.
UPDATE public.whatsapp_messages wm
SET authorization_request_id = NULL
WHERE wm.authorization_request_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE lower(coalesce(ur.role::text, '')) = 'hospital'
      AND lower(coalesce(ur.access_status::text, '')) = 'active'
      AND ur.hospital_id IS NOT NULL
      AND public.normalize_whatsapp_phone(coalesce(ur.phone, '')) =
          public.normalize_whatsapp_phone(coalesce(wm.phone_number, ''))
  );

-- Also remove legacy links where the sender is a hospital contact but the
-- linked request belongs to a different hospital.
UPDATE public.whatsapp_messages wm
SET authorization_request_id = NULL
WHERE wm.authorization_request_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.authorization_requests ar
    WHERE ar.id = wm.authorization_request_id
      AND ar.hospital_id IS NOT NULL
      AND ar.hospital_id <> (
        SELECT ur.hospital_id
        FROM public.user_roles ur
        WHERE lower(coalesce(ur.role::text, '')) = 'hospital'
          AND lower(coalesce(ur.access_status::text, '')) = 'active'
          AND ur.hospital_id IS NOT NULL
          AND public.normalize_whatsapp_phone(coalesce(ur.phone, '')) =
              public.normalize_whatsapp_phone(coalesce(wm.phone_number, ''))
        ORDER BY ur.updated_at DESC NULLS LAST, ur.created_at DESC NULLS LAST
        LIMIT 1
      )
  );

-- Helpful indexes for the deterministic identity checks.
-- NOTE: user_roles.role is the app_role enum; enum -> text casts are STABLE and
-- therefore rejected inside index predicates (SQLSTATE 42P17). Enum equality
-- with the literal label is IMMUTABLE and equivalent to the original
-- lower(role::text) = 'hospital' check.

-- Pre-declare normalize_whatsapp_phone as IMMUTABLE here so the index below
-- can reference it without depending on migration 20260904203000 having run first.
-- Migration 20260904203000 will CREATE OR REPLACE this function with the same
-- definition, so this is fully idempotent.
CREATE OR REPLACE FUNCTION public.normalize_whatsapp_phone(_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE digits text;
BEGIN
  digits := regexp_replace(_phone, '[^0-9]', '', 'g');
  IF digits LIKE '00%' THEN digits := substr(digits, 3); END IF;
  IF digits LIKE '0%' AND length(digits) = 11 THEN digits := '234' || substr(digits, 2); END IF;
  IF digits LIKE '234%' THEN RETURN digits; END IF;
  IF length(digits) = 10 THEN RETURN '234' || digits; END IF;
  RETURN digits;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_user_roles_whatsapp_phone_active
ON public.user_roles (public.normalize_whatsapp_phone(phone))
WHERE role = 'hospital'::public.app_role
  AND lower(coalesce(access_status, '')) = 'active'
  AND hospital_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nhis_beneficiaries_whatsapp_identity
ON public.nhis_beneficiaries (
  upper(trim(policy_number)),
  regexp_replace(lower(trim(full_name)), '\s+', ' ', 'g')
);
