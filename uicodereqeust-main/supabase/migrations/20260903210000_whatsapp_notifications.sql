-- 20260903210000_whatsapp_notifications.sql
-- Create notifications outbox for proactive WhatsApp updates

CREATE TABLE public.whatsapp_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    authorization_request_id UUID REFERENCES public.authorization_requests(id) ON DELETE CASCADE,
    phone_number TEXT,
    notification_type TEXT NOT NULL,
    message_body TEXT,
    status TEXT DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    sent_at TIMESTAMPTZ,
    UNIQUE (authorization_request_id, notification_type, status)
);

CREATE INDEX idx_whatsapp_notifications_status ON public.whatsapp_notifications(status);
CREATE INDEX idx_whatsapp_notifications_phone ON public.whatsapp_notifications(phone_number);

CREATE OR REPLACE FUNCTION public.fn_enqueue_whatsapp_notification()
RETURNS TRIGGER AS $$
BEGIN
    -- Only notify on transitions to 'approved' or 'rejected'
    IF (OLD.status IS DISTINCT FROM NEW.status) AND (NEW.status IN ('approved', 'rejected')) THEN
        INSERT INTO public.whatsapp_notifications (
            authorization_request_id,
            phone_number,
            notification_type,
            status
        )
        VALUES (
            NEW.id,
            (SELECT phone_number FROM public.whatsapp_messages WHERE authorization_request_id = NEW.id ORDER BY received_at ASC LIMIT 1),
            CASE WHEN NEW.status = 'approved' THEN 'APPROVAL' ELSE 'REJECTION' END,
            'pending'
        ) ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_whatsapp_notification_enqueue
AFTER UPDATE ON public.authorization_requests
FOR EACH ROW EXECUTE FUNCTION public.fn_enqueue_whatsapp_notification();
