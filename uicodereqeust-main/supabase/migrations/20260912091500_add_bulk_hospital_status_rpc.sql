-- Add an atomic, admin-protected hospital status update for bulk actions.
-- The existing single-hospital RPC remains unchanged for individual actions.

CREATE OR REPLACE FUNCTION public.rpc_toggle_hospitals_status(
  p_hospital_ids UUID[],
  p_is_active BOOLEAN
)
RETURNS VOID AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- An empty array is a safe no-op; it must never become an unfiltered update.
  IF COALESCE(cardinality(p_hospital_ids), 0) = 0 THEN
    RETURN;
  END IF;

  UPDATE public.hospitals
  SET is_active = p_is_active,
      updated_at = NOW()
  WHERE id = ANY(p_hospital_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
