-- Add is_historical column
ALTER TABLE public.authorization_requests
ADD COLUMN IF NOT EXISTS is_historical BOOLEAN DEFAULT false;

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_auth_req_is_historical ON public.authorization_requests (is_historical);
