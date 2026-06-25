BEGIN;

CREATE TABLE IF NOT EXISTS public.support_ai_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.support_messages(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved BOOLEAN,
  escalate_to_human BOOLEAN NOT NULL DEFAULT false,
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_ai_feedback_conversation
  ON public.support_ai_feedback(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_ai_feedback_user
  ON public.support_ai_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_ai_feedback_escalation
  ON public.support_ai_feedback(escalate_to_human, created_at DESC);

ALTER TABLE public.support_ai_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can submit support AI feedback" ON public.support_ai_feedback;
CREATE POLICY "Users can submit support AI feedback"
  ON public.support_ai_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "Internal users can read support AI feedback" ON public.support_ai_feedback;
CREATE POLICY "Internal users can read support AI feedback"
  ON public.support_ai_feedback
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'nurse')
    OR public.has_role(auth.uid(), 'claims')
  );

GRANT SELECT, INSERT ON public.support_ai_feedback TO authenticated;

CREATE OR REPLACE FUNCTION public.send_ai_support_message(
  _conversation_id UUID,
  _body TEXT,
  _intent TEXT DEFAULT 'general'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_row public.user_roles%rowtype;
  message_row public.support_messages%rowtype;
BEGIN
  IF NULLIF(trim(COALESCE(_body, '')), '') IS NULL THEN
    RAISE EXCEPTION 'AI message body is required';
  END IF;

  SELECT * INTO role_row
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF role_row.user_id IS NULL THEN
    RAISE EXCEPTION 'Only authenticated platform users can use AI support';
  END IF;

  IF NOT public.assert_support_participant(_conversation_id, false) THEN
    RAISE EXCEPTION 'You do not have access to this conversation';
  END IF;

  INSERT INTO public.support_messages (
    conversation_id,
    sender_id,
    sender_role,
    sender_name,
    body,
    is_internal,
    message_type
  )
  VALUES (
    _conversation_id,
    NULL,
    'ai',
    'MedAuth AI Assistant',
    trim(_body),
    false,
    'ai_response'
  )
  RETURNING * INTO message_row;

  PERFORM public.write_audit_log(
    'AI_SUPPORT_MESSAGE_SENT',
    'support_message',
    message_row.id::text,
    '{}'::jsonb,
    jsonb_build_object('conversation_id', _conversation_id, 'intent', _intent),
    'AI assistant replied in support conversation',
    'info',
    jsonb_build_object('conversation_id', _conversation_id, 'message_id', message_row.id)
  );

  RETURN to_jsonb(message_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.log_ai_feedback(
  _conversation_id UUID,
  _message_id UUID DEFAULT NULL,
  _resolved BOOLEAN DEFAULT NULL,
  _escalate_to_human BOOLEAN DEFAULT false,
  _feedback TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_row public.user_roles%rowtype;
  feedback_row public.support_ai_feedback%rowtype;
BEGIN
  SELECT * INTO role_row
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF role_row.user_id IS NULL THEN
    RAISE EXCEPTION 'Only authenticated platform users can submit AI feedback';
  END IF;

  IF NOT public.assert_support_participant(_conversation_id, false) THEN
    RAISE EXCEPTION 'You do not have access to this conversation';
  END IF;

  INSERT INTO public.support_ai_feedback (
    conversation_id,
    message_id,
    user_id,
    resolved,
    escalate_to_human,
    feedback
  )
  VALUES (
    _conversation_id,
    _message_id,
    auth.uid(),
    _resolved,
    COALESCE(_escalate_to_human, false),
    NULLIF(trim(COALESCE(_feedback, '')), '')
  )
  RETURNING * INTO feedback_row;

  IF COALESCE(_escalate_to_human, false) THEN
    INSERT INTO public.support_messages (
      conversation_id,
      sender_id,
      sender_role,
      sender_name,
      body,
      is_internal,
      message_type
    )
    VALUES (
      _conversation_id,
      auth.uid(),
      role_row.role::text,
      COALESCE(role_row.full_name, (SELECT email FROM auth.users WHERE id = auth.uid()), role_row.role::text),
      'HUMAN SUPPORT REQUESTED: ' || COALESCE(NULLIF(trim(_feedback), ''), 'The hospital wants to speak with a support/human agent.'),
      false,
      'human_escalation'
    );
  END IF;

  PERFORM public.write_audit_log(
    'AI_SUPPORT_FEEDBACK_LOGGED',
    'support_ai_feedback',
    feedback_row.id::text,
    '{}'::jsonb,
    jsonb_build_object('conversation_id', _conversation_id, 'resolved', _resolved, 'escalate_to_human', _escalate_to_human),
    'Hospital submitted AI feedback or human escalation request',
    'info',
    jsonb_build_object('conversation_id', _conversation_id, 'message_id', _message_id)
  );

  RETURN jsonb_build_object('saved', true, 'escalated', COALESCE(_escalate_to_human, false));
END;
$$;

COMMIT;
