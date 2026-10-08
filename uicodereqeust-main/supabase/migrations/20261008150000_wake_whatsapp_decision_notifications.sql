-- Wake the durable decision-notification worker as soon as approval rows are
-- enqueued. Keep the five-minute cron as a low-load recovery backstop.
BEGIN;

CREATE OR REPLACE FUNCTION public.fn_enqueue_whatsapp_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  decision_type text;
  hospital_phone text;
  worker_secret text;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status IN ('approved', 'partially_approved', 'rejected', 'referral_approved')
     AND NEW.decided_at IS NOT NULL
     AND NEW.decided_by IS NOT NULL
     AND (
       NEW.status = 'rejected'
       OR (
         NEW.approved_by IS NOT NULL
         AND COALESCE(NULLIF(BTRIM(NEW.authorization_code), ''), '') <> ''
       )
     ) THEN
    decision_type := CASE
      WHEN NEW.status = 'partially_approved' THEN 'PARTIAL_APPROVAL'
      WHEN NEW.status = 'rejected' THEN 'REJECTION'
      ELSE 'APPROVAL'
    END;

    SELECT COALESCE(
      (
        SELECT wm.phone_number
        FROM public.whatsapp_messages AS wm
        WHERE wm.authorization_request_id = NEW.id
        ORDER BY wm.received_at ASC
        LIMIT 1
      ),
      (
        SELECT c.phone_number
        FROM public.hospital_whatsapp_contacts AS c
        WHERE c.hospital_id = COALESCE(NEW.requesting_hospital_id, NEW.hospital_id)
          AND c.status = 'active'
        ORDER BY c.updated_at DESC
        LIMIT 1
      ),
      (
        SELECT h.phone
        FROM public.hospitals AS h
        WHERE h.id = COALESCE(NEW.requesting_hospital_id, NEW.hospital_id)
        LIMIT 1
      )
    ) INTO hospital_phone;

    INSERT INTO public.whatsapp_notifications (
      authorization_request_id, phone_number, notification_type,
      recipient_type, decision_at, status
    ) VALUES (
      NEW.id, hospital_phone, decision_type, 'hospital', NEW.decided_at, 'queued_v2'
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.whatsapp_notifications (
      authorization_request_id, phone_number, notification_type,
      recipient_type, decision_at, status
    ) VALUES (
      NEW.id, NEW.patient_phone, decision_type, 'patient', NEW.decided_at, 'queued_v2'
    ) ON CONFLICT DO NOTHING;

    -- pg_net queues this request asynchronously. A delivery or worker failure
    -- cannot roll back the clinical decision or its durable outbox rows.
    BEGIN
      SELECT decrypted_secret
      INTO worker_secret
      FROM vault.decrypted_secrets
      WHERE name = 'medcode_whatsapp_worker_secret_20261004'
      LIMIT 1;

      IF NULLIF(BTRIM(worker_secret), '') IS NULL THEN
        RAISE EXCEPTION 'WhatsApp worker wake-up secret is unavailable';
      END IF;

      PERFORM net.http_post(
        url := 'https://optistuvyeiojlgmkdks.supabase.co/functions/v1/whatsapp-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-worker-secret', worker_secret
        ),
        body := '{"poll":true}'::jsonb
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'WhatsApp notification wake-up failed (SQLSTATE %); cron backstop remains active.', SQLSTATE;
    END;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
