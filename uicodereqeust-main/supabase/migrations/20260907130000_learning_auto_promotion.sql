BEGIN;

CREATE OR REPLACE FUNCTION public.run_learning_observation(
  _lookback interval DEFAULT interval '24 hours'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  window_start timestamptz := now() - _lookback;
  request_count integer := 0;
  whatsapp_count integer := 0;
  source_record jsonb;
  rejection_record record;
  candidate_count integer := 0;
  promoted_count integer := 0;
BEGIN
  IF _lookback < interval '1 hour' OR _lookback > interval '90 days' THEN
    RAISE EXCEPTION 'Learning lookback must be between one hour and ninety days';
  END IF;

  SELECT count(*) INTO request_count
  FROM public.authorization_requests
  WHERE created_at >= window_start;

  SELECT count(*) INTO whatsapp_count
  FROM public.whatsapp_messages
  WHERE created_at >= window_start;

  source_record := jsonb_build_object(
    'window_start', window_start,
    'window_end', now(),
    'authorization_requests', request_count,
    'whatsapp_messages', whatsapp_count
  );

  INSERT INTO public.learning_events(event_type, source, subject_key, payload)
  VALUES ('activity_snapshot', 'learning_engine', 'activity_volume', source_record);

  INSERT INTO public.knowledge_candidates(
    title, summary, category, evidence_count, confidence,
    first_observed_at, last_observed_at, evidence
  )
  VALUES (
    'Authorization activity volume',
    format('%s authorization requests and %s WhatsApp messages were observed in the learning window.',
      request_count, whatsapp_count),
    'operational',
    request_count + whatsapp_count,
    100,
    window_start,
    now(),
    jsonb_build_array(source_record)
  )
  ON CONFLICT (category, title) DO UPDATE SET
    summary = EXCLUDED.summary,
    evidence_count = public.knowledge_candidates.evidence_count + EXCLUDED.evidence_count,
    last_observed_at = EXCLUDED.last_observed_at,
    evidence = public.knowledge_candidates.evidence || EXCLUDED.evidence,
    updated_at = now();
  candidate_count := candidate_count + 1;

  FOR rejection_record IN
    SELECT
      COALESCE(NULLIF(ar.status, ''), 'unknown') AS outcome,
      count(*)::integer AS occurrences
    FROM public.authorization_requests ar
    WHERE ar.created_at >= window_start
      AND lower(COALESCE(ar.status, '')) IN ('rejected', 'declined', 'cancelled')
    GROUP BY COALESCE(NULLIF(ar.status, ''), 'unknown')
    ORDER BY occurrences DESC
  LOOP
    source_record := jsonb_build_object(
      'window_start', window_start,
      'outcome', rejection_record.outcome,
      'occurrences', rejection_record.occurrences
    );

    INSERT INTO public.learning_events(event_type, source, subject_key, payload)
    VALUES ('outcome_pattern', 'authorization_requests', 'outcome:' || rejection_record.outcome, source_record);

    INSERT INTO public.knowledge_candidates(
      title, summary, category, evidence_count, confidence,
      first_observed_at, last_observed_at, evidence
    )
    VALUES (
      format('Authorization outcome: %s', rejection_record.outcome),
      format('%s authorization requests had outcome "%s" in the learning window.',
        rejection_record.occurrences, rejection_record.outcome),
      'workflow',
      rejection_record.occurrences,
      LEAST(99, rejection_record.occurrences * 10),
      window_start,
      now(),
      jsonb_build_array(source_record)
    )
    ON CONFLICT (category, title) DO UPDATE SET
      summary = EXCLUDED.summary,
      evidence_count = public.knowledge_candidates.evidence_count + EXCLUDED.evidence_count,
      confidence = LEAST(99, GREATEST(public.knowledge_candidates.confidence, EXCLUDED.confidence)),
      last_observed_at = EXCLUDED.last_observed_at,
      evidence = public.knowledge_candidates.evidence || EXCLUDED.evidence,
      updated_at = now();
    candidate_count := candidate_count + 1;
  END LOOP;

  -- Stable observations become reference knowledge automatically. This never
  -- changes parser, chatbot, clinical, authorization, or security behavior.
  UPDATE public.knowledge_candidates
  SET status = 'approved',
      review_note = 'Automatically promoted from repeated observation; reference-only.',
      updated_at = now()
  WHERE status = 'candidate'
    AND category IN ('operational', 'workflow')
    AND evidence_count >= 25
    AND confidence >= 90;
  GET DIAGNOSTICS promoted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'window_start', window_start,
    'authorization_requests_observed', request_count,
    'whatsapp_messages_observed', whatsapp_count,
    'candidates_updated', candidate_count,
    'candidates_auto_promoted', promoted_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_learning_observation(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_learning_observation(interval) TO service_role;

COMMIT;
