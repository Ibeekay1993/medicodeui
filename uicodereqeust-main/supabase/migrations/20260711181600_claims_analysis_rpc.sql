CREATE OR REPLACE FUNCTION rpc_get_claims_analysis_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH claim_stats AS (
    SELECT 
      status,
      hospital_id,
      hospital_name,
      total_amount,
      created_at::date as claim_date
    FROM hospital_claims
  ),
  by_status AS (
    SELECT status, COUNT(*) as count, SUM(total_amount) as total_amount 
    FROM claim_stats 
    GROUP BY status
  ),
  by_hospital AS (
    SELECT hospital_id, hospital_name, COUNT(*) as count, SUM(total_amount) as total_amount 
    FROM claim_stats 
    GROUP BY hospital_id, hospital_name
  ),
  by_date AS (
    SELECT claim_date, COUNT(*) as count, SUM(total_amount) as total_amount 
    FROM claim_stats 
    GROUP BY claim_date
    ORDER BY claim_date DESC
    LIMIT 10
  )
  SELECT jsonb_build_object(
    'by_status', (SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb) FROM by_status s),
    'by_hospital', (SELECT COALESCE(jsonb_agg(row_to_json(h)), '[]'::jsonb) FROM by_hospital h),
    'by_date', (SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::jsonb) FROM by_date d)
  ) INTO result;
  
  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;
