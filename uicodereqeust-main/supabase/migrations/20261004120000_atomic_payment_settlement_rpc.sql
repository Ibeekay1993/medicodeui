-- Settle the batch and all linked claims in one transaction. The claim trigger
-- requires the batch to be paid before claims can transition to paid; an error
-- in either update rolls both updates back together.
CREATE OR REPLACE FUNCTION public.settle_payment_batch_transactional(
  p_batch_id uuid,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'finance'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Finance or Super Admin access required.';
  END IF;

  IF p_payload->>'status' IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'This operation only supports payment batch settlement.';
  END IF;

  PERFORM 1
  FROM public.payment_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment batch not found.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.hospital_claims WHERE payment_batch_id = p_batch_id
  ) THEN
    RAISE EXCEPTION 'No claims are linked to this payment batch.';
  END IF;

  UPDATE public.payment_batches
  SET status = 'paid',
      paid_at = CASE WHEN p_payload ? 'paid_at' THEN (p_payload->>'paid_at')::timestamptz ELSE paid_at END,
      bank_reference = CASE WHEN p_payload ? 'bank_reference' THEN p_payload->>'bank_reference' ELSE bank_reference END,
      paid_by = CASE WHEN p_payload ? 'paid_by' THEN (p_payload->>'paid_by')::uuid ELSE paid_by END,
      receipt_url = CASE WHEN p_payload ? 'receipt_url' THEN p_payload->>'receipt_url' ELSE receipt_url END,
      receipt_name = CASE WHEN p_payload ? 'receipt_name' THEN p_payload->>'receipt_name' ELSE receipt_name END
  WHERE id = p_batch_id;

  UPDATE public.hospital_claims
  SET payment_status = 'paid'
  WHERE payment_batch_id = p_batch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_payment_batch_transactional(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_payment_batch_transactional(uuid, jsonb) TO authenticated, service_role;
