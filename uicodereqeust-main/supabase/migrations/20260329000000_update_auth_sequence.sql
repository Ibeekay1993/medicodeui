-- Update the auth_code_sequence TABLE to start from the user's requested number
-- Using the correct column name 'current_value' from the schema
UPDATE public.auth_code_sequence 
SET current_value = 11007598 
WHERE id = 1;

-- If for some reason the row doesn't exist yet, we insert it
INSERT INTO public.auth_code_sequence (id, current_value)
SELECT 1, 11007598
WHERE NOT EXISTS (SELECT 1 FROM public.auth_code_sequence WHERE id = 1);
