-- =====================================================================
-- 20260627180000_secure_support_module_loopholes.sql
-- Description: Closes severe security loopholes in the support module RLS
-- =====================================================================

-- 1. SECURE SUPPORT MESSAGES UPDATES (Content Tampering)
-- The old policy "Support participants can update read state" allowed updating ANY column.
-- We add a trigger to enforce that ONLY read_by can be updated.
DROP POLICY IF EXISTS "Support participants can update read state" ON public.support_messages;

CREATE OR REPLACE FUNCTION public.prevent_support_message_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Prevent any changes to these columns. Only read_by can be updated.
  IF NEW.id <> OLD.id OR 
     NEW.conversation_id <> OLD.conversation_id OR 
     NEW.sender_id IS DISTINCT FROM OLD.sender_id OR 
     NEW.sender_role IS DISTINCT FROM OLD.sender_role OR 
     NEW.sender_name IS DISTINCT FROM OLD.sender_name OR 
     NEW.body IS DISTINCT FROM OLD.body OR 
     NEW.attachment_url IS DISTINCT FROM OLD.attachment_url OR 
     NEW.attachment_name IS DISTINCT FROM OLD.attachment_name OR
     NEW.created_at <> OLD.created_at THEN
     
     RAISE EXCEPTION 'Security Violation: Cannot modify immutable message fields. Only read state can be updated.';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_support_message_immutability ON public.support_messages;
CREATE TRIGGER enforce_support_message_immutability
  BEFORE UPDATE ON public.support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_support_message_tampering();

-- Re-add the policy for read_by updates, now protected by the trigger above
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

-- 2. SECURE SUPPORT MESSAGES INSERT (Role Spoofing)
-- Enforce that sender_role perfectly matches the user's verified role in user_roles
DROP POLICY IF EXISTS "Support participants can create messages" ON public.support_messages;
CREATE POLICY "Support participants can create messages"
  ON public.support_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      sender_role IS NULL 
      OR sender_role IN (SELECT role::text FROM public.user_roles WHERE user_id = auth.uid())
    )
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


-- 3. SECURE SUPPORT CONVERSATIONS UPDATE (Hijacking)
-- Hospitals should not be able to reassign tickets or change their status.
CREATE OR REPLACE FUNCTION public.prevent_support_conversation_hijacking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_internal boolean;
BEGIN
  -- Prevent ID reassignment by ANYONE
  IF NEW.hospital_id IS DISTINCT FROM OLD.hospital_id OR 
     NEW.hospital_user_id IS DISTINCT FROM OLD.hospital_user_id OR
     NEW.created_by IS DISTINCT FROM OLD.created_by THEN
     RAISE EXCEPTION 'Security Violation: Cannot reassign conversation ownership.';
  END IF;

  -- Only internal roles can change status
  IF NEW.status IS DISTINCT FROM OLD.status THEN
     is_internal := public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'claims');
     IF NOT is_internal THEN
        RAISE EXCEPTION 'Security Violation: Only administrative staff can change conversation status.';
     END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_support_conversation_security ON public.support_conversations;
CREATE TRIGGER enforce_support_conversation_security
  BEFORE UPDATE ON public.support_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_support_conversation_hijacking();
