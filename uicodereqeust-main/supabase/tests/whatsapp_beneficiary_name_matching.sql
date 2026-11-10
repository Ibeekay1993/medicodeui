BEGIN;

DO $$
BEGIN
  IF NOT public.match_whatsapp_identity_name('JANE MARIE DOE', 'DOE JANE') THEN
    RAISE EXCEPTION 'Name matching should allow order changes and an added middle name';
  END IF;

  IF NOT public.match_whatsapp_identity_name('DOE JANE', 'JANE MARIE DOE') THEN
    RAISE EXCEPTION 'Name matching should allow an omitted middle name';
  END IF;

  IF public.match_whatsapp_identity_name('JANE DOE', 'JANE SMITH') THEN
    RAISE EXCEPTION 'Name matching must reject different core names';
  END IF;

  IF public.match_whatsapp_identity_name('JANE', 'JANE MARIE') THEN
    RAISE EXCEPTION 'A single submitted token must not match a multi-token name';
  END IF;

  IF public.match_whatsapp_identity_name('', 'JANE DOE') THEN
    RAISE EXCEPTION 'An empty submitted name must never match';
  END IF;
END;
$$;

ROLLBACK;
