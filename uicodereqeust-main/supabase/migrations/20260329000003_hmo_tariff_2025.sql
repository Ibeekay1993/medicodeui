-- Create the clinical tariffs table for the 2025 NHIA knowledge base
CREATE TABLE IF NOT EXISTS public.clinical_tariffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE,
    name TEXT NOT NULL,
    price NUMERIC NOT NULL,
    category TEXT, -- 'medicine' or 'procedure'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.clinical_tariffs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read tariffs
CREATE POLICY "Allow authenticated users to read tariffs"
    ON public.clinical_tariffs
    FOR SELECT
    TO authenticated
    USING (true);

-- Enable full-text search on names
CREATE INDEX IF NOT EXISTS clinical_tariffs_name_idx ON public.clinical_tariffs USING GIN (to_tsvector('english', name));
