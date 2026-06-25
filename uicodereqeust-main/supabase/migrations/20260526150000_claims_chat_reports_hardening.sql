BEGIN;

ALTER TABLE public.hospital_claims
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_note TEXT,
  ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contest_submitted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.claim_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES public.hospital_claims(id) ON DELETE CASCADE,
  claim_number TEXT,
  previous_status TEXT,
  new_status TEXT,
  previous_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name TEXT,
  actor_role TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claim_status_history_claim_id
  ON public.claim_status_history(claim_id, created_at DESC);

ALTER TABLE public.claim_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read claim status history" ON public.claim_status_history;
CREATE POLICY "Staff can read claim status history"
  ON public.claim_status_history
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'claims')
    OR public.has_role(auth.uid(), 'nurse')
    OR EXISTS (
      SELECT 1
      FROM public.hospitals h
      JOIN public.hospital_claims hc ON hc.hospital_id = h.id
      WHERE hc.id = claim_status_history.claim_id
        AND h.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.record_claim_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor jsonb;
BEGIN
  IF TG_OP = 'INSERT'
     OR OLD.status IS DISTINCT FROM NEW.status
     OR OLD.payment_reference IS DISTINCT FROM NEW.payment_reference
     OR OLD.payment_note IS DISTINCT FROM NEW.payment_note
     OR OLD.contest_note IS DISTINCT FROM NEW.contest_note THEN
    actor := public.actor_snapshot(auth.uid());

    INSERT INTO public.claim_status_history (
      claim_id,
      claim_number,
      previous_status,
      new_status,
      previous_values,
      new_values,
      actor_user_id,
      actor_name,
      actor_role,
      reason
    )
    VALUES (
      NEW.id,
      NEW.claim_number,
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
      NEW.status,
      CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE jsonb_build_object(
        'status', OLD.status,
        'approved_amount', OLD.approved_amount,
        'declined_amount', OLD.declined_amount,
        'payment_reference', OLD.payment_reference,
        'contest_note', OLD.contest_note
      ) END,
      jsonb_build_object(
        'status', NEW.status,
        'approved_amount', NEW.approved_amount,
        'declined_amount', NEW.declined_amount,
        'payment_reference', NEW.payment_reference,
        'payment_note', NEW.payment_note,
        'contest_note', NEW.contest_note,
        'under_contest_amount', NEW.under_contest_amount
      ),
      NULLIF(actor->>'actor_user_id', '')::uuid,
      actor->>'actor_name',
      actor->>'actor_role',
      COALESCE(NEW.payment_note, NEW.contest_note, NEW.audit_note, NEW.notes)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_claim_status_history_trigger ON public.hospital_claims;
CREATE TRIGGER record_claim_status_history_trigger
AFTER INSERT OR UPDATE ON public.hospital_claims
FOR EACH ROW
EXECUTE FUNCTION public.record_claim_status_history();

CREATE OR REPLACE FUNCTION public.audit_support_conversation_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to
    OR OLD.priority IS DISTINCT FROM NEW.priority
    OR OLD.department IS DISTINCT FROM NEW.department
  ) THEN
    PERFORM public.write_audit_log(
      CASE
        WHEN OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN 'CHAT_TICKET_ASSIGNED'
        WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'CHAT_TICKET_STATUS_CHANGED'
        ELSE 'CHAT_TICKET_UPDATED'
      END,
      'support_conversation',
      COALESCE(NEW.ticket_number, NEW.id::text),
      jsonb_build_object('status', OLD.status, 'assigned_to', OLD.assigned_to, 'priority', OLD.priority, 'department', OLD.department),
      jsonb_build_object('status', NEW.status, 'assigned_to', NEW.assigned_to, 'priority', NEW.priority, 'department', NEW.department),
      NEW.closed_reason,
      'info',
      jsonb_build_object('conversation_id', NEW.id, 'ticket_number', NEW.ticket_number),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_support_conversation_change_trigger ON public.support_conversations;
CREATE TRIGGER audit_support_conversation_change_trigger
AFTER UPDATE ON public.support_conversations
FOR EACH ROW
EXECUTE FUNCTION public.audit_support_conversation_change();

CREATE OR REPLACE FUNCTION public.close_inactive_support_conversations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  closed_count integer;
BEGIN
  WITH closed AS (
    UPDATE public.support_conversations
    SET status = 'closed',
        closed_at = now(),
        closed_reason = 'Automatically closed after 3 hours of inactivity',
        updated_at = now(),
        last_message = 'Auto-closed due to inactivity'
    WHERE status NOT IN ('closed', 'resolved')
      AND COALESCE(auto_close_at, last_message_at + interval '3 hours', created_at + interval '3 hours') <= now()
    RETURNING id, ticket_number
  )
  SELECT count(*) INTO closed_count FROM closed;

  RETURN closed_count;
END;
$$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'close-inactive-support-conversations') THEN
      PERFORM cron.schedule(
        'close-inactive-support-conversations',
        '*/5 * * * *',
        'select public.close_inactive_support_conversations();'
      );
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END $$;

DROP FUNCTION IF EXISTS public.claims_report_export(text, uuid, timestamptz, timestamptz);

CREATE FUNCTION public.claims_report_export(
  _status text DEFAULT 'all',
  _hospital_id uuid DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  claim_id uuid,
  claim_number text,
  created_at timestamptz,
  submitted_at timestamptz,
  hospital_name text,
  patient_name text,
  policy_number text,
  auth_code text,
  status text,
  original_amount numeric,
  approved_amount numeric,
  declined_amount numeric,
  total_amount numeric,
  audit_note text,
  payment_note text,
  payment_reference text,
  paid_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    hc.id,
    hc.claim_number,
    hc.created_at,
    hc.submitted_at,
    hc.hospital_name,
    hc.patient_name,
    hc.policy_number,
    hc.auth_code,
    hc.status,
    COALESCE(hc.original_amount, hc.total_amount),
    COALESCE(hc.approved_amount, CASE WHEN lower(hc.status) IN ('approved', 'paid') THEN hc.total_amount ELSE 0 END),
    COALESCE(hc.declined_amount, 0),
    hc.total_amount,
    hc.audit_note,
    hc.payment_note,
    hc.payment_reference,
    hc.paid_at
  FROM public.hospital_claims hc
  WHERE (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'claims')
    )
    AND (_status = 'all' OR lower(hc.status) = lower(_status))
    AND (_hospital_id IS NULL OR hc.hospital_id = _hospital_id)
    AND (_from IS NULL OR hc.created_at >= _from)
    AND (_to IS NULL OR hc.created_at <= _to)
  ORDER BY hc.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.claims_reconciliation_report(
  _hospital_id uuid DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  hospital_name text,
  patient_name text,
  policy_number text,
  auth_code text,
  authorized_amount numeric,
  claim_number text,
  claimed_amount numeric,
  approved_amount numeric,
  paid_amount numeric,
  outstanding_balance numeric,
  claim_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(hc.hospital_name, ar.hospital_name) AS hospital_name,
    COALESCE(hc.patient_name, ar.patient_name) AS patient_name,
    COALESCE(hc.policy_number, ar.policy_number) AS policy_number,
    COALESCE(hc.auth_code, ar.authorization_code) AS auth_code,
    0::numeric AS authorized_amount,
    hc.claim_number,
    COALESCE(hc.original_amount, hc.total_amount, 0)::numeric AS claimed_amount,
    COALESCE(hc.approved_amount, CASE WHEN lower(hc.status) IN ('approved', 'paid') THEN hc.total_amount ELSE 0 END, 0)::numeric AS approved_amount,
    CASE WHEN lower(COALESCE(hc.status, '')) = 'paid'
      THEN COALESCE(hc.approved_amount, hc.total_amount, 0)::numeric
      ELSE 0::numeric
    END AS paid_amount,
    GREATEST(
      COALESCE(hc.approved_amount, CASE WHEN lower(COALESCE(hc.status, '')) IN ('approved', 'paid') THEN hc.total_amount ELSE 0 END, 0)::numeric
      - CASE WHEN lower(COALESCE(hc.status, '')) = 'paid' THEN COALESCE(hc.approved_amount, hc.total_amount, 0)::numeric ELSE 0::numeric END,
      0::numeric
    ) AS outstanding_balance,
    hc.status AS claim_status
  FROM public.hospital_claims hc
  LEFT JOIN public.authorization_requests ar
    ON ar.id = hc.request_id
    OR lower(ar.authorization_code) = lower(hc.auth_code)
    OR (ar.policy_number = hc.policy_number AND ar.patient_name = hc.patient_name)
  WHERE (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'claims')
    )
    AND (_hospital_id IS NULL OR hc.hospital_id = _hospital_id)
    AND (_from IS NULL OR hc.created_at >= _from)
    AND (_to IS NULL OR hc.created_at <= _to)
  ORDER BY COALESCE(hc.hospital_name, ar.hospital_name), hc.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.close_inactive_support_conversations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claims_report_export(text, uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claims_reconciliation_report(uuid, timestamptz, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
