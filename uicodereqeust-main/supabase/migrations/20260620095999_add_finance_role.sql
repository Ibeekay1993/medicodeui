-- Step 1: Append 'finance' to public.app_role enum in a separate transaction/migration
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance';
