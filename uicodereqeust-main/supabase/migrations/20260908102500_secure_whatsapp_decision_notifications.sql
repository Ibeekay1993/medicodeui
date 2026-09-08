-- Only finalized, authorized decisions may enqueue automated WhatsApp messages.

CREATE OR REPLACE FUNCTION public.protect_authorization_decision_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('approved', 'partially_approved', 'rejected')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT (
      public.has_role(auth.uid(), 'nurse')
      OR public.has_role(auth.uid(), 'admin')
    ) THEN
      RAISE EXCEPTION 'Only authorized clinical staff can finalize an authorization decision';
    END IF;

    IF NEW.decided_at IS NULL OR NEW.decided_by IS NULL THEN
      RAISE EXCEPTION 'A decision timestamp and decision user are required';
    END IF;

    IF NEW.status IN ('approved', 'partially_approved')
       AND (
         NEW.approved_by IS NULL
         OR coalesce(nullif(trim(NEW.authorization_code), ''), '') = ''
       ) THEN
      RAISE EXCEPTION 'Approved decisions require an approver and authorization code';
    END IF;

    IF NEW.status = 'rejected'
       AND coalesce(nullif(trim(NEW.decision_reason), ''), '') = '' THEN
      RAISE EXCEPTION 'Rejected decisions require a decision reason';
    END IF;
  END IF;

  IF OLD.status IN ('approved', 'partially_approved', 'rejected')
     AND NEW.status NOT IN ('approved', 'partially_approved', 'rejected', 'paid') THEN
    RAISE EXCEPTION 'A finalized authorization decision cannot be reverted to a non-final status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_authorization_decision_transition
ON public.authorization_requests;

CREATE TRIGGER trg_protect_authorization_decision_transition
BEFORE UPDATE OF status ON public.authorization_requests
FOR EACH ROW
EXECUTE FUNCTION public.protect_authorization_decision_transition();

CREATE OR REPLACE FUNCTION public.fn_enqueue_whatsapp_notification()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.status IN ('approved', 'partially_approved', 'rejected')
     AND NEW.decided_at IS NOT NULL
     AND NEW.decided_by IS NOT NULL
     AND (
       NEW.status = 'rejected'
       OR (
         NEW.approved_by IS NOT NULL
         AND coalesce(nullif(trim(NEW.authorization_code), ''), '') <> ''
       )
     ) THEN
    INSERT INTO public.whatsapp_notifications (
      authorization_request_id,
      phone_number,
      notification_type,
      status
    )
    VALUES (
      NEW.id,
      (
        SELECT phone_number
        FROM public.whatsapp_messages
        WHERE authorization_request_id = NEW.id
        ORDER BY received_at ASC
        LIMIT 1
      ),
      CASE
        WHEN NEW.status = 'approved' THEN 'APPROVAL'
        WHEN NEW.status = 'partially_approved' THEN 'PARTIAL_APPROVAL'
        ELSE 'REJECTION'
      END,
      'pending'
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
