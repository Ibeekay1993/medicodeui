-- ============================================================
-- Migration: 20261105110000_restore_whatsapp_approval_notifications.sql
-- Purpose  : Restore the database trigger and recovery cron job for
--            automatic WhatsApp approval notifications to hospitals and patients.
--            Fixes regression from 20261104183800 which dropped the trigger.
--            Enhances hospital phone resolution with name-based fallback.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_enqueue_whatsapp_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  decision_type  text;
  hospital_phone text;
  worker_secret  text;
  resolved_hospital_id uuid;
  resolved_hospital_name text;
BEGIN
  -- Guard: skip WhatsApp for historical import records.
  IF COALESCE(NEW.request_id, '') LIKE 'REQ-HIST-%' THEN
    RETURN NEW;
  END IF;

  -- Fire whenever status transitions to approved, partially approved, rejected, or referral approved
  IF OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status IN ('approved', 'partially_approved', 'rejected', 'referral_approved')
     AND (
       NEW.status = 'rejected'
       OR COALESCE(NULLIF(BTRIM(NEW.authorization_code), ''), '') <> ''
     )
  THEN
    decision_type := CASE
      WHEN NEW.status = 'partially_approved' THEN 'PARTIAL_APPROVAL'
      WHEN NEW.status = 'rejected'           THEN 'REJECTION'
      ELSE                                        'APPROVAL'
    END;

    resolved_hospital_id := COALESCE(NEW.requesting_hospital_id, NEW.hospital_id);
    resolved_hospital_name := COALESCE(NULLIF(BTRIM(NEW.requesting_hospital_name), ''), NULLIF(BTRIM(NEW.hospital_name), ''));

    -- Resolve hospital phone:
    -- 1. Prior WhatsApp message history on this request
    -- 2. Registered WhatsApp contact for hospital (by hospital_id)
    -- 3. Hospital record phone (by hospital_id)
    -- 4. Registered WhatsApp contact for hospital (by hospital name)
    -- 5. Hospital record phone (by hospital name)
    SELECT COALESCE(
      (SELECT wm.phone_number
         FROM public.whatsapp_messages AS wm
        WHERE wm.authorization_request_id = NEW.id
        ORDER BY wm.received_at ASC
        LIMIT 1),
      (SELECT c.phone_number
         FROM public.hospital_whatsapp_contacts AS c
        WHERE c.hospital_id = resolved_hospital_id
          AND c.status = 'active'
        ORDER BY c.updated_at DESC
        LIMIT 1),
      (SELECT h.phone
         FROM public.hospitals AS h
        WHERE h.id = resolved_hospital_id
        LIMIT 1),
      (SELECT c.phone_number
         FROM public.hospital_whatsapp_contacts AS c
         JOIN public.hospitals AS h ON h.id = c.hospital_id
        WHERE resolved_hospital_name IS NOT NULL
          AND h.name ILIKE resolved_hospital_name
          AND c.status = 'active'
        ORDER BY c.updated_at DESC
        LIMIT 1),
      (SELECT h.phone
         FROM public.hospitals AS h
        WHERE resolved_hospital_name IS NOT NULL
          AND h.name ILIKE resolved_hospital_name
          AND NULLIF(BTRIM(h.phone), '') IS NOT NULL
        LIMIT 1)
    ) INTO hospital_phone;

    -- Enqueue notification for hospital
    INSERT INTO public.whatsapp_notifications (
      authorization_request_id,
      phone_number,
      notification_type,
      recipient_type,
      decision_at,
      status
    ) VALUES (
      NEW.id,
      hospital_phone,
      decision_type,
      'hospital',
      COALESCE(NEW.decided_at, now()),
      'queued_v2'
    ) ON CONFLICT DO NOTHING;

    -- Enqueue notification for patient
    INSERT INTO public.whatsapp_notifications (
      authorization_request_id,
      phone_number,
      notification_type,
      recipient_type,
      decision_at,
      status
    ) VALUES (
      NEW.id,
      NEW.patient_phone,
      decision_type,
      'patient',
      COALESCE(NEW.decided_at, now()),
      'queued_v2'
    ) ON CONFLICT DO NOTHING;

    -- Wake up the WhatsApp worker immediately (best-effort; cron acts as backstop)
    BEGIN
      SELECT decrypted_secret INTO worker_secret
        FROM vault.decrypted_secrets
       WHERE name = 'medcode_whatsapp_worker_secret_20261004'
       LIMIT 1;

      IF NULLIF(BTRIM(worker_secret), '') IS NOT NULL THEN
        PERFORM net.http_post(
          url     := 'https://optistuvyeiojlgmkdks.supabase.co/functions/v1/whatsapp-worker',
          headers := jsonb_build_object(
                       'Content-Type',     'application/json',
                       'x-worker-secret',  worker_secret
                     ),
          body    := jsonb_build_object('authorization_request_id', NEW.id),
          timeout_milliseconds := 45000
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'WhatsApp worker immediate wake-up failed (SQLSTATE %); cron recovery remains active.', SQLSTATE;
    END;

  END IF;

  RETURN NEW;
END;
$$;

-- Ensure the trigger is attached to authorization_requests
DROP TRIGGER IF EXISTS trg_enqueue_whatsapp_notification ON public.authorization_requests;
DROP TRIGGER IF EXISTS trg_whatsapp_notification_enqueue ON public.authorization_requests;

CREATE TRIGGER trg_enqueue_whatsapp_notification
  AFTER UPDATE OF status
  ON public.authorization_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enqueue_whatsapp_notification();

-- Restore the 5-minute recovery cron job to ensure no notifications are dropped
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule('whatsapp-worker-poll');
    PERFORM cron.schedule(
      'whatsapp-worker-poll',
      '*/5 * * * *',
      $cron_job_sql$
        SELECT net.http_post(
          url := 'https://optistuvyeiojlgmkdks.supabase.co/functions/v1/whatsapp-worker',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-worker-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'medcode_whatsapp_worker_secret_20261004' LIMIT 1)
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 45000
        );
      $cron_job_sql$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron whatsapp-worker-poll schedule restore skipped: %', SQLERRM;
END;
$$;

COMMIT;
