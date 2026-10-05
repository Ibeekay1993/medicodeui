BEGIN;

-- The replacement function loads ~75k validated rows and rebuilds several
-- indexes in one atomic transaction. Give only this function a longer budget;
-- keep the authenticated API role's 8-second limit for every other request.
ALTER FUNCTION public.replace_nhis_beneficiaries(uuid)
  SET statement_timeout = '120s';

COMMIT;
