-- Add receipt columns to payment_batches table
ALTER TABLE public.payment_batches ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE public.payment_batches ADD COLUMN IF NOT EXISTS receipt_name TEXT;

-- Create storage bucket for payment receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for payment receipts
DROP POLICY IF EXISTS "Admins and Finance can manage receipts" ON storage.objects;
CREATE POLICY "Admins and Finance can manage receipts"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'payment-receipts' AND (
      public.has_role(auth.uid(), 'admin') OR
      public.has_role(auth.uid(), 'finance')
    )
  )
  WITH CHECK (
    bucket_id = 'payment-receipts' AND (
      public.has_role(auth.uid(), 'admin') OR
      public.has_role(auth.uid(), 'finance')
    )
  );

DROP POLICY IF EXISTS "Authenticated users can view receipts" ON storage.objects;
CREATE POLICY "Authenticated users can view receipts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payment-receipts'
  );
