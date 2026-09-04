-- Migration: 20260903200000_whatsapp_queue_cleanup.sql
-- Auto-cleanup procedure for whatsapp_messages queue and processing logs

create or replace function public.cleanup_whatsapp_queue()
returns void
language plpgsql
security definer
as $$
begin
  -- Delete completed non-authorization messages older than 7 days
  delete from public.whatsapp_messages
  where status = 'completed'
    and authorization_request_id is null
    and created_at < (now() - interval '7 days');

  -- Delete failed/retry messages older than 14 days
  delete from public.whatsapp_messages
  where status in ('failed', 'retry')
    and created_at < (now() - interval '14 days');

  -- Clean up processing logs older than 14 days
  delete from public.whatsapp_processing_log
  where created_at < (now() - interval '14 days');
end;
$$;
