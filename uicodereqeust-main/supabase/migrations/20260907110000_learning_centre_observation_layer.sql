BEGIN;

CREATE TABLE IF NOT EXISTS public.learning_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  subject_key TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.knowledge_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'operational',
  status TEXT NOT NULL DEFAULT 'candidate'
    CHECK (status IN ('candidate', 'under_review', 'approved', 'rejected', 'superseded')),
  evidence_count INTEGER NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  confidence NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 100),
  first_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learning_events_occurred_at
  ON public.learning_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_events_source
  ON public.learning_events (source);
CREATE INDEX IF NOT EXISTS idx_knowledge_candidates_status
  ON public.knowledge_candidates (status, last_observed_at DESC);

ALTER TABLE public.learning_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read learning events" ON public.learning_events;
CREATE POLICY "Admins can read learning events"
  ON public.learning_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert learning events" ON public.learning_events;
CREATE POLICY "Admins can insert learning events"
  ON public.learning_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage knowledge candidates" ON public.knowledge_candidates;
CREATE POLICY "Admins can manage knowledge candidates"
  ON public.knowledge_candidates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.review_knowledge_candidate(
  _candidate_id UUID,
  _status TEXT,
  _review_note TEXT DEFAULT NULL
)
RETURNS public.knowledge_candidates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reviewed public.knowledge_candidates;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can review knowledge candidates';
  END IF;
  IF _status NOT IN ('under_review', 'approved', 'rejected', 'superseded') THEN
    RAISE EXCEPTION 'Invalid knowledge review status';
  END IF;

  UPDATE public.knowledge_candidates
  SET status = _status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = NULLIF(btrim(_review_note), ''),
      updated_at = now()
  WHERE id = _candidate_id
  RETURNING * INTO reviewed;

  IF reviewed.id IS NULL THEN
    RAISE EXCEPTION 'Knowledge candidate not found';
  END IF;
  RETURN reviewed;
END;
$$;

REVOKE ALL ON FUNCTION public.review_knowledge_candidate(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_knowledge_candidate(UUID, TEXT, TEXT) TO authenticated;

COMMIT;
