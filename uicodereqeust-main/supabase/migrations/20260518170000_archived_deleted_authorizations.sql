CREATE TABLE IF NOT EXISTS public.archived_deleted_authorizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_request_id UUID,
    patient_name TEXT,
    policy_number TEXT,
    diagnosis TEXT,
    treatment TEXT,
    total_amount NUMERIC,
    hospital_name TEXT,
    authorization_code TEXT,
    deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    deletion_reason TEXT,
    deleted_claims_count INTEGER DEFAULT 0,
    deleted_claim_lines_count INTEGER DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.archived_deleted_authorizations ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists
DROP POLICY IF EXISTS "Admins can view all archived deleted authorizations" ON public.archived_deleted_authorizations;

CREATE POLICY "Admins can view all archived deleted authorizations" ON public.archived_deleted_authorizations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
    );

-- Modify the delete function to archive first
CREATE OR REPLACE FUNCTION public.permanently_delete_authorization(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  auth_row public.authorization_requests%rowtype;
  deleted_claims integer := 0;
  deleted_lines integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can permanently delete authorizations';
  END IF;

  SELECT * INTO auth_row
  FROM public.authorization_requests
  WHERE id = _request_id;

  IF auth_row.id IS NULL THEN
    RAISE EXCEPTION 'Authorization request not found';
  END IF;

  -- Calculate claims to be deleted
  WITH target_claims AS (
    SELECT id
    FROM public.hospital_claims
    WHERE request_id = _request_id
       OR auth_code = auth_row.authorization_code
       OR policy_number = auth_row.policy_number
  ),
  deleted_claim_lines AS (
    DELETE FROM public.hospital_claim_lines hcl
    USING target_claims tc
    WHERE hcl.claim_id = tc.id
    RETURNING hcl.id
  )
  SELECT count(*) INTO deleted_lines FROM deleted_claim_lines;

  WITH deleted_claim_rows AS (
    DELETE FROM public.hospital_claims
    WHERE request_id = _request_id
       OR auth_code = auth_row.authorization_code
       OR policy_number = auth_row.policy_number
    RETURNING id
  )
  SELECT count(*) INTO deleted_claims FROM deleted_claim_rows;

  DELETE FROM public.authorization_logs
  WHERE request_id = _request_id;

  DELETE FROM public.audit_logs
  WHERE details->>'request_id' = _request_id::text
     OR details->>'auth_code' = auth_row.authorization_code
     OR details->>'policy_number' = auth_row.policy_number;

  -- ── ARCHIVE THE DELETED RECORD FOR COMPLIANCE ──
  INSERT INTO public.archived_deleted_authorizations (
    original_request_id,
    patient_name,
    policy_number,
    diagnosis,
    treatment,
    total_amount,
    hospital_name,
    authorization_code,
    deleted_by,
    deletion_reason,
    deleted_claims_count,
    deleted_claim_lines_count
  ) VALUES (
    _request_id,
    auth_row.patient_name,
    auth_row.policy_number,
    auth_row.diagnosis,
    auth_row.treatment,
    auth_row.total_amount,
    auth_row.hospital_name,
    auth_row.authorization_code,
    auth.uid(),
    auth_row.deletion_reason,
    deleted_claims,
    deleted_lines
  );

  DELETE FROM public.authorization_requests
  WHERE id = _request_id;

  INSERT INTO public.audit_logs(action, user_id, details, severity)
  VALUES (
    'AUTHORIZATION_PERMANENT_DELETE',
    auth.uid(),
    jsonb_build_object(
      'request_id', _request_id,
      'authorization_code', auth_row.authorization_code,
      'policy_number', auth_row.policy_number,
      'patient_name', auth_row.patient_name,
      'deleted_claims', deleted_claims,
      'deleted_claim_lines', deleted_lines
    ),
    'critical'
  );

  RETURN jsonb_build_object(
    'deleted', true,
    'deleted_claims', deleted_claims,
    'deleted_claim_lines', deleted_lines
  );
END;
$$;
