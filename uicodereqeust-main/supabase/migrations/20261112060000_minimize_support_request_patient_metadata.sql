BEGIN;

-- The helper is only an internal RPC dependency. Keep its result to link
-- identifiers; support request details stay on authorization_requests and are
-- fetched only when an authorized user opens the linked request.
CREATE OR REPLACE FUNCTION public.request_support_ticket_metadata(_request_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'request_uuid', ar.id,
    'request_reference', COALESCE(ar.authorization_code, ar.request_id, ar.id::text),
    'authorization_code', ar.authorization_code
  ))
  FROM public.authorization_requests AS ar
  WHERE ar.id = _request_id;
$$;

REVOKE ALL ON FUNCTION public.request_support_ticket_metadata(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_support_ticket_metadata(uuid)
  TO service_role;

-- Prevent old or stale application bundles from copying patient details into
-- support_conversations.request_metadata when a request is linked.
CREATE OR REPLACE FUNCTION public.minimize_linked_support_request_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF COALESCE(NEW.ticket_type, '') = 'request_support'
     OR NEW.linked_request_id IS NOT NULL THEN
    NEW.request_metadata := jsonb_strip_nulls(jsonb_build_object(
      'request_uuid', COALESCE(
        NEW.linked_request_id::text,
        NULLIF(NEW.request_metadata ->> 'request_uuid', '')
      ),
      'request_id', NULLIF(NEW.request_metadata ->> 'request_id', ''),
      'request_reference', COALESCE(
        NULLIF(NEW.request_reference, ''),
        NULLIF(NEW.request_metadata ->> 'request_reference', '')
      )
    ));
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.minimize_linked_support_request_metadata()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minimize_linked_support_request_metadata()
  TO service_role;

DROP TRIGGER IF EXISTS minimize_linked_support_request_metadata
  ON public.support_conversations;
DROP TRIGGER IF EXISTS minimize_linked_support_request_metadata_insert
  ON public.support_conversations;
DROP TRIGGER IF EXISTS minimize_linked_support_request_metadata_update
  ON public.support_conversations;
CREATE TRIGGER minimize_linked_support_request_metadata_insert
  BEFORE INSERT ON public.support_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.minimize_linked_support_request_metadata();
CREATE TRIGGER minimize_linked_support_request_metadata_update
  BEFORE UPDATE OF linked_request_id, request_reference, request_metadata, ticket_type
  ON public.support_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.minimize_linked_support_request_metadata();

-- Remove patient-identifying and clinical data already duplicated into the
-- request metadata while retaining the identifiers needed to resolve legacy
-- support links.
UPDATE public.support_conversations AS sc
SET request_metadata = jsonb_strip_nulls(jsonb_build_object(
  'request_uuid', COALESCE(
    sc.linked_request_id::text,
    NULLIF(sc.request_metadata ->> 'request_uuid', '')
  ),
  'request_id', NULLIF(sc.request_metadata ->> 'request_id', ''),
  'request_reference', COALESCE(
    NULLIF(sc.request_reference, ''),
    NULLIF(sc.request_metadata ->> 'request_reference', '')
  )
))
WHERE (sc.ticket_type = 'request_support' OR sc.linked_request_id IS NOT NULL)
  AND sc.request_metadata <> '{}'::jsonb;

COMMIT;
