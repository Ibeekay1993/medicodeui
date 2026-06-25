-- Transaction-Safe Batch Creation: Atomically create batch header and link claims in a single transaction block

CREATE OR REPLACE FUNCTION public.create_payment_batch_transactional(
  p_batch_reference TEXT,
  p_provider_id UUID,
  p_month TEXT,
  p_total_claims INT,
  p_total_amount DECIMAL(12,2),
  p_created_by UUID,
  p_claim_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_batch_id UUID;
BEGIN
  -- 1. Insert batch header
  INSERT INTO public.payment_batches (
    batch_reference,
    provider_id,
    month,
    total_claims,
    total_amount,
    status,
    created_by
  ) VALUES (
    p_batch_reference,
    p_provider_id,
    p_month,
    p_total_claims,
    p_total_amount,
    'draft',
    p_created_by
  ) RETURNING id INTO v_batch_id;

  -- 2. Update claim association and status
  UPDATE public.hospital_claims
     SET payment_batch_id = v_batch_id,
         payment_status = 'batched'
   WHERE id = ANY(p_claim_ids);

  RETURN v_batch_id;
END;
$$;
