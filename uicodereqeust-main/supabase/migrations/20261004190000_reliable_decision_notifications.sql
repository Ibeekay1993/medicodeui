-- Replace best-effort client sends with a durable, per-recipient decision outbox.
-- Legacy rows are retained for reconciliation and ignored by the versioned worker.

ALTER TABLE public.whatsapp_notifications
  ADD COLUMN IF NOT EXISTS recipient_type text NOT NULL DEFAULT 'hospital',
  ADD COLUMN IF NOT EXISTS decision_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_lease_owner text,
  ADD COLUMN IF NOT EXISTS processing_lease_expires_at timestamptz;

DO $$
DECLARE
  legacy_constraint text;
BEGIN
  SELECT conname INTO legacy_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.whatsapp_notifications'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) = 'UNIQUE (authorization_request_id, notification_type, status)'
  LIMIT 1;

  IF legacy_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.whatsapp_notifications DROP CONSTRAINT %I', legacy_constraint);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_notifications_decision_recipient
  ON public.whatsapp_notifications (
    authorization_request_id,
    notification_type,
    recipient_type,
    decision_at
  )
  WHERE decision_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_whatsapp_decision_notification(
  p_notification_id uuid,
  p_lease_owner text,
  p_lease_seconds integer DEFAULT 180
)
RETURNS SETOF public.whatsapp_notifications
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.whatsapp_notifications AS n
  SET status = 'processing_v2',
      attempts = COALESCE(n.attempts, 0) + 1,
      processing_lease_owner = p_lease_owner,
      processing_lease_expires_at = now() + make_interval(secs => GREATEST(30, LEAST(p_lease_seconds, 600)))
  WHERE n.id = p_notification_id
    AND COALESCE(n.attempts, 0) < 5
    AND (
      n.status IN ('queued_v2', 'retry_v2')
      OR (n.status = 'processing_v2' AND n.processing_lease_expires_at < now())
    )
  RETURNING n.*;
$$;

REVOKE ALL ON FUNCTION public.claim_whatsapp_decision_notification(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_decision_notification(uuid, text, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.fn_enqueue_whatsapp_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  decision_type text;
  hospital_phone text;
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
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_notification_enqueue ON public.authorization_requests;
CREATE TRIGGER trg_whatsapp_notification_enqueue
AFTER UPDATE OF status ON public.authorization_requests
FOR EACH ROW
EXECUTE FUNCTION public.fn_enqueue_whatsapp_notification();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'authorization_requests'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.authorization_requests;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'medcode_whatsapp_worker_secret_20261004'
      AND NULLIF(BTRIM(decrypted_secret), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Configure the versioned WhatsApp worker secret in Supabase Vault and Functions before applying this migration.';
  END IF;
  PERFORM cron.unschedule('whatsapp-worker-poll');
END;
$$;

SELECT cron.schedule(
  'whatsapp-worker-poll',
  '* * * * *',
  $job$
    SELECT net.http_post(
      url := 'https://optistuvyeiojlgmkdks.supabase.co/functions/v1/whatsapp-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-worker-secret', (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'medcode_whatsapp_worker_secret_20261004'
          LIMIT 1
        )
      ),
      body := '{"poll":true}'::jsonb
    ) AS request_id;
  $job$
);
