-- Create a function to sanitize new authorization requests
CREATE OR REPLACE FUNCTION public.sanitize_authorization_request()
RETURNS TRIGGER AS $$
DECLARE
  calculated_total NUMERIC := 0;
  item JSONB;
  sanitized_items JSONB[] := ARRAY[]::JSONB[];
  item_amount NUMERIC;
BEGIN
  -- 1. Sanitize the status
  -- If a referral hospital is set, it MUST be pending_referral, else pending.
  IF NEW.referred_hospital_id IS NOT NULL THEN
    NEW.status := 'pending_referral';
  ELSE
    NEW.status := 'pending';
  END IF;

  -- 2. Recalculate amount per item and the total_amount
  IF NEW.approved_items IS NOT NULL AND jsonb_typeof(NEW.approved_items) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(NEW.approved_items)
    LOOP
      -- Calculate item_amount = unit_price * quantity
      item_amount := COALESCE((item->>'unit_price')::NUMERIC, 0) * COALESCE((item->>'quantity')::NUMERIC, 0);
      
      -- Update the item's amount field
      item := jsonb_set(item, '{amount}', to_jsonb(item_amount));
      
      -- Append to the new array
      sanitized_items := array_append(sanitized_items, item);
      
      -- Accumulate total
      calculated_total := calculated_total + item_amount;
    END LOOP;
    
    -- Replace the array with the sanitized one
    NEW.approved_items := to_jsonb(sanitized_items);
  ELSE
    NEW.approved_items := '[]'::jsonb;
    calculated_total := 0;
  END IF;

  -- Overwrite total_amount with our calculated total
  NEW.total_amount := calculated_total;

  -- 3. Ensure submitted_by cannot be spoofed
  NEW.submitted_by := auth.uid();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS tr_sanitize_authorization_request ON public.authorization_requests;

-- Create trigger on insert
CREATE TRIGGER tr_sanitize_authorization_request
BEFORE INSERT ON public.authorization_requests
FOR EACH ROW
WHEN (NEW.source = 'hospital_portal')
EXECUTE FUNCTION public.sanitize_authorization_request();
