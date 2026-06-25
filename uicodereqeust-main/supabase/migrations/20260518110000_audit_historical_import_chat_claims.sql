BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_name TEXT,
  ADD COLUMN IF NOT EXISTS actor_role TEXT,
  ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id TEXT,
  ADD COLUMN IF NOT EXISTS action_type TEXT,
  ADD COLUMN IF NOT EXISTS previous_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS new_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS device_info TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON public.audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);

CREATE OR REPLACE FUNCTION public.actor_snapshot(_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'actor_user_id', _user_id,
    'actor_name', COALESCE(h.name, ur.full_name, au.raw_user_meta_data->>'full_name', au.email, 'System'),
    'actor_role', COALESCE(ur.role::text, 'system')
  )
  FROM auth.users au
  LEFT JOIN public.user_roles ur ON ur.user_id = au.id
  LEFT JOIN public.hospitals h ON h.user_id = au.id
  WHERE au.id = _user_id
  UNION ALL
  SELECT jsonb_build_object('actor_user_id', NULL, 'actor_name', 'System', 'actor_role', 'system')
  WHERE _user_id IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.write_audit_log(
  _action text,
  _entity_type text DEFAULT NULL,
  _entity_id text DEFAULT NULL,
  _previous_values jsonb DEFAULT '{}'::jsonb,
  _new_values jsonb DEFAULT '{}'::jsonb,
  _reason text DEFAULT NULL,
  _severity text DEFAULT 'info',
  _details jsonb DEFAULT '{}'::jsonb,
  _actor_user_id uuid DEFAULT auth.uid(),
  _ip_address inet DEFAULT NULL,
  _device_info text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
<<import_run>>
DECLARE
  actor jsonb;
  inserted_id uuid;
BEGIN
  actor := public.actor_snapshot(_actor_user_id);

  INSERT INTO public.audit_logs (
    action,
    action_type,
    user_id,
    actor_user_id,
    actor_name,
    actor_role,
    entity_type,
    entity_id,
    previous_values,
    new_values,
    reason,
    details,
    severity,
    ip_address,
    device_info
  )
  VALUES (
    _action,
    _action,
    _actor_user_id,
    _actor_user_id,
    actor->>'actor_name',
    actor->>'actor_role',
    _entity_type,
    _entity_id,
    COALESCE(_previous_values, '{}'::jsonb),
    COALESCE(_new_values, '{}'::jsonb),
    _reason,
    COALESCE(_details, '{}'::jsonb) || actor,
    COALESCE(_severity, 'info'),
    _ip_address,
    _device_info
  )
  RETURNING id INTO inserted_id;

  RETURN inserted_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_authorization_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor jsonb;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    actor := public.actor_snapshot(auth.uid());

    INSERT INTO public.authorization_logs (request_id, action, performed_by, details)
    VALUES (
      NEW.id,
      'AUTHORIZATION_' || upper(replace(COALESCE(NEW.status, 'updated'), ' ', '_')),
      auth.uid(),
      jsonb_build_object(
        'actor_name', actor->>'actor_name',
        'actor_user_id', actor->>'actor_user_id',
        'actor_role', actor->>'actor_role',
        'ip', 'client-side',
        'device_info', COALESCE(NULLIF(current_setting('request.headers', true), '')::jsonb->>'user-agent', 'unknown'),
        'auth_code', NEW.authorization_code,
        'diagnosis', NEW.diagnosis,
        'previous_status', OLD.status,
        'new_status', NEW.status,
        'action', 'Authorization ' || initcap(COALESCE(NEW.status, 'updated')),
        'entity_type', 'authorization',
        'entity_id', COALESCE(NEW.authorization_code, NEW.request_id, NEW.id::text),
        'timestamp', now()
      )
    );

    PERFORM public.write_audit_log(
      'AUTHORIZATION_' || upper(replace(COALESCE(NEW.status, 'updated'), ' ', '_')),
      'authorization',
      COALESCE(NEW.authorization_code, NEW.request_id, NEW.id::text),
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status, 'authorization_code', NEW.authorization_code, 'diagnosis', NEW.diagnosis),
      NEW.decision_reason,
      CASE WHEN NEW.status IN ('rejected', 'declined') THEN 'warning' ELSE 'info' END,
      jsonb_build_object('request_id', NEW.id, 'auth_code', NEW.authorization_code, 'policy_number', NEW.policy_number),
      auth.uid(),
      NULL,
      COALESCE(NULLIF(current_setting('request.headers', true), '')::jsonb->>'user-agent', 'unknown')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_audit_log ON public.authorization_requests;
CREATE TRIGGER auto_audit_log
AFTER UPDATE ON public.authorization_requests
FOR EACH ROW
EXECUTE FUNCTION public.audit_authorization_status_change();

CREATE OR REPLACE FUNCTION public.audit_hospital_claim_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log(
      'CLAIM_CREATED',
      'claim',
      NEW.claim_number,
      '{}'::jsonb,
      to_jsonb(NEW),
      'Claim submitted or created',
      'info',
      jsonb_build_object('claim_id', NEW.id, 'auth_code', NEW.auth_code, 'policy_number', NEW.policy_number),
      NEW.created_by
    );
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status
     OR OLD.audit_items IS DISTINCT FROM NEW.audit_items
     OR OLD.audit_summary IS DISTINCT FROM NEW.audit_summary
     OR OLD.total_amount IS DISTINCT FROM NEW.total_amount
     OR OLD.approved_amount IS DISTINCT FROM NEW.approved_amount
     OR OLD.declined_amount IS DISTINCT FROM NEW.declined_amount THEN
    PERFORM public.write_audit_log(
      'CLAIM_' || upper(replace(COALESCE(NEW.status, 'updated'), ' ', '_')),
      'claim',
      NEW.claim_number,
      jsonb_build_object(
        'status', OLD.status,
        'total_amount', OLD.total_amount,
        'approved_amount', OLD.approved_amount,
        'declined_amount', OLD.declined_amount,
        'audit_items', OLD.audit_items
      ),
      jsonb_build_object(
        'status', NEW.status,
        'total_amount', NEW.total_amount,
        'approved_amount', NEW.approved_amount,
        'declined_amount', NEW.declined_amount,
        'audit_items', NEW.audit_items,
        'audit_summary', NEW.audit_summary
      ),
      NEW.notes,
      CASE WHEN NEW.status IN ('rejected', 'declined') THEN 'warning' ELSE 'info' END,
      jsonb_build_object('claim_id', NEW.id, 'auth_code', NEW.auth_code, 'policy_number', NEW.policy_number)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_hospital_claim_change_trigger ON public.hospital_claims;
CREATE TRIGGER audit_hospital_claim_change_trigger
AFTER INSERT OR UPDATE ON public.hospital_claims
FOR EACH ROW
EXECUTE FUNCTION public.audit_hospital_claim_change();

ALTER TABLE public.support_conversations
  ADD COLUMN IF NOT EXISTS ticket_number TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT 'General Support',
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_close_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_reason TEXT,
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.support_conversations
  DROP CONSTRAINT IF EXISTS support_conversations_status_check,
  ADD CONSTRAINT support_conversations_status_check
  CHECK (status IN ('new', 'open', 'pending_customer_response', 'waiting_internal_action', 'resolved', 'closed', 'reopened', 'pending'));

ALTER TABLE public.support_conversations
  DROP CONSTRAINT IF EXISTS support_conversations_priority_check,
  ADD CONSTRAINT support_conversations_priority_check
  CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'message';

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_conversations_ticket_number
  ON public.support_conversations(ticket_number);
CREATE INDEX IF NOT EXISTS idx_support_conversations_assigned_to
  ON public.support_conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_support_conversations_status_priority
  ON public.support_conversations(status, priority);
CREATE INDEX IF NOT EXISTS idx_support_conversations_auto_close
  ON public.support_conversations(auto_close_at)
  WHERE status NOT IN ('closed', 'resolved');

DROP POLICY IF EXISTS "Support participants can read messages" ON public.support_messages;
CREATE POLICY "Support participants can read messages"
  ON public.support_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.support_conversations sc
      WHERE sc.id = conversation_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'nurse')
          OR public.has_role(auth.uid(), 'claims')
          OR ((sc.hospital_user_id = auth.uid() OR sc.created_by = auth.uid()) AND is_internal = false)
        )
    )
  );

DROP POLICY IF EXISTS "Support participants can create messages" ON public.support_messages;
CREATE POLICY "Support participants can create messages"
  ON public.support_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.support_conversations sc
      WHERE sc.id = conversation_id
        AND sc.status NOT IN ('closed', 'resolved')
        AND (
          public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'nurse')
          OR public.has_role(auth.uid(), 'claims')
          OR ((sc.hospital_user_id = auth.uid() OR sc.created_by = auth.uid()) AND is_internal = false)
        )
    )
  );

CREATE OR REPLACE FUNCTION public.support_ticket_number()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'MSG-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 6));
$$;

CREATE OR REPLACE FUNCTION public.find_support_assignee(_department text DEFAULT NULL)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.user_id
  FROM public.user_roles ur
  LEFT JOIN public.support_conversations sc
    ON sc.assigned_to = ur.user_id
   AND sc.status NOT IN ('closed', 'resolved')
  WHERE ur.role::text IN (
    CASE WHEN lower(COALESCE(_department, '')) = 'nursing' THEN 'nurse' ELSE 'nurse' END,
    'nurse',
    'admin'
  )
  GROUP BY ur.user_id
  ORDER BY count(sc.id), min(ur.user_id::text)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.prepare_support_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.ticket_number := COALESCE(NEW.ticket_number, public.support_ticket_number());
  NEW.status := CASE WHEN NEW.status = 'pending' THEN 'new' ELSE COALESCE(NEW.status, 'new') END;
  NEW.priority := lower(COALESCE(NEW.priority, 'normal'));
  NEW.department := COALESCE(NULLIF(NEW.department, ''), 'General Support');
  NEW.auto_close_at := COALESCE(NEW.auto_close_at, now() + interval '3 hours');
  NEW.sla_due_at := COALESCE(NEW.sla_due_at, now() + CASE WHEN NEW.priority = 'urgent' THEN interval '30 minutes' WHEN NEW.priority = 'high' THEN interval '1 hour' ELSE interval '4 hours' END);

  IF NEW.assigned_to IS NULL THEN
    NEW.assigned_to := public.find_support_assignee(NEW.department);
    IF NEW.assigned_to IS NOT NULL THEN
      NEW.assigned_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prepare_support_conversation_trigger ON public.support_conversations;
CREATE TRIGGER prepare_support_conversation_trigger
BEFORE INSERT ON public.support_conversations
FOR EACH ROW
EXECUTE FUNCTION public.prepare_support_conversation();

CREATE OR REPLACE FUNCTION public.touch_support_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status text;
  actor_role text;
BEGIN
  SELECT status INTO current_status
  FROM public.support_conversations
  WHERE id = NEW.conversation_id;

  IF current_status IN ('closed', 'resolved') THEN
    RAISE EXCEPTION 'This conversation is closed. Please start a new message.';
  END IF;

  UPDATE public.support_conversations
  SET last_message = CASE WHEN NEW.is_internal THEN '[Internal note]' ELSE NEW.body END,
      last_message_at = NEW.created_at,
      updated_at = now(),
      auto_close_at = NEW.created_at + interval '3 hours',
      status = CASE
        WHEN status IN ('new', 'pending', 'reopened') THEN 'open'
        ELSE status
      END,
      first_response_at = CASE
        WHEN first_response_at IS NULL AND COALESCE(NEW.sender_role, '') <> 'hospital' THEN NEW.created_at
        ELSE first_response_at
      END
  WHERE id = NEW.conversation_id;

  actor_role := COALESCE(NEW.sender_role, 'user');
  PERFORM public.write_audit_log(
    CASE WHEN NEW.is_internal THEN 'CHAT_INTERNAL_NOTE' ELSE 'CHAT_MESSAGE_SENT' END,
    'support_conversation',
    NEW.conversation_id::text,
    '{}'::jsonb,
    jsonb_build_object('message_id', NEW.id, 'sender_role', actor_role, 'body_preview', left(NEW.body, 120)),
    NULL,
    'info',
    jsonb_build_object('conversation_id', NEW.conversation_id, 'message_type', NEW.message_type),
    NEW.sender_id
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_inactive_support_conversations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  closed_count integer;
BEGIN
  UPDATE public.support_conversations
  SET status = 'closed',
      closed_at = now(),
      closed_reason = 'Automatically closed after 3 hours of inactivity',
      updated_at = now()
  WHERE status NOT IN ('closed', 'resolved')
    AND COALESCE(auto_close_at, last_message_at + interval '3 hours', created_at + interval '3 hours') <= now();

  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$$;

CREATE TABLE IF NOT EXISTS public.historical_code_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT,
  source TEXT NOT NULL DEFAULT 'Historical Import',
  imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_by_name TEXT,
  status TEXT NOT NULL DEFAULT 'processing',
  total_rows INTEGER NOT NULL DEFAULT 0,
  unique_rows INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  reconciliation_count INTEGER NOT NULL DEFAULT 0,
  validation_results JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.historical_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_code TEXT NOT NULL,
  normalized_code TEXT NOT NULL,
  record_type TEXT NOT NULL,
  beneficiary_code TEXT,
  policy_number TEXT,
  authorization_code TEXT,
  claim_number TEXT,
  hospital_code TEXT,
  provider_code TEXT,
  invoice_number TEXT,
  payment_reference TEXT,
  patient_name TEXT,
  hospital_name TEXT,
  date_of_birth DATE,
  legacy_creation_date DATE,
  source TEXT NOT NULL DEFAULT 'Historical Import',
  import_batch_id UUID REFERENCES public.historical_code_import_batches(id) ON DELETE SET NULL,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  reconciliation JSONB NOT NULL DEFAULT '{}'::jsonb,
  synchronized BOOLEAN NOT NULL DEFAULT true,
  last_synchronized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(record_type, normalized_code)
);

CREATE INDEX IF NOT EXISTS idx_historical_codes_policy ON public.historical_codes(policy_number);
CREATE INDEX IF NOT EXISTS idx_historical_codes_auth ON public.historical_codes(authorization_code);
CREATE INDEX IF NOT EXISTS idx_historical_codes_claim ON public.historical_codes(claim_number);
CREATE INDEX IF NOT EXISTS idx_historical_codes_search ON public.historical_codes USING gin(raw_data);

CREATE TABLE IF NOT EXISTS public.historical_code_import_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES public.historical_code_import_batches(id) ON DELETE CASCADE,
  row_number INTEGER,
  original_code TEXT,
  record_type TEXT,
  action TEXT NOT NULL,
  message TEXT,
  historical_code_id UUID REFERENCES public.historical_codes(id) ON DELETE SET NULL,
  previous_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.historical_code_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historical_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historical_code_import_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage historical import batches" ON public.historical_code_import_batches;
CREATE POLICY "Admins manage historical import batches" ON public.historical_code_import_batches
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Staff read historical codes" ON public.historical_codes;
CREATE POLICY "Staff read historical codes" ON public.historical_codes
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'nurse')
    OR public.has_role(auth.uid(), 'claims')
  );

DROP POLICY IF EXISTS "Admins write historical codes" ON public.historical_codes;
CREATE POLICY "Admins write historical codes" ON public.historical_codes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins read historical import results" ON public.historical_code_import_results;
CREATE POLICY "Admins read historical import results" ON public.historical_code_import_results
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.safe_parse_date(_val text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF _val IS NULL OR trim(_val) = '' THEN
    RETURN NULL;
  END IF;

  -- If it starts with 4 digits followed by dash (e.g. YYYY-MM-DD), it's ISO style
  IF _val ~ '^\d{4}-\d{2}-\d{2}' THEN
    RETURN _val::date;
  END IF;

  -- If it's DD/MM/YYYY or DD/MM/YY or D/M/YY
  IF _val ~ '^\d{1,2}/\d{1,2}/\d{2,4}' THEN
    IF _val ~ '^\d{1,2}/\d{1,2}/\d{4}' THEN
      RETURN to_date(_val, 'DD/MM/YYYY');
    ELSE
      RETURN to_date(_val, 'DD/MM/YY');
    END IF;
  END IF;

  -- Default fallback
  BEGIN
    RETURN _val::date;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_legacy_code(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(regexp_replace(trim(COALESCE(_value, '')), '\s+', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.reconcile_historical_code(_record jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
  auth_id uuid;
  claim_id uuid;
  hospital_id uuid;
BEGIN
  SELECT id INTO auth_id
  FROM public.authorization_requests
  WHERE authorization_code = COALESCE(_record->>'authorization_code', _record->>'original_code')
     OR policy_number = _record->>'policy_number'
  LIMIT 1;

  SELECT id INTO claim_id
  FROM public.hospital_claims
  WHERE claim_number = COALESCE(_record->>'claim_number', _record->>'original_code')
     OR auth_code = COALESCE(_record->>'authorization_code', _record->>'original_code')
     OR policy_number = _record->>'policy_number'
  LIMIT 1;

  SELECT id INTO hospital_id
  FROM public.hospitals
  WHERE code = COALESCE(_record->>'hospital_code', _record->>'provider_code')
     OR lower(name) = lower(COALESCE(_record->>'hospital_name', ''))
  LIMIT 1;

  result := jsonb_build_object(
    'authorization_id', auth_id,
    'claim_id', claim_id,
    'hospital_id', hospital_id,
    'matched', auth_id IS NOT NULL OR claim_id IS NOT NULL OR hospital_id IS NOT NULL
  );

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.import_historical_codes(
  _file_name text,
  _rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
<<import_run>>
DECLARE
  batch_id uuid;
  actor jsonb;
  row_item jsonb;
  row_number integer := 0;
  total_rows integer := 0;
  unique_rows integer := 0;
  created_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
  duplicate_count integer := 0;
  error_count integer := 0;
  reconciliation_count integer := 0;
  seen_codes text[] := ARRAY[]::text[];
  record_code text;
  normalized text;
  v_record_type text;
  existing public.historical_codes%rowtype;
  merged_id uuid;
  action_taken text;
  rec jsonb;
  previous jsonb;
  new_payload jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can import historical codes';
  END IF;

  actor := public.actor_snapshot(auth.uid());
  total_rows := jsonb_array_length(COALESCE(_rows, '[]'::jsonb));

  INSERT INTO public.historical_code_import_batches(file_name, imported_by, imported_by_name, total_rows)
  VALUES (_file_name, auth.uid(), actor->>'actor_name', total_rows)
  RETURNING id INTO batch_id;

  FOR row_item IN SELECT value FROM jsonb_array_elements(COALESCE(_rows, '[]'::jsonb))
  LOOP
    row_number := row_number + 1;
    v_record_type := lower(COALESCE(NULLIF(row_item->>'record_type', ''), NULLIF(row_item->>'type', ''), 'code'));
    record_code := COALESCE(
      NULLIF(row_item->>'original_code', ''),
      NULLIF(row_item->>'code', ''),
      NULLIF(row_item->>'beneficiary_code', ''),
      NULLIF(row_item->>'policy_number', ''),
      NULLIF(row_item->>'authorization_code', ''),
      NULLIF(row_item->>'claim_number', ''),
      NULLIF(row_item->>'hospital_code', ''),
      NULLIF(row_item->>'payment_reference', '')
    );
    normalized := public.normalize_legacy_code(record_code);

    IF normalized = '' THEN
      error_count := error_count + 1;
      INSERT INTO public.historical_code_import_results(batch_id, row_number, original_code, record_type, action, message, new_values)
      VALUES (batch_id, row_number, record_code, v_record_type, 'Error', 'Missing mandatory code field', row_item);
      CONTINUE;
    END IF;

    IF (v_record_type || ':' || normalized) = ANY(seen_codes) THEN
      duplicate_count := duplicate_count + 1;
      INSERT INTO public.historical_code_import_results(batch_id, row_number, original_code, record_type, action, message, new_values)
      VALUES (batch_id, row_number, record_code, v_record_type, 'Skipped', 'Duplicate code within uploaded file ignored', row_item);
      CONTINUE;
    END IF;

    seen_codes := array_append(seen_codes, v_record_type || ':' || normalized);
    unique_rows := unique_rows + 1;
    rec := public.reconcile_historical_code(row_item || jsonb_build_object('original_code', record_code));
    IF COALESCE((rec->>'matched')::boolean, false) THEN
      reconciliation_count := reconciliation_count + 1;
    END IF;

    SELECT * INTO existing
    FROM public.historical_codes
    WHERE historical_codes.record_type = v_record_type
      AND normalized_code = normalized
    LIMIT 1;

    previous := CASE WHEN existing.id IS NULL THEN '{}'::jsonb ELSE to_jsonb(existing) END;
    new_payload := jsonb_strip_nulls(row_item || jsonb_build_object('source', 'Historical Import', 'import_batch_id', batch_id, 'reconciliation', rec));

    INSERT INTO public.historical_codes (
      original_code,
      normalized_code,
      record_type,
      beneficiary_code,
      policy_number,
      authorization_code,
      claim_number,
      hospital_code,
      provider_code,
      invoice_number,
      payment_reference,
      patient_name,
      hospital_name,
      date_of_birth,
      legacy_creation_date,
      import_batch_id,
      raw_data,
      reconciliation,
      imported_by
    )
    VALUES (
      record_code,
      normalized,
      v_record_type,
      NULLIF(row_item->>'beneficiary_code', ''),
      NULLIF(row_item->>'policy_number', ''),
      NULLIF(row_item->>'authorization_code', ''),
      NULLIF(row_item->>'claim_number', ''),
      NULLIF(row_item->>'hospital_code', ''),
      NULLIF(row_item->>'provider_code', ''),
      NULLIF(row_item->>'invoice_number', ''),
      NULLIF(row_item->>'payment_reference', ''),
      NULLIF(row_item->>'patient_name', ''),
      NULLIF(row_item->>'hospital_name', ''),
      public.safe_parse_date(row_item->>'date_of_birth'),
      public.safe_parse_date(row_item->>'legacy_creation_date'),
      batch_id,
      row_item,
      rec,
      auth.uid()
    )
    ON CONFLICT (record_type, normalized_code) DO UPDATE SET
      beneficiary_code = COALESCE(public.historical_codes.beneficiary_code, EXCLUDED.beneficiary_code),
      policy_number = COALESCE(public.historical_codes.policy_number, EXCLUDED.policy_number),
      authorization_code = COALESCE(public.historical_codes.authorization_code, EXCLUDED.authorization_code),
      claim_number = COALESCE(public.historical_codes.claim_number, EXCLUDED.claim_number),
      hospital_code = COALESCE(public.historical_codes.hospital_code, EXCLUDED.hospital_code),
      provider_code = COALESCE(public.historical_codes.provider_code, EXCLUDED.provider_code),
      invoice_number = COALESCE(public.historical_codes.invoice_number, EXCLUDED.invoice_number),
      payment_reference = COALESCE(public.historical_codes.payment_reference, EXCLUDED.payment_reference),
      patient_name = COALESCE(public.historical_codes.patient_name, EXCLUDED.patient_name),
      hospital_name = COALESCE(public.historical_codes.hospital_name, EXCLUDED.hospital_name),
      date_of_birth = COALESCE(public.historical_codes.date_of_birth, EXCLUDED.date_of_birth),
      legacy_creation_date = COALESCE(public.historical_codes.legacy_creation_date, EXCLUDED.legacy_creation_date),
      raw_data = public.historical_codes.raw_data || EXCLUDED.raw_data,
      reconciliation = public.historical_codes.reconciliation || EXCLUDED.reconciliation,
      synchronized = true,
      last_synchronized_at = now(),
      updated_at = now()
    WHERE (public.historical_codes.beneficiary_code IS NULL AND EXCLUDED.beneficiary_code IS NOT NULL)
       OR (public.historical_codes.policy_number IS NULL AND EXCLUDED.policy_number IS NOT NULL)
       OR (public.historical_codes.authorization_code IS NULL AND EXCLUDED.authorization_code IS NOT NULL)
       OR (public.historical_codes.claim_number IS NULL AND EXCLUDED.claim_number IS NOT NULL)
       OR (public.historical_codes.hospital_code IS NULL AND EXCLUDED.hospital_code IS NOT NULL)
       OR (public.historical_codes.provider_code IS NULL AND EXCLUDED.provider_code IS NOT NULL)
       OR (public.historical_codes.invoice_number IS NULL AND EXCLUDED.invoice_number IS NOT NULL)
       OR (public.historical_codes.payment_reference IS NULL AND EXCLUDED.payment_reference IS NOT NULL)
       OR (public.historical_codes.patient_name IS NULL AND EXCLUDED.patient_name IS NOT NULL)
       OR (public.historical_codes.hospital_name IS NULL AND EXCLUDED.hospital_name IS NOT NULL)
       OR (public.historical_codes.date_of_birth IS NULL AND EXCLUDED.date_of_birth IS NOT NULL)
       OR (public.historical_codes.legacy_creation_date IS NULL AND EXCLUDED.legacy_creation_date IS NOT NULL)
       OR (COALESCE(public.historical_codes.reconciliation->>'matched', 'false') = 'false' AND COALESCE(EXCLUDED.reconciliation->>'matched', 'false') = 'true')
    RETURNING id INTO merged_id;

    IF existing.id IS NULL THEN
      action_taken := 'Created';
      created_count := created_count + 1;
    ELSE
      IF merged_id IS NULL THEN
        merged_id := existing.id;
      END IF;
      SELECT * INTO existing FROM public.historical_codes WHERE id = merged_id;
      IF previous IS DISTINCT FROM to_jsonb(existing) THEN
        action_taken := 'Updated';
        updated_count := updated_count + 1;
      ELSE
        action_taken := 'Skipped';
        skipped_count := skipped_count + 1;
      END IF;
    END IF;

    INSERT INTO public.historical_code_import_results(
      batch_id,
      row_number,
      original_code,
      record_type,
      action,
      message,
      historical_code_id,
      previous_values,
      new_values
    )
    VALUES (
      batch_id,
      row_number,
      record_code,
      v_record_type,
      action_taken,
      CASE action_taken WHEN 'Skipped' THEN 'Already exists with no blank fields to merge' ELSE action_taken || ' by historical import' END,
      merged_id,
      previous,
      new_payload
    );
  END LOOP;

  UPDATE public.historical_code_import_batches
  SET status = 'completed',
      unique_rows = import_run.unique_rows,
      created_count = import_run.created_count,
      updated_count = import_run.updated_count,
      skipped_count = import_run.skipped_count,
      duplicate_count = import_run.duplicate_count,
      error_count = import_run.error_count,
      reconciliation_count = import_run.reconciliation_count,
      validation_results = jsonb_build_object(
        'duplicates_in_file', import_run.duplicate_count,
        'errors', import_run.error_count,
        'reconciliation_matches', import_run.reconciliation_count
      ),
      completed_at = now()
  WHERE id = batch_id;

  PERFORM public.write_audit_log(
    'HISTORICAL_CODE_IMPORT_COMPLETED',
    'historical_import_batch',
    batch_id::text,
    '{}'::jsonb,
    jsonb_build_object(
      'file_name', _file_name,
      'total_rows', total_rows,
      'unique_rows', unique_rows,
      'created_count', created_count,
      'updated_count', updated_count,
      'skipped_count', skipped_count,
      'duplicate_count', duplicate_count,
      'error_count', error_count,
      'reconciliation_count', reconciliation_count
    ),
    'Historical code import and reconciliation',
    CASE WHEN error_count > 0 THEN 'warning' ELSE 'info' END,
    jsonb_build_object('batch_id', batch_id)
  );

  RETURN jsonb_build_object(
    'batch_id', batch_id,
    'total_rows', total_rows,
    'unique_rows', unique_rows,
    'created_count', created_count,
    'updated_count', updated_count,
    'skipped_count', skipped_count,
    'duplicate_count', duplicate_count,
    'error_count', error_count,
    'reconciliation_count', reconciliation_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claims_volume_performance(
  _from timestamptz DEFAULT now() - interval '90 days',
  _to timestamptz DEFAULT now(),
  _bucket text DEFAULT 'week'
)
RETURNS TABLE (
  period_start timestamptz,
  submitted_count bigint,
  approved_count bigint,
  declined_count bigint,
  under_audit_count bigint,
  partial_count bigint,
  total_claim_value numeric,
  approved_value numeric,
  declined_value numeric,
  avg_processing_hours numeric,
  audit_savings numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    date_trunc(CASE WHEN _bucket IN ('day', 'month') THEN _bucket ELSE 'week' END, hc.created_at) AS period_start,
    count(*) AS submitted_count,
    count(*) FILTER (WHERE lower(hc.status) IN ('approved', 'paid')) AS approved_count,
    count(*) FILTER (WHERE lower(hc.status) IN ('rejected', 'declined', 'denied')) AS declined_count,
    count(*) FILTER (WHERE lower(hc.status) IN ('submitted', 'pending', 'under_review', 'pending_audit')) AS under_audit_count,
    count(*) FILTER (WHERE lower(hc.status) IN ('partially_approved', 'partial')) AS partial_count,
    COALESCE(sum(hc.total_amount), 0) AS total_claim_value,
    COALESCE(sum(COALESCE(hc.approved_amount, CASE WHEN lower(hc.status) IN ('approved', 'paid') THEN hc.total_amount ELSE 0 END)), 0) AS approved_value,
    COALESCE(sum(COALESCE(hc.declined_amount, 0)), 0) AS declined_value,
    round(avg(EXTRACT(EPOCH FROM (COALESCE(hc.audited_at, hc.updated_at, hc.submitted_at, hc.created_at) - hc.created_at)) / 3600)::numeric, 2) AS avg_processing_hours,
    COALESCE(sum(GREATEST(COALESCE(hc.declined_amount, 0), COALESCE(hc.total_amount, 0) - COALESCE(hc.approved_amount, hc.total_amount, 0))), 0) AS audit_savings
  FROM public.hospital_claims hc
  WHERE hc.created_at >= _from
    AND hc.created_at <= _to
  GROUP BY 1
  ORDER BY 1;
$$;

COMMIT;
