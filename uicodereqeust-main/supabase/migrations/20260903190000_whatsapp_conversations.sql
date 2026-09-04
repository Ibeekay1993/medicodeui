-- Migration: 20260903190000_whatsapp_conversations.sql
-- Create whatsapp_conversations table for persistent session & draft state per sender

create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  phone_number text unique not null,
  active_intent text,
  active_authorization_id uuid references public.authorization_requests(id) on delete set null,
  pending_data jsonb default '{}'::jsonb,
  last_patient_name text,
  last_policy_number text,
  last_message_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_whatsapp_conversations_phone on public.whatsapp_conversations(phone_number);
create index if not exists idx_whatsapp_conversations_last_msg on public.whatsapp_conversations(last_message_at desc);

alter table public.whatsapp_conversations enable row level security;

drop policy if exists "Service role can manage whatsapp conversations" on public.whatsapp_conversations;
create policy "Service role can manage whatsapp conversations"
  on public.whatsapp_conversations
  for all
  to service_role
  using (true)
  with check (true);
