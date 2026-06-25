-- Create a database sequence for concurrent-safe batch reference generation
CREATE SEQUENCE IF NOT EXISTS payment_batch_seq START 1;

-- Function to generate the next batch reference safely (locked via sequence)
CREATE OR REPLACE FUNCTION public.generate_batch_reference()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_val BIGINT;
  month_label TEXT;
BEGIN
  SELECT nextval('payment_batch_seq') INTO next_val;
  month_label := TO_CHAR(NOW(), 'MON');
  RETURN 'PAY-' || month_label || '-' || LPAD(CAST(next_val AS TEXT), 3, '0');
END;
$$;