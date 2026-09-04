-- 20260905130000_whatsapp_notifications_rls_tighten.sql
-- Fix: restrict authenticated SELECT on whatsapp_notifications to admin users only.
--
-- The previous migration (20260905120000_whatsapp_notifications_rls.sql) granted
-- SELECT to ALL authenticated users, which exposed patient names, phone numbers,
-- and authorization request IDs to any logged-in user. This migration tightens
-- the policy to admin-only access, consistent with the hospital_whatsapp_contacts
-- admin policy pattern.

DROP POLICY IF EXISTS "Authenticated users can view whatsapp_notifications"
ON public.whatsapp_notifications;

CREATE POLICY "Admin users can view whatsapp_notifications"
ON public.whatsapp_notifications
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));