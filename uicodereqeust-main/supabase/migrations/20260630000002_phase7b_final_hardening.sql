-- Migration: Phase 7b - Final remaining mutations secured
-- Covers: Hospital claim submission, authorization delete requests, support message read receipts

-- 1. Hospital submits a claim (hospital role only)
CREATE OR REPLACE FUNCTION rpc_submit_hospital_claim(p_claim_id UUID)
RETURNS VOID AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.user_roles WHERE user_roles.user_id = auth.uid();
  IF v_role NOT IN ('hospital') THEN
    RAISE EXCEPTION 'Unauthorized: Only hospital users can submit claims.';
  END IF;
  UPDATE public.hospital_claims
  SET status = 'submitted', updated_at = NOW()
  WHERE id = p_claim_id
    AND hospital_id IN (
      SELECT hospital_id FROM public.user_roles WHERE user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Request deletion approval (authenticated non-admin users)
CREATE OR REPLACE FUNCTION rpc_request_deletion_approval(
  p_request_id UUID,
  p_reason TEXT
)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE public.authorization_requests
  SET deletion_status = 'awaiting_admin_approval',
      deletion_requested_at = NOW(),
      deletion_requested_by = auth.uid(),
      deletion_reason = p_reason
  WHERE id = p_request_id
    AND (deletion_status IS NULL OR deletion_status != 'awaiting_admin_approval');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Mark support message as read (authenticated users)
CREATE OR REPLACE FUNCTION rpc_mark_message_read(p_message_id UUID, p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE public.support_messages
  SET read_by = array_append(
    COALESCE(read_by, ARRAY[]::UUID[]),
    p_user_id
  )
  WHERE id = p_message_id
    AND NOT (p_user_id = ANY(COALESCE(read_by, ARRAY[]::UUID[])));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
