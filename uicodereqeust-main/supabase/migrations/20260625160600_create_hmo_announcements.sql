-- Create hmo_announcements table
CREATE TABLE IF NOT EXISTS public.hmo_announcements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.hmo_announcements ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT SELECT ON public.hmo_announcements TO authenticated;
GRANT ALL ON public.hmo_announcements TO authenticated;

-- Policies
CREATE POLICY "Admins can manage announcements" ON public.hmo_announcements
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can read active announcements" ON public.hmo_announcements
FOR SELECT TO authenticated
USING (is_active = true);

-- Add update trigger
CREATE OR REPLACE FUNCTION public.set_hmo_announcements_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER handle_hmo_announcements_updated_at
BEFORE UPDATE ON public.hmo_announcements
FOR EACH ROW
EXECUTE FUNCTION public.set_hmo_announcements_updated_at();

-- Insert a welcome announcement
INSERT INTO public.hmo_announcements (title, content, priority, is_active)
VALUES (
    'Welcome to the new Ronsberger HMO Portal!',
    'We have redesigned the hospital dashboard to give you quicker access to your most important tasks. If you encounter any issues, please message HMO support.',
    'high',
    true
);
