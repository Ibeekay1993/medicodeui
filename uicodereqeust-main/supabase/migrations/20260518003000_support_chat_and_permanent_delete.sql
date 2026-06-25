INSERT INTO storage.buckets (id, name, public)
VALUES ('support-attachments', 'support-attachments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Support participants manage attachments" ON storage.objects;
CREATE POLICY "Support participants manage attachments"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'nurse')
      OR public.has_role(auth.uid(), 'hospital')
      OR public.has_role(auth.uid(), 'claims')
    )
  )
  WITH CHECK (
    bucket_id = 'support-attachments'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'nurse')
      OR public.has_role(auth.uid(), 'hospital')
      OR public.has_role(auth.uid(), 'claims')
    )
  );

CREATE TABLE IF NOT EXISTS public.support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL DEFAULT 'Support conversation',
  hospital_id uuid REFERENCES public.hospitals(id) ON DELETE SET NULL,
  hospital_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  nurse_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed')),
  last_message text,
  last_message_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_role text,
  sender_name text,
  body text NOT NULL,
  attachment_url text,
  attachment_name text,
  read_by uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_conversations_last_message
  ON public.support_conversations(last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_support_messages_conversation
  ON public.support_messages(conversation_id, created_at);

ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Support roles can read conversations" ON public.support_conversations;
CREATE POLICY "Support roles can read conversations"
  ON public.support_conversations
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'nurse')
    OR public.has_role(auth.uid(), 'claims')
    OR hospital_user_id = auth.uid()
    OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Users can create support conversations" ON public.support_conversations;
CREATE POLICY "Users can create support conversations"
  ON public.support_conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'nurse')
      OR public.has_role(auth.uid(), 'hospital')
      OR public.has_role(auth.uid(), 'claims')
    )
  );

DROP POLICY IF EXISTS "Support roles can update conversations" ON public.support_conversations;
CREATE POLICY "Support roles can update conversations"
  ON public.support_conversations
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'nurse')
    OR public.has_role(auth.uid(), 'claims')
    OR hospital_user_id = auth.uid()
    OR created_by = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'nurse')
    OR public.has_role(auth.uid(), 'claims')
    OR hospital_user_id = auth.uid()
    OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Support participants can read messages" ON public.support_messages;
CREATE POLICY "Support participants can read messages"
  ON public.support_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.support_conversations sc
      WHERE sc.id = conversation_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'nurse')
          OR public.has_role(auth.uid(), 'claims')
          OR sc.hospital_user_id = auth.uid()
          OR sc.created_by = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "Support participants can create messages" ON public.support_messages;
CREATE POLICY "Support participants can create messages"
  ON public.support_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.support_conversations sc
      WHERE sc.id = conversation_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'nurse')
          OR public.has_role(auth.uid(), 'claims')
          OR sc.hospital_user_id = auth.uid()
          OR sc.created_by = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "Support participants can update read state" ON public.support_messages;
CREATE POLICY "Support participants can update read state"
  ON public.support_messages
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.support_conversations sc
      WHERE sc.id = conversation_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'nurse')
          OR public.has_role(auth.uid(), 'claims')
          OR sc.hospital_user_id = auth.uid()
          OR sc.created_by = auth.uid()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.support_conversations sc
      WHERE sc.id = conversation_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'nurse')
          OR public.has_role(auth.uid(), 'claims')
          OR sc.hospital_user_id = auth.uid()
          OR sc.created_by = auth.uid()
        )
    )
  );

CREATE OR REPLACE FUNCTION public.touch_support_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_conversations
  SET last_message = NEW.body,
      last_message_at = NEW.created_at,
      updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_messages_touch_conversation ON public.support_messages;
CREATE TRIGGER support_messages_touch_conversation
AFTER INSERT ON public.support_messages
FOR EACH ROW
EXECUTE FUNCTION public.touch_support_conversation();

CREATE OR REPLACE FUNCTION public.permanently_delete_authorization(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  auth_row public.authorization_requests%rowtype;
  deleted_claims integer := 0;
  deleted_lines integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can permanently delete authorizations';
  END IF;

  SELECT * INTO auth_row
  FROM public.authorization_requests
  WHERE id = _request_id;

  IF auth_row.id IS NULL THEN
    RAISE EXCEPTION 'Authorization request not found';
  END IF;

  WITH target_claims AS (
    SELECT id
    FROM public.hospital_claims
    WHERE request_id = _request_id
       OR auth_code = auth_row.authorization_code
       OR policy_number = auth_row.policy_number
  ),
  deleted_claim_lines AS (
    DELETE FROM public.hospital_claim_lines hcl
    USING target_claims tc
    WHERE hcl.claim_id = tc.id
    RETURNING hcl.id
  )
  SELECT count(*) INTO deleted_lines FROM deleted_claim_lines;

  WITH deleted_claim_rows AS (
    DELETE FROM public.hospital_claims
    WHERE request_id = _request_id
       OR auth_code = auth_row.authorization_code
       OR policy_number = auth_row.policy_number
    RETURNING id
  )
  SELECT count(*) INTO deleted_claims FROM deleted_claim_rows;

  DELETE FROM public.authorization_logs
  WHERE request_id = _request_id;

  DELETE FROM public.audit_logs
  WHERE details->>'request_id' = _request_id::text
     OR details->>'auth_code' = auth_row.authorization_code
     OR details->>'policy_number' = auth_row.policy_number;

  DELETE FROM public.authorization_requests
  WHERE id = _request_id;

  INSERT INTO public.audit_logs(action, user_id, details, severity)
  VALUES (
    'AUTHORIZATION_PERMANENT_DELETE',
    auth.uid(),
    jsonb_build_object(
      'request_id', _request_id,
      'authorization_code', auth_row.authorization_code,
      'policy_number', auth_row.policy_number,
      'patient_name', auth_row.patient_name,
      'deleted_claims', deleted_claims,
      'deleted_claim_lines', deleted_lines
    ),
    'critical'
  );

  RETURN jsonb_build_object(
    'deleted', true,
    'deleted_claims', deleted_claims,
    'deleted_claim_lines', deleted_lines
  );
END;
$$;
