-- Migration: Phase 7 Comprehensive Security Hardening
-- Description: Move remaining mutations across Claims, Payments, Hospitals, Support, and Announcements to RPCs.

-- 1. Update Claim Status (Claims Role / Admin)
CREATE OR REPLACE FUNCTION rpc_update_claim_status(p_claim_id UUID, p_status TEXT, p_details JSONB)
RETURNS VOID AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.user_roles WHERE user_roles.user_id = auth.uid();
  IF v_role NOT IN ('admin', 'claims') THEN
    RAISE EXCEPTION 'Unauthorized: Only admin or claims officers can update claim status.';
  END IF;

  UPDATE public.hospital_claims 
  SET status = p_status, 
      approved_amount = (p_details->>'approved_amount')::numeric,
      declined_amount = (p_details->>'declined_amount')::numeric,
      internal_notes = p_details->>'internal_notes',
      updated_at = NOW()
  WHERE id = p_claim_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Update Hospital Profile (Admin only)
CREATE OR REPLACE FUNCTION rpc_update_hospital_profile(p_hospital_id UUID, p_payload JSONB)
RETURNS VOID AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.hospitals 
  SET name = COALESCE(p_payload->>'name', name),
      email = COALESCE(p_payload->>'email', email),
      phone = COALESCE(p_payload->>'phone', phone),
      address = COALESCE(p_payload->>'address', address),
      bank_name = COALESCE(p_payload->>'bank_name', bank_name),
      account_number = COALESCE(p_payload->>'account_number', account_number),
      updated_at = NOW()
  WHERE id = p_hospital_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Toggle Hospital Status (Admin only)
CREATE OR REPLACE FUNCTION rpc_toggle_hospital_status(p_hospital_id UUID, p_is_active BOOLEAN)
RETURNS VOID AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.hospitals 
  SET is_active = p_is_active, updated_at = NOW() 
  WHERE id = p_hospital_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Link User to Hospital (Admin only)
CREATE OR REPLACE FUNCTION rpc_link_user_to_hospital(p_user_id UUID, p_hospital_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.user_roles 
  SET hospital_id = p_hospital_id 
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. Update Payment Batch (Finance / Admin)
CREATE OR REPLACE FUNCTION rpc_update_payment_batch(p_batch_id UUID, p_payload JSONB)
RETURNS VOID AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.user_roles WHERE user_roles.user_id = auth.uid();
  IF v_role NOT IN ('admin', 'finance') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.payment_batches 
  SET status = COALESCE(p_payload->>'status', status),
      payment_date = COALESCE((p_payload->>'payment_date')::date, payment_date),
      receipt_url = COALESCE(p_payload->>'receipt_url', receipt_url),
      updated_at = NOW()
  WHERE id = p_batch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. Update Claim Payment Status (Finance / Admin)
CREATE OR REPLACE FUNCTION rpc_update_claim_payment_status(p_claim_id UUID, p_status TEXT)
RETURNS VOID AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.user_roles WHERE user_roles.user_id = auth.uid();
  IF v_role NOT IN ('admin', 'finance') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.hospital_claims 
  SET payment_status = p_status, updated_at = NOW()
  WHERE id = p_claim_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 7. Remove Claim from Batch (Finance / Admin)
CREATE OR REPLACE FUNCTION rpc_remove_claim_from_batch(p_claim_id UUID)
RETURNS VOID AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.user_roles WHERE user_roles.user_id = auth.uid();
  IF v_role NOT IN ('admin', 'finance') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.hospital_claims 
  SET payment_batch_id = NULL, payment_status = 'awaiting_payment', updated_at = NOW()
  WHERE id = p_claim_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 8. Update Announcement (Admin only)
CREATE OR REPLACE FUNCTION rpc_update_announcement(p_announcement_id UUID, p_payload JSONB)
RETURNS VOID AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.hmo_announcements 
  SET title = COALESCE(p_payload->>'title', title),
      content = COALESCE(p_payload->>'content', content),
      priority = COALESCE(p_payload->>'priority', priority),
      is_active = COALESCE((p_payload->>'is_active')::boolean, is_active),
      updated_at = NOW()
  WHERE id = p_announcement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 9. Update Support Conversation Status
CREATE OR REPLACE FUNCTION rpc_update_support_conversation_status(p_conversation_id UUID, p_status TEXT)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.support_conversations 
  SET status = p_status, updated_at = NOW()
  WHERE id = p_conversation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
