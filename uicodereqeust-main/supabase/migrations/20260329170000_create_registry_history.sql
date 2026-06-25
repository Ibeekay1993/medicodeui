create table public.registry_history (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  date text,
  hospital_name text,
  patient_name text,
  policy_number text not null,
  authorization_code text,
  diagnosis text,
  treatment text,
  requesting_officer text,
  note text,
  status text,
  source text default 'sheet_history',
  raw_payload jsonb,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.registry_history enable row level security;

create index idx_registry_history_policy on public.registry_history(policy_number);
create index idx_registry_history_patient on public.registry_history(patient_name);
create index idx_registry_history_request_id on public.registry_history(request_id);
create index idx_registry_history_created_at on public.registry_history(created_at desc);

create policy "Authenticated users can read registry history"
  on public.registry_history for select
  to authenticated
  using (true);

create policy "Nurses can manage registry history"
  on public.registry_history for all
  to authenticated
  using (has_role(auth.uid(), 'nurse') or has_role(auth.uid(), 'admin'));
