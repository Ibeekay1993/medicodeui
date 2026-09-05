-- Migration: Hospital WhatsApp Audit Trail and Revocation Support
-- Expands status values to include 'revoked' and adds immutable security audit logging.

-- 1. Update status constraint to include 'revoked'
ALTER TABLE public.hospital_whatsapp_contacts
  DROP CONSTRAINT IF EXISTS hospital_whatsapp_contacts_status_check;

ALTER TABLE public.hospital_whatsapp_contacts
  ADD CONSTRAINT hospital_whatsapp_contacts_status_check
  CHECK (status IN ('pending', 'active', 'disabled', 'revoked'));

-- 2. Create dedicated audit log table for hospital WhatsApp access events
CREATE TABLE IF NOT EXISTS public.hospital_whatsapp_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.hospital_whatsapp_contacts(id) ON DELETE SET NULL,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  action text NOT NULL CHECK (action IN ('added', 'activated', 'deactivated', 'revoked', 'edited', 'deleted', 'hospital_reassigned')),
  old_status text,
  new_status text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hospital_whatsapp_audit_hospital
ON public.hospital_whatsapp_audit_logs (hospital_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hospital_whatsapp_audit_phone
ON public.hospital_whatsapp_audit_logs (phone_number, created_at DESC);

-- Enable RLS
ALTER TABLE public.hospital_whatsapp_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view hospital WhatsApp audit logs" ON public.hospital_whatsapp_audit_logs;
CREATE POLICY "Admins view hospital WhatsApp audit logs"
ON public.hospital_whatsapp_audit_logs
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins insert hospital WhatsApp audit logs" ON public.hospital_whatsapp_audit_logs;
CREATE POLICY "Admins insert hospital WhatsApp audit logs"
ON public.hospital_whatsapp_audit_logs
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Service role full access on hospital WhatsApp audit logs" ON public.hospital_whatsapp_audit_logs;
CREATE POLICY "Service role full access on hospital WhatsApp audit logs"
ON public.hospital_whatsapp_audit_logs
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

REVOKE ALL ON public.hospital_whatsapp_audit_logs FROM anon;
GRANT SELECT, INSERT ON public.hospital_whatsapp_audit_logs TO authenticated;

-- 3. Security RPC to record audit entries
CREATE OR REPLACE FUNCTION public.log_hospital_whatsapp_audit_event(
  _contact_id uuid,
  _hospital_id uuid,
  _phone_number text,
  _action text,
  _old_status text DEFAULT NULL,
  _new_status text DEFAULT NULL,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  log_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR current_setting('role', true) = 'service_role') THEN
    RAISE EXCEPTION 'unauthorized audit log creation';
  END IF;

  INSERT INTO public.hospital_whatsapp_audit_logs (
    actor_id,
    contact_id,
    hospital_id,
    phone_number,
    action,
    old_status,
    new_status,
    details
  ) VALUES (
    auth.uid(),
    _contact_id,
    _hospital_id,
    public.normalize_whatsapp_phone(_phone_number),
    _action,
    _old_status,
    _new_status,
    coalesce(_details, '{}'::jsonb)
  )
  RETURNING id INTO log_id;

  RETURN log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_hospital_whatsapp_audit_event TO authenticated, service_role;
