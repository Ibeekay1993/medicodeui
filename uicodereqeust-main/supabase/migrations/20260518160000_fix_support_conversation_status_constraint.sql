-- Drop old check constraint if it exists
ALTER TABLE public.support_conversations DROP CONSTRAINT IF EXISTS support_conversations_status_check;

-- Add updated check constraint supporting all operational statuses
ALTER TABLE public.support_conversations ADD CONSTRAINT support_conversations_status_check 
  CHECK (status IN ('new', 'open', 'pending', 'pending_customer_response', 'waiting_internal_action', 'resolved', 'closed', 'reopened'));
