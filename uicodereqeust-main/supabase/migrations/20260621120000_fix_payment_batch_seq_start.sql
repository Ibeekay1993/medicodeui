-- Dynamically find the maximum batch reference number suffix and restart the sequence from there to avoid unique constraint violations
DO $$
DECLARE
  max_val INT := 0;
  r RECORD;
  val_str TEXT;
  val_num INT;
BEGIN
  FOR r IN SELECT batch_reference FROM public.payment_batches LOOP
    BEGIN
      val_str := split_part(r.batch_reference, '-', 3);
      IF val_str ~ '^[0-9]+$' THEN
        val_num := val_str::INT;
        IF val_num > max_val THEN
          max_val := val_num;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Ignore any parse errors
    END;
  END LOOP;
  EXECUTE 'ALTER SEQUENCE public.payment_batch_seq RESTART WITH ' || (max_val + 1);
END;
$$;
