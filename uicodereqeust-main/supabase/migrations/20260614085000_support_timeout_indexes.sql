BEGIN;

CREATE INDEX IF NOT EXISTS idx_support_conversations_last_message_at_id
  ON public.support_conversations(last_message_at DESC NULLS LAST, id);

CREATE INDEX IF NOT EXISTS idx_support_conversations_status_last_message_at
  ON public.support_conversations(status, last_message_at DESC NULLS LAST);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'support_conversations'
      AND column_name = 'ticket_type'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_support_conversations_ticket_type_last_message_at
      ON public.support_conversations(ticket_type, last_message_at DESC NULLS LAST);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'support_conversations'
      AND column_name = 'request_ticket_status'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_support_conversations_request_ticket_status_last_message_at
      ON public.support_conversations(request_ticket_status, last_message_at DESC NULLS LAST);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_support_messages_conversation_created_at_desc
  ON public.support_messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_authorization_requests_hospital_status_created_at
  ON public.authorization_requests(hospital_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hospital_claims_hospital_status_created_at
  ON public.hospital_claims(hospital_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_support_conversations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_support_conversations_updated_at_trigger ON public.support_conversations;
CREATE TRIGGER set_support_conversations_updated_at_trigger
BEFORE UPDATE ON public.support_conversations
FOR EACH ROW
EXECUTE FUNCTION public.set_support_conversations_updated_at();

COMMIT;
