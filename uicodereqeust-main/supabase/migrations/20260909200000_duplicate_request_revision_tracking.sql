ALTER TABLE public.authorization_requests
  ADD COLUMN IF NOT EXISTS related_request_id UUID REFERENCES public.authorization_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duplicate_status TEXT NOT NULL DEFAULT 'none'
    CHECK (duplicate_status IN ('none', 'possible_revision', 'duplicate'));

CREATE INDEX IF NOT EXISTS idx_authorization_requests_related_request_id
  ON public.authorization_requests(related_request_id);

CREATE INDEX IF NOT EXISTS idx_authorization_requests_duplicate_status
  ON public.authorization_requests(duplicate_status);
