-- Dedicated WhatsApp identity registry.
-- Website login access remains in user_roles; WhatsApp authorization access is independent.

CREATE TABLE IF NOT EXISTS public.hospital_whatsapp_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  contact_name text,
  contact_role text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'disabled')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

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

-- Backfill existing active hospital WhatsApp identities so the migration does not
-- disconnect currently authorized numbers. Future access is managed here, not in user_roles.
INSERT INTO public.hospital_whatsapp_contacts
  (hospital_id, phone_number, contact_name, contact_role, status)
SELECT DISTINCT ON (public.normalize_whatsapp_phone(ur.phone), ur.hospital_id)
  ur.hospital_id,
  public.normalize_whatsapp_phone(ur.phone),
  ur.full_name,
  ur.role::text,
  'active'
FROM public.user_roles ur
WHERE lower(coalesce(ur.role::text, '')) = 'hospital'
  AND lower(coalesce(ur.access_status::text, '')) = 'active'
  AND ur.hospital_id IS NOT NULL
  AND nullif(public.normalize_whatsapp_phone(coalesce(ur.phone, '')), '') IS NOT NULL
ORDER BY public.normalize_whatsapp_phone(ur.phone), ur.hospital_id, ur.updated_at DESC NULLS LAST, ur.created_at DESC NULLS LAST
ON CONFLICT DO NOTHING;

-- A normalized active number must identify exactly one hospital.
CREATE UNIQUE INDEX IF NOT EXISTS ux_hospital_whatsapp_contacts_active_phone
ON public.hospital_whatsapp_contacts (public.normalize_whatsapp_phone(phone_number))
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_hospital_whatsapp_contacts_hospital
ON public.hospital_whatsapp_contacts (hospital_id, status);

CREATE INDEX IF NOT EXISTS idx_hospital_whatsapp_contacts_phone
ON public.hospital_whatsapp_contacts (public.normalize_whatsapp_phone(phone_number));

ALTER TABLE public.hospital_whatsapp_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage hospital WhatsApp contacts" ON public.hospital_whatsapp_contacts;
CREATE POLICY "Admins manage hospital WhatsApp contacts"
ON public.hospital_whatsapp_contacts
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Service role manages hospital WhatsApp contacts" ON public.hospital_whatsapp_contacts;
CREATE POLICY "Service role manages hospital WhatsApp contacts"
ON public.hospital_whatsapp_contacts
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Prevent non-admin callers from using the registry as a public lookup API.
REVOKE ALL ON public.hospital_whatsapp_contacts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hospital_whatsapp_contacts TO authenticated;

-- Replace the security resolver so WhatsApp authorization depends only on the
-- dedicated registry. user_roles no longer grants WhatsApp access by itself.
CREATE OR REPLACE FUNCTION public.resolve_whatsapp_hospital_contact(_phone text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  normalized text;
  contact_count integer;
  hospital_count integer;
  resolved_hospital uuid;
  contact_id uuid;
  contact_name text;
  contact_role text;
BEGIN
  normalized := public.normalize_whatsapp_phone(coalesce(_phone, ''));
  IF normalized = '' THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'phone_required');
  END IF;

  SELECT count(*) INTO contact_count
  FROM public.hospital_whatsapp_contacts c
  WHERE c.status = 'active'
    AND public.normalize_whatsapp_phone(c.phone_number) = normalized;

  SELECT count(DISTINCT c.hospital_id) INTO hospital_count
  FROM public.hospital_whatsapp_contacts c
  WHERE c.status = 'active'
    AND public.normalize_whatsapp_phone(c.phone_number) = normalized;

  IF contact_count = 0 THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'unregistered_sender');
  END IF;

  IF hospital_count <> 1 THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'ambiguous_sender');
  END IF;

  SELECT c.id, c.hospital_id, c.contact_name, c.contact_role
  INTO contact_id, resolved_hospital, contact_name, contact_role
  FROM public.hospital_whatsapp_contacts c
  WHERE c.status = 'active'
    AND public.normalize_whatsapp_phone(c.phone_number) = normalized
  ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC NULLS LAST
  LIMIT 1;

  RETURN jsonb_build_object(
    'authorized', true,
    'hospital_id', resolved_hospital,
    'contact_id', contact_id,
    'contact_name', contact_name,
    'role', contact_role,
    'phone', normalized
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_whatsapp_hospital_contact(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_whatsapp_hospital_contact(text) TO service_role;

-- Ensure existing authorization-security RPCs use the new resolver through the
-- function dependency above; no WhatsApp user login is required.
