-- Backstop: invoke whatsapp-worker every minute to drain queued/retry rows.
-- Requires pg_cron + pg_net. Both are usually enabled on Supabase projects.
select cron.schedule(
  'whatsapp-worker-poll',
  '* * * * *',   -- every minute
  $$
  select net.http_post(
    url := current_setting('app.functions_url') || '/whatsapp-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', current_setting('app.worker_secret', true)
    ),
    body := '{"poll":true}'::jsonb
  ) as request_id;
  $$
);