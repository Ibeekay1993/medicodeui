update public.authorization_requests
set
  authorization_code = coalesce(
    nullif(authorization_code, ''),
    nullif((case
      when left(btrim(coalesce(whatsapp_raw_message, '')), 1) = '{' then (whatsapp_raw_message::jsonb ->> 'code')
      else null
    end), ''),
    nullif((case
      when left(btrim(coalesce(whatsapp_raw_message, '')), 1) = '{' then (whatsapp_raw_message::jsonb ->> 'authorization_code')
      else null
    end), ''),
    authorization_code
  ),
  status = case
    when lower(coalesce((case when left(btrim(coalesce(whatsapp_raw_message, '')), 1) = '{' then whatsapp_raw_message::jsonb ->> 'status' end), status)) like '%defer%' then 'deferred'
    when lower(coalesce((case when left(btrim(coalesce(whatsapp_raw_message, '')), 1) = '{' then whatsapp_raw_message::jsonb ->> 'status' end), status)) like '%declin%' then 'rejected'
    when lower(coalesce((case when left(btrim(coalesce(whatsapp_raw_message, '')), 1) = '{' then whatsapp_raw_message::jsonb ->> 'status' end), status)) like '%reject%' then 'rejected'
    when lower(coalesce((case when left(btrim(coalesce(whatsapp_raw_message, '')), 1) = '{' then whatsapp_raw_message::jsonb ->> 'status' end), status)) like '%code received%' then 'approved'
    when coalesce(nullif(authorization_code, ''), nullif((case when left(btrim(coalesce(whatsapp_raw_message, '')), 1) = '{' then whatsapp_raw_message::jsonb ->> 'code' end), ''), nullif((case when left(btrim(coalesce(whatsapp_raw_message, '')), 1) = '{' then whatsapp_raw_message::jsonb ->> 'authorization_code' end), '')) is not null then 'approved'
    else status
  end,
  created_at = coalesce(
    case
      when left(btrim(coalesce(whatsapp_raw_message, '')), 1) = '{' and nullif((whatsapp_raw_message::jsonb ->> 'date'), '') is not null then
        case
          when length(split_part(whatsapp_raw_message::jsonb ->> 'date', '/', 3)) = 2 then to_date(whatsapp_raw_message::jsonb ->> 'date', 'DD/MM/YY')::timestamptz
          else to_date(whatsapp_raw_message::jsonb ->> 'date', 'DD/MM/YYYY')::timestamptz
        end
    end,
    created_at
  ),
  updated_at = coalesce(
    case
      when left(btrim(coalesce(whatsapp_raw_message, '')), 1) = '{' and nullif((whatsapp_raw_message::jsonb ->> 'date'), '') is not null then
        case
          when length(split_part(whatsapp_raw_message::jsonb ->> 'date', '/', 3)) = 2 then to_date(whatsapp_raw_message::jsonb ->> 'date', 'DD/MM/YY')::timestamptz
          else to_date(whatsapp_raw_message::jsonb ->> 'date', 'DD/MM/YYYY')::timestamptz
        end
    end,
    updated_at
  ),
  decided_at = coalesce(
    case
      when left(btrim(coalesce(whatsapp_raw_message, '')), 1) = '{' and nullif((whatsapp_raw_message::jsonb ->> 'date'), '') is not null then
        case
          when length(split_part(whatsapp_raw_message::jsonb ->> 'date', '/', 3)) = 2 then to_date(whatsapp_raw_message::jsonb ->> 'date', 'DD/MM/YY')::timestamptz
          else to_date(whatsapp_raw_message::jsonb ->> 'date', 'DD/MM/YYYY')::timestamptz
        end
    end,
    decided_at
  ),
  decision_reason = coalesce(nullif(decision_reason, ''), nullif((case when left(btrim(coalesce(whatsapp_raw_message, '')), 1) = '{' then whatsapp_raw_message::jsonb ->> 'note' end), '')),
  clinical_notes = coalesce(nullif(clinical_notes, ''), nullif((case when left(btrim(coalesce(whatsapp_raw_message, '')), 1) = '{' then whatsapp_raw_message::jsonb ->> 'note' end), ''))
where source = 'sheet_history';
