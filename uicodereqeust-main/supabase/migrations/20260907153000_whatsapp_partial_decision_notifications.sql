-- Send an automated hospital update for partial approvals as well as approvals
-- and rejections. The recipient remains the WhatsApp sender linked to the request.

CREATE OR REPLACE FUNCTION public.fn_enqueue_whatsapp_notification()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.status IS DISTINCT FROM NEW.status)
       AND (NEW.status IN ('approved', 'partially_approved', 'rejected')) THEN
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
$$ LANGUAGE plpgsql;
