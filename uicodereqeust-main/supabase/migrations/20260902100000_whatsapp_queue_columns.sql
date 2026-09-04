-- Extend whatsapp_messages for async queue + retry + deduplication audit
alter table public.whatsapp_messages
  add column if not exists attempts int not null default 0,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists last_error text,
  add column if not exists extracted jsonb,
  add column if not exists internal_request_id text,
  add column if not exists template_sent_at timestamptz,
  add column if not exists correlation_id uuid default gen_random_uuid();

-- Dedup helper: Meta sometimes redelivers the same wamid; message_id is already UNIQUE.
-- This index speeds queue scans by status + scheduled time.
create index if not exists idx_whatsapp_messages_queue
  on public.whatsapp_messages (status, next_attempt_at)
  where status in ('queued', 'processing', 'retry');

-- Audit trail for every state transition (idempotent writes by worker)
create table if not exists public.whatsapp_processing_log (
  id uuid primary key default gen_random_uuid(),
  message_id text not null,
  correlation_id uuid,
  stage text not null,        -- 'received' | 'gemini' | 'internal_api' | 'template_send'
  status text not null,      -- 'ok' | 'error' | 'skipped'
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_wpl_message_id on public.whatsapp_processing_log (message_id, created_at desc);

alter table public.whatsapp_processing_log enable row level security;
create policy "Service role can manage whatsapp processing log"
  on public.whatsapp_processing_log for all
  to service_role using (true) with check (true);