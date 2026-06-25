ALTER TABLE public.authorization_requests
  ADD COLUMN IF NOT EXISTS previous_authorization_code text,
  ADD COLUMN IF NOT EXISTS approval_code_invalidated_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_code_invalidated_reason text;

CREATE OR REPLACE FUNCTION public.freeze_authorization_awaiting_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.deletion_status, 'none') = 'awaiting_admin_approval'
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Request is pending deletion and cannot be modified.';
  END IF;

  IF COALESCE(NEW.deletion_status, 'none') = 'awaiting_admin_approval'
     AND COALESCE(OLD.deletion_status, 'none') IS DISTINCT FROM COALESCE(NEW.deletion_status, 'none') THEN
    NEW.previous_authorization_code := COALESCE(NULLIF(OLD.authorization_code, ''), NULLIF(NEW.authorization_code, ''), NEW.previous_authorization_code);
    NEW.authorization_code := NULL;
    NEW.approval_code_invalidated_at := now();
    NEW.approval_code_invalidated_reason := 'Request entered awaiting deletion approval status';
    NEW.claim_status := 'rejected';

    PERFORM public.write_audit_log(
      'AUTHORIZATION_CODE_REVOKED_FOR_DELETE_REQUEST',
      'authorization_request',
      NEW.id::text,
      jsonb_build_object(
        'deletion_status', OLD.deletion_status,
        'authorization_code', OLD.authorization_code,
        'claim_status', OLD.claim_status
      ),
      jsonb_build_object(
        'deletion_status', NEW.deletion_status,
        'authorization_code', NEW.authorization_code,
        'previous_authorization_code', NEW.previous_authorization_code,
        'claim_status', NEW.claim_status
      ),
      'Authorization code revoked because request is awaiting admin deletion approval',
      'critical',
      jsonb_build_object('request_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS freeze_authorization_awaiting_delete_trigger ON public.authorization_requests;
CREATE TRIGGER freeze_authorization_awaiting_delete_trigger
BEFORE UPDATE ON public.authorization_requests
FOR EACH ROW
EXECUTE FUNCTION public.freeze_authorization_awaiting_delete();
