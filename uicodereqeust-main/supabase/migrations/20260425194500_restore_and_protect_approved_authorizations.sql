-- Restore the missing Adewole Oluwaseun authorization again, then harden
-- authorization rows so approved codes cannot be silently downgraded or blanked.

begin;

do $$
declare
  v_row_count integer := 0;
  v_created_at timestamptz := timestamptz '2026-04-20 00:00:00+00';
  v_restored_request_id text := 'restored:2839557:RAG011007938BD:20260420:ADEWOLE_OLUWASEUN';
begin
  update public.authorization_requests
     set authorization_code = 'R/AG/011007938BD',
         status = 'approved',
         decision_reason = coalesce(nullif(decision_reason, ''), 'Restored from WhatsApp confirmation'),
         clinical_notes = coalesce(nullif(clinical_notes, ''), 'Restored from WhatsApp confirmation'),
         source = coalesce(nullif(source, ''), 'whatsapp'),
         request_id = coalesce(nullif(request_id, ''), v_restored_request_id),
         created_at = v_created_at,
         updated_at = v_created_at,
         decided_at = v_created_at
   where lower(btrim(coalesce(patient_name, ''))) = 'adewole oluwaseun'
     and regexp_replace(coalesce(policy_number, ''), '\s+', '', 'g') = '2839557'
     and lower(btrim(coalesce(hospital_name, ''))) = lower('University Health Service')
     and lower(btrim(coalesce(diagnosis, ''))) = lower('Good BP control')
     and lower(btrim(coalesce(treatment, ''))) = lower('Tab Nifedipine 20mg dlyX1/12')
     and (
       coalesce(nullif(authorization_code, ''), '') = ''
       or lower(btrim(coalesce(status, ''))) = 'pending'
     );

  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  if v_row_count = 0 then
    insert into public.authorization_requests (
      request_id,
      patient_name,
      policy_number,
      diagnosis,
      treatment,
      hospital_name,
      authorization_code,
      status,
      clinical_notes,
      decision_reason,
      source,
      created_at,
      updated_at,
      decided_at
    ) values (
      v_restored_request_id,
      'Adewole Oluwaseun',
      '2839557',
      'Good BP control',
      'Tab Nifedipine 20mg dlyX1/12',
      'University Health Service',
      'R/AG/011007938BD',
      'approved',
      'Restored from WhatsApp confirmation',
      'Restored from WhatsApp confirmation',
      'whatsapp',
      v_created_at,
      v_created_at,
      v_created_at
    )
    on conflict (request_id) do update set
      patient_name = excluded.patient_name,
      policy_number = excluded.policy_number,
      diagnosis = excluded.diagnosis,
      treatment = excluded.treatment,
      hospital_name = excluded.hospital_name,
      authorization_code = excluded.authorization_code,
      status = excluded.status,
      clinical_notes = excluded.clinical_notes,
      decision_reason = excluded.decision_reason,
      source = excluded.source,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      decided_at = excluded.decided_at;
  end if;
end $$;

create or replace function public.protect_approved_authorization_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(nullif(old.authorization_code, ''), '') <> '' then
    new.authorization_code := coalesce(nullif(new.authorization_code, ''), old.authorization_code);
  end if;

  if lower(coalesce(old.status, '')) = 'approved' and lower(coalesce(new.status, '')) = 'pending' then
    new.status := old.status;
    new.decided_at := coalesce(new.decided_at, old.decided_at);
    new.decision_reason := coalesce(nullif(new.decision_reason, ''), old.decision_reason);
    new.clinical_notes := coalesce(nullif(new.clinical_notes, ''), old.clinical_notes);
  end if;

  return new;
end;
$$;

drop trigger if exists protect_approved_authorization_requests_trigger on public.authorization_requests;

create trigger protect_approved_authorization_requests_trigger
before update on public.authorization_requests
for each row
execute function public.protect_approved_authorization_requests();

commit;
