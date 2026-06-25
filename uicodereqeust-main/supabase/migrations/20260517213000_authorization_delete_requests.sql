ALTER TABLE public.authorization_requests
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT,
  ADD COLUMN IF NOT EXISTS deletion_status TEXT NOT NULL DEFAULT 'none'
    CHECK (deletion_status IN ('none', 'awaiting_admin_approval', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_authorization_requests_deletion_status
  ON public.authorization_requests(deletion_status);
