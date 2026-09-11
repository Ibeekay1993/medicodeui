BEGIN;

CREATE OR REPLACE FUNCTION public.touch_support_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status text;
  actor_role text;
BEGIN
  SELECT status INTO current_status
  FROM public.support_conversations
  WHERE id = NEW.conversation_id;

  IF current_status IN ('closed', 'resolved') THEN
    RAISE EXCEPTION 'This conversation is closed. Please start a new message.';
  END IF;

  UPDATE public.support_conversations
  SET last_message = CASE WHEN NEW.is_internal THEN '[Internal note]' ELSE NEW.body END,
      last_message_at = NEW.created_at,
      updated_at = now(),
      auto_close_at = NEW.created_at + interval '3 hours',
      status = CASE
        WHEN status IN ('new', 'pending', 'reopened') THEN 'open'
        ELSE status
      END,
      first_response_at = CASE
        WHEN first_response_at IS NULL AND COALESCE(NEW.sender_role, '') <> 'hospital' THEN NEW.created_at
        ELSE first_response_at
      END
  WHERE id = NEW.conversation_id;

  -- WhatsApp customers have no auth.users row. Store their message without
  -- requiring an authenticated audit actor.
  IF NEW.sender_id IS NOT NULL THEN
    actor_role := COALESCE(NEW.sender_role, 'user');
    PERFORM public.write_audit_log(
      CASE WHEN NEW.is_internal THEN 'CHAT_INTERNAL_NOTE' ELSE 'CHAT_MESSAGE_SENT' END,
      'support_conversation',
      NEW.conversation_id::text,
      '{}'::jsonb,
      jsonb_build_object('message_id', NEW.id, 'sender_role', actor_role, 'body_preview', left(NEW.body, 120)),
      NULL,
      'info',
      jsonb_build_object('conversation_id', NEW.conversation_id, 'message_type', NEW.message_type),
      NEW.sender_id
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
