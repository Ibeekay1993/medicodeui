-- Create profile name update requests table
CREATE TABLE IF NOT EXISTS public.profile_name_update_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    current_name TEXT NOT NULL,
    requested_name TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    decided_by UUID REFERENCES auth.users(id),
    decided_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.profile_name_update_requests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view their own profile name update requests" ON public.profile_name_update_requests;
DROP POLICY IF EXISTS "Users can insert their own profile name update requests" ON public.profile_name_update_requests;
DROP POLICY IF EXISTS "Admins can select, update, and delete all profile name update requests" ON public.profile_name_update_requests;

-- RLS Policies
CREATE POLICY "Users can view their own profile name update requests" ON public.profile_name_update_requests
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile name update requests" ON public.profile_name_update_requests
    FOR INSERT WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Admins can select, update, and delete all profile name update requests" ON public.profile_name_update_requests
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
    );

-- Create approval/rejection function
CREATE OR REPLACE FUNCTION public.decide_profile_name_request(
    _request_id UUID,
    _status TEXT,
    _decided_by UUID
) RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_requested_name TEXT;
    v_role TEXT;
    v_hosp_id UUID;
BEGIN
    -- Verify caller is admin
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _decided_by
        AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Access Denied: Only administrators can approve or reject profile name requests';
    END IF;

    -- Validate status
    IF _status NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Invalid status. Must be approved or rejected';
    END IF;

    -- Fetch target request
    SELECT user_id, requested_name, role
    INTO v_user_id, v_requested_name, v_role
    FROM public.profile_name_update_requests
    WHERE id = _request_id AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pending request not found';
    END IF;

    -- Update the request status
    UPDATE public.profile_name_update_requests
    SET status = _status,
        decided_by = _decided_by,
        decided_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = _request_id;

    -- If approved, apply the updates
    IF _status = 'approved' THEN
        -- Update user_roles
        UPDATE public.user_roles
        SET full_name = v_requested_name
        WHERE user_id = v_user_id;

        -- Update hospital if role is hospital
        IF v_role = 'hospital' THEN
            UPDATE public.hospitals
            SET name = v_requested_name
            WHERE user_id = v_user_id
            RETURNING id INTO v_hosp_id;
            
            IF v_hosp_id IS NOT NULL THEN
                -- Also update any authorization requests under this hospital name
                UPDATE public.authorization_requests
                SET hospital_name = v_requested_name
                WHERE hospital_id = v_hosp_id;
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'status', _status,
        'role', v_role,
        'applied_name', CASE WHEN _status = 'approved' THEN v_requested_name ELSE NULL END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
