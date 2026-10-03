-- Department lead role for controlled utilization operations.
-- Keep this in its own migration so later migrations can safely use the enum value.
ALTER TYPE public.app_role
  ADD VALUE IF NOT EXISTS 'utilization_manager_lead';
