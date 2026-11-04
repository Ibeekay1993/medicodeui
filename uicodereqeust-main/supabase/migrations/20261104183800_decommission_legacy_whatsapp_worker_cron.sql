-- Decommission legacy Supabase pg_cron and database triggers for WhatsApp worker.
-- WhatsApp worker execution is now handled externally via AWS.
BEGIN;

DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-worker-poll');
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN OTHERS THEN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_whatsapp_notification ON public.authorization_requests;
DROP TRIGGER IF EXISTS trg_whatsapp_notification_enqueue ON public.authorization_requests;

COMMIT;
