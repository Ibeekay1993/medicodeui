-- MedAuth NG "Fresh Start" Migration
-- This script cleans out all test data from your new project

-- 1. Delete all previous authorization requests and logs
TRUNCATE public.authorization_logs CASCADE;
TRUNCATE public.authorization_requests CASCADE;
TRUNCATE public.excel_imports CASCADE;

-- 2. Clear the hospitals and patients if you want a complete fresh start
TRUNCATE public.hospitals CASCADE;
TRUNCATE public.patients CASCADE;

-- 3. Reset the Auth Code Sequence to your requested starting value
UPDATE public.auth_code_sequence SET current_value = 11007598 WHERE id = 1;
