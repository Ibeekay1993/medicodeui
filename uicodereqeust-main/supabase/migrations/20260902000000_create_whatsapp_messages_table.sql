create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  message_id text unique not null,
  phone_number text not null,
  message_type text not null default 'text',
  message_body text,
  raw_message jsonb,
  status text not null default 'received',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status_updated_at timestamptz,
  phone_number_id text,
  authorization_request_id uuid references public.authorization_requests(id) on delete set null,
  error_message text,

  -- Indexes for queue processing and dedup
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_messages_status on public.whatsapp_messages(status);
create index if not exists idx_whatsapp_messages_phone on public.whatsapp_messages(phone_number);
create index if not exists idx_whatsapp_messages_received_at on public.whatsapp_messages(received_at);
create index if not exists idx_whatsapp_messages_created_at on public.whatsapp_messages(created_at);

-- RLS
alter table public.whatsapp_messages enable row level security;
create policy "Service role can manage all whatsapp messages"
  on public.whatsapp_messages
  for all
  to service_role
  using (true)
  with check (true);
