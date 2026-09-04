-- 20260905120000_whatsapp_notifications_rls.sql
-- Fix: explicitly enable RLS on whatsapp_notifications and grant controlled access.
--
-- Root cause: RLS was enabled on the table in production (manually or by external
-- process) but no migration in this repository managed it. The SECURITY DEFINER
-- trigger function fn_enqueue_whatsapp_notification() inserts into this table,
-- but without explicit RLS policies, the INSERT was rejected.
--
-- This migration makes the repository state match production and adds narrow,
-- deterministic policies:
--   - service_role: full access (trigger function + notification worker)
--   - authenticated: SELECT only (admin dashboard viewing)
--   - anon: no access

ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;

-- Service role: trigger function and worker process
DROP POLICY IF EXISTS "Service role manages whatsapp_notifications" ON public.whatsapp_notifications;
CREATE POLICY "Service role manages whatsapp_notifications"
ON public.whatsapp_notifications
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Authenticated users: read-only for admin dashboard
DROP POLICY IF EXISTS "Authenticated users can view whatsapp_notifications" ON public.whatsapp_notifications;
CREATE POLICY "Authenticated users can view whatsapp_notifications"
ON public.whatsapp_notifications
FOR SELECT
TO authenticated
USING (true);

-- Explicitly revoke any broad public access
REVOKE ALL ON public.whatsapp_notifications FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_notifications TO service_role;
GRANT SELECT ON public.whatsapp_notifications TO authenticated;
