CREATE TABLE IF NOT EXISTS public.global_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.global_policies ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists
DROP POLICY IF EXISTS "Anyone authenticated can view global policies" ON public.global_policies;
DROP POLICY IF EXISTS "Only admins can modify global policies" ON public.global_policies;

CREATE POLICY "Anyone authenticated can view global policies" ON public.global_policies
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Only admins can modify global policies" ON public.global_policies
    FOR ALL TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
    );

-- Seed default enforce_mfa key
INSERT INTO public.global_policies (key, value)
VALUES ('enforce_mfa', '{"enforced": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;
