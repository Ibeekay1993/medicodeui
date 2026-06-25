-- This migration must be run in its own transaction (which Supabase CLI handles per-file)
-- Adding to an enum cannot be mixed with using the new enum value in the same transaction block.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'utilization_manager';
