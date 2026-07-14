-- Create consent_logs table for GDPR/NDPR compliance
CREATE TABLE IF NOT EXISTS public.consent_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('accept_essential', 'accept_all', 'withdraw')),
    policy_version TEXT NOT NULL,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.consent_logs ENABLE ROW LEVEL SECURITY;

-- Users can insert their own consent logs
CREATE POLICY "Users can insert their own consent logs"
    ON public.consent_logs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can view their own consent logs
CREATE POLICY "Users can view their own consent logs"
    ON public.consent_logs FOR SELECT
    USING (auth.uid() = user_id);

-- Explicitly deny updates and deletes to make the table immutable
-- (RLS implicitly denies these operations unless policies are created, but we can document the intention)

-- Admins can view all consent logs
CREATE POLICY "Admins can view all consent logs"
    ON public.consent_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
    );
