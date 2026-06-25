
-- =============================================
-- MedAuth NG — Full Database Schema
-- =============================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =============================================
-- 1. Role enum and user_roles table
-- =============================================
CREATE TYPE public.app_role AS ENUM ('nurse', 'hospital', 'admin');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- =============================================
-- 2. Hospitals table
-- =============================================
CREATE TABLE public.hospitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  email TEXT,
  phone TEXT,
  state TEXT,
  whatsapp_number TEXT,
  address TEXT,
  is_active BOOLEAN DEFAULT true,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nurses can view all hospitals"
  ON public.hospitals FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Hospitals can view their own record"
  ON public.hospitals FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Nurses can manage hospitals"
  ON public.hospitals FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_hospitals_code ON public.hospitals(code);
CREATE INDEX idx_hospitals_user_id ON public.hospitals(user_id);

-- =============================================
-- 3. Patients table
-- =============================================
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_number TEXT NOT NULL,
  surname TEXT NOT NULL,
  first_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'PRINCIPAL',
  plan_code TEXT,
  date_of_birth DATE,
  gender TEXT,
  phone TEXT,
  email TEXT,
  subscription_status TEXT DEFAULT 'active',
  expiry_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nurses can manage patients"
  ON public.patients FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_patients_policy ON public.patients(policy_number);
CREATE INDEX idx_patients_name ON public.patients USING gin ((surname || ' ' || first_name) gin_trgm_ops);

-- =============================================
-- 4. Auth code sequence table
-- =============================================
CREATE TABLE public.auth_code_sequence (
  id INTEGER PRIMARY KEY DEFAULT 1,
  current_value BIGINT NOT NULL DEFAULT 11007543,
  CHECK (id = 1)
);

ALTER TABLE public.auth_code_sequence ENABLE ROW LEVEL SECURITY;

-- No direct access policies — only via SECURITY DEFINER function
INSERT INTO public.auth_code_sequence (id, current_value) VALUES (1, 11007543);

-- =============================================
-- 5. Authorization requests table
-- =============================================
CREATE TABLE public.authorization_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT UNIQUE,
  patient_name TEXT NOT NULL,
  policy_number TEXT NOT NULL,
  diagnosis TEXT NOT NULL,
  treatment TEXT NOT NULL,
  hospital_id UUID REFERENCES public.hospitals(id),
  hospital_name TEXT,
  doctor_name TEXT,
  urgency TEXT DEFAULT 'routine',
  source TEXT DEFAULT 'web',
  clinical_notes TEXT,
  whatsapp_raw_message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  authorization_code TEXT,
  decision_reason TEXT,
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  submitted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.authorization_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nurses can view all requests"
  ON public.authorization_requests FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Nurses can manage requests"
  ON public.authorization_requests FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Hospitals can view their own requests"
  ON public.authorization_requests FOR SELECT
  TO authenticated
  USING (
    submitted_by = auth.uid() OR
    hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
  );

CREATE POLICY "Hospitals can create requests"
  ON public.authorization_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'hospital') AND submitted_by = auth.uid()
  );

CREATE INDEX idx_requests_status ON public.authorization_requests(status);
CREATE INDEX idx_requests_hospital ON public.authorization_requests(hospital_id);
CREATE INDEX idx_requests_date ON public.authorization_requests(created_at DESC);
CREATE INDEX idx_requests_policy ON public.authorization_requests(policy_number);

-- =============================================
-- 6. Authorization logs (audit trail)
-- =============================================
CREATE TABLE public.authorization_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES public.authorization_requests(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by UUID REFERENCES auth.users(id),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.authorization_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nurses can view all logs"
  ON public.authorization_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert logs"
  ON public.authorization_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- =============================================
-- 7. Excel imports tracking
-- =============================================
CREATE TABLE public.excel_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  file_type TEXT DEFAULT 'xlsx',
  total_rows INTEGER,
  successful_rows INTEGER,
  failed_rows INTEGER,
  errors JSONB,
  imported_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.excel_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nurses can manage imports"
  ON public.excel_imports FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));

-- =============================================
-- 8. Database functions
-- =============================================

-- Auto-update timestamps trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_hospitals_updated_at
  BEFORE UPDATE ON public.hospitals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_patients_updated_at
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_requests_updated_at
  BEFORE UPDATE ON public.authorization_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.generate_auth_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_val BIGINT;
BEGIN
  UPDATE public.auth_code_sequence
  SET current_value = current_value + 1
  WHERE id = 1
  RETURNING current_value INTO next_val;
  
  RETURN 'R/AG/' || LPAD(next_val::TEXT, 9, '0') || 'BD';
END;
$$;

-- Generate request ID: REQ-YYYYMMDD-NNN
CREATE OR REPLACE FUNCTION public.generate_request_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_count INTEGER;
  date_str TEXT;
BEGIN
  date_str := to_char(now(), 'YYYYMMDD');
  
  SELECT COUNT(*) + 1 INTO today_count
  FROM public.authorization_requests
  WHERE request_id LIKE 'REQ-' || date_str || '-%';
  
  NEW.request_id := 'REQ-' || date_str || '-' || LPAD(today_count::TEXT, 3, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_request_id
  BEFORE INSERT ON public.authorization_requests
  FOR EACH ROW
  WHEN (NEW.request_id IS NULL)
  EXECUTE FUNCTION public.generate_request_id();

-- Verify policy (SECURITY DEFINER so hospitals can check without seeing patient data)
CREATE OR REPLACE FUNCTION public.verify_policy(_policy_number TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  patient_record RECORD;
BEGIN
  SELECT INTO patient_record
    surname, first_name, role, plan_code, subscription_status, expiry_date
  FROM public.patients
  WHERE policy_number = _policy_number AND role = 'PRINCIPAL'
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false,
      'message', 'Client not found'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'found', true,
    'name', patient_record.surname || ' ' || patient_record.first_name,
    'plan', patient_record.plan_code,
    'status', patient_record.subscription_status,
    'expiry', patient_record.expiry_date,
    'is_active', patient_record.subscription_status = 'active' AND (patient_record.expiry_date IS NULL OR patient_record.expiry_date >= CURRENT_DATE)
  );
END;
$$;

-- Auto audit log on status change
CREATE OR REPLACE FUNCTION public.log_request_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.authorization_logs (request_id, action, performed_by, details)
    VALUES (
      NEW.id,
      CASE NEW.status
        WHEN 'approved' THEN 'APPROVED'
        WHEN 'rejected' THEN 'REJECTED'
        ELSE 'STATUS_CHANGED'
      END,
      NEW.decided_by,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'reason', NEW.decision_reason,
        'auth_code', NEW.authorization_code
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_audit_log
  AFTER UPDATE ON public.authorization_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_request_status_change();

-- Enable realtime on requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.authorization_requests;
