-- ============================================================
-- MEDICODE INTERACTIVE DEMO SEED SCRIPT (v5 - DEFINITIVE FIX)
-- ============================================================
-- THE BUG: The trigger fires on DELETE too. When auth.uid() IS NULL
-- (SQL editor context), returning RETURN NEW returns NULL for DELETE
-- ops (since NEW=NULL on deletes), which SILENTLY CANCELS the delete.
-- THE FIX: Use RETURN COALESCE(NEW, OLD) — returns OLD for deletes,
-- NEW for inserts/updates.
-- ============================================================
-- Paste into Supabase SQL Editor → Run
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- STEP 1: FIX THE TRIGGER FUNCTION (critical fix for DELETE support)
-- COALESCE(NEW, OLD) = OLD on DELETE, NEW on INSERT/UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION public.harden_user_roles()
RETURNS TRIGGER AS $$
BEGIN
  -- Service role / SQL editor / migrations: auth.uid() is NULL → allow all
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  -- Authenticated browser users must be admin to modify roles
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'CyberSecurity Violation: Access Role Modification Denied';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- STEP 2: NOW DELETE OLD DEMO RECORDS (trigger will now allow it)
-- ============================================================
DELETE FROM public.user_roles WHERE user_id IN (
  'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
  'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
  'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
  'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4'
);

DELETE FROM auth.identities WHERE provider_id IN (
  'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
  'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
  'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
  'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4'
);

DELETE FROM auth.users WHERE id IN (
  'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
  'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
  'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
  'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4'
);

-- ============================================================
-- STEP 3: ADD UNIQUE(user_id) CONSTRAINT (table is now clean)
-- ============================================================
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_unique;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_unique UNIQUE (user_id);

-- ============================================================
-- STEP 4: CREATE DEMO USERS IN auth.users
-- ============================================================

INSERT INTO auth.users (
  id, instance_id, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, role, aud, confirmation_token
) VALUES (
  'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
  '00000000-0000-0000-0000-000000000000',
  'demo.admin@medicode.com',
  crypt('demo1234', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}',
  '{"full_name":"Demo Admin Officer"}',
  now(), now(), 'authenticated', 'authenticated', ''
);

INSERT INTO auth.users (
  id, instance_id, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, role, aud, confirmation_token
) VALUES (
  'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
  '00000000-0000-0000-0000-000000000000',
  'demo.nurse@medicode.com',
  crypt('demo1234', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}',
  '{"full_name":"Demo Nurse Practitioner"}',
  now(), now(), 'authenticated', 'authenticated', ''
);

INSERT INTO auth.users (
  id, instance_id, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, role, aud, confirmation_token
) VALUES (
  'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
  '00000000-0000-0000-0000-000000000000',
  'demo.hospital@medicode.com',
  crypt('demo1234', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}',
  '{"full_name":"Ronsberger Demo Hospital"}',
  now(), now(), 'authenticated', 'authenticated', ''
);

INSERT INTO auth.users (
  id, instance_id, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, role, aud, confirmation_token
) VALUES (
  'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4',
  '00000000-0000-0000-0000-000000000000',
  'demo.claims@medicode.com',
  crypt('demo1234', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}',
  '{"full_name":"Demo Claims Reviewer"}',
  now(), now(), 'authenticated', 'authenticated', ''
);

-- ============================================================
-- STEP 5: CREATE auth.identities
-- ============================================================

INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, provider_id)
VALUES (
  'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
  'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
  jsonb_build_object('sub','a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1','email','demo.admin@medicode.com','email_verified',true,'phone_verified',false),
  'email', now(), now(), now(), 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'
) ON CONFLICT (provider, provider_id) DO NOTHING;

INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, provider_id)
VALUES (
  'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
  'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
  jsonb_build_object('sub','b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2','email','demo.nurse@medicode.com','email_verified',true,'phone_verified',false),
  'email', now(), now(), now(), 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2'
) ON CONFLICT (provider, provider_id) DO NOTHING;

INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, provider_id)
VALUES (
  'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
  'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
  jsonb_build_object('sub','c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3','email','demo.hospital@medicode.com','email_verified',true,'phone_verified',false),
  'email', now(), now(), now(), 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'
) ON CONFLICT (provider, provider_id) DO NOTHING;

INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, provider_id)
VALUES (
  'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4',
  'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4',
  jsonb_build_object('sub','d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4','email','demo.claims@medicode.com','email_verified',true,'phone_verified',false),
  'email', now(), now(), now(), 'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4'
) ON CONFLICT (provider, provider_id) DO NOTHING;

-- ============================================================
-- STEP 6: ASSIGN ROLES (no conflict possible — table was cleared)
-- ============================================================
INSERT INTO public.user_roles (user_id, role, full_name)
VALUES ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'admin', 'Demo Admin Officer');

INSERT INTO public.user_roles (user_id, role, full_name)
VALUES ('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', 'nurse', 'Demo Nurse Practitioner');

INSERT INTO public.user_roles (user_id, role, full_name)
VALUES ('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', 'hospital', 'Ronsberger Demo Hospital');

INSERT INTO public.user_roles (user_id, role, full_name)
VALUES ('d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4', 'claims', 'Demo Claims Reviewer');

-- ============================================================
-- STEP 7: ENSURE DEMO HOSPITAL ROW EXISTS
-- ============================================================
INSERT INTO public.hospitals (id, name, email, code, user_id)
VALUES (
  'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
  'Ronsberger Demo Hospital',
  'demo.hospital@medicode.com',
  'HOSP-DEMO',
  'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'
) ON CONFLICT (id) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      name    = EXCLUDED.name,
      email   = EXCLUDED.email,
      code    = EXCLUDED.code;

-- ============================================================
-- STEP 8: VERIFY — must show exactly 4 rows to confirm success
-- ============================================================
SELECT u.email, ur.role::text, ur.full_name
FROM auth.users u
JOIN public.user_roles ur ON ur.user_id = u.id
WHERE u.email LIKE 'demo.%@medicode.com'
ORDER BY ur.role;
