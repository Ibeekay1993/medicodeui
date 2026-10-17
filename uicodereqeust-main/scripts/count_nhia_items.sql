SELECT code, name, category, amount FROM public.nhia_items WHERE is_active = true AND name ILIKE '%consult%' ORDER BY code LIMIT 20;
