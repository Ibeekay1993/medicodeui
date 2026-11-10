BEGIN;

-- Strip only common honorifics at the beginning of the supplied name, then
-- compare the complete order-insensitive token set. A policy-scoped name
-- subset is not sufficient evidence to identify one dependant.
CREATE OR REPLACE FUNCTION public.normalize_whatsapp_identity_name(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $func$
  WITH cleaned AS (
    SELECT regexp_replace(
      regexp_replace(lower(trim(coalesce(_name, ''))), '[^[:alnum:]]+', ' ', 'g'),
      '^((mr|mrs|miss|ms|dr|prof|professor)[[:space:]]+)+',
      '',
      'g'
    ) AS value
  )
  SELECT coalesce(string_agg(token, ' ' ORDER BY token), '')
  FROM cleaned,
       regexp_split_to_table(cleaned.value, '[[:space:]]+') AS t(token)
  WHERE token <> '';
$func$;

CREATE OR REPLACE FUNCTION public.match_whatsapp_identity_name(
  _submitted_name text,
  _db_name text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $func$
  SELECT public.normalize_whatsapp_identity_name(_submitted_name) <> ''
     AND public.normalize_whatsapp_identity_name(_submitted_name)
         = public.normalize_whatsapp_identity_name(_db_name);
$func$;

REVOKE ALL ON FUNCTION public.normalize_whatsapp_identity_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_whatsapp_identity_name(text) TO service_role, postgres;
REVOKE ALL ON FUNCTION public.match_whatsapp_identity_name(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_whatsapp_identity_name(text, text) TO service_role, postgres;

COMMIT;
