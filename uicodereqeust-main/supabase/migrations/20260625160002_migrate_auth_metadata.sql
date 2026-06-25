-- Ensure auth.users metadata is synchronized with the new native role
-- This updates the JWT claims and frontend user object metadata
UPDATE auth.users 
SET raw_user_meta_data = jsonb_set(raw_user_meta_data, '{role}', '"utilization_manager"') 
WHERE raw_user_meta_data->>'role' = 'nurse';
