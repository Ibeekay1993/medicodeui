BEGIN;

DO $$
BEGIN
  IF public.normalize_whatsapp_beneficiary_number(' 1639554 - 01 ') <> '1639554-1' THEN
    RAISE EXCEPTION 'Member identifiers must ignore formatting and zero-padded dependant suffixes';
  END IF;

  IF public.normalize_whatsapp_beneficiary_number('OY/0001/P') <> 'OY0001P' THEN
    RAISE EXCEPTION 'Member identifiers must normalize separators consistently';
  END IF;

  IF NOT public.match_whatsapp_identity_name('MR. JANE DOE', 'DOE, JANE') THEN
    RAISE EXCEPTION 'Name matching should ignore common titles, punctuation, and token order';
  END IF;

  IF NOT public.match_whatsapp_identity_name('PROF. JANE MARIE DOE', 'DOE JANE MARIE') THEN
    RAISE EXCEPTION 'Name matching should allow order changes when all name components agree';
  END IF;

  IF public.match_whatsapp_identity_name('JANE DOE', 'JANE MARIE DOE') THEN
    RAISE EXCEPTION 'A missing middle name must not be omitted from identity evidence';
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
