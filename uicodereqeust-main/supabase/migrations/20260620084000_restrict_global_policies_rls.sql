-- Restrict select policy on public.global_policies table
DROP POLICY IF EXISTS "Anyone authenticated can view global policies" ON public.global_policies;

-- Policy 1: Admin users can view all global policies
CREATE POLICY "Admins can select all global policies" ON public.global_policies
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
    );

-- Policy 2: Non-admin authenticated users can only view non-sensitive public policy keys
CREATE POLICY "Authenticated users can select public global policies" ON public.global_policies
    FOR SELECT TO authenticated
    USING (
        key IN ('enforce_mfa') -- whitelist public, non-sensitive keys
    );
