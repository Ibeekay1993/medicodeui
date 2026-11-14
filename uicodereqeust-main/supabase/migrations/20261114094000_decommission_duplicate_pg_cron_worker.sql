-- ============================================================================
-- Migration: 20261114094000_decommission_duplicate_pg_cron_worker.sql
-- Purpose  : Remove redundant pg_cron job for whatsapp-worker.
--
-- Architecture Note:
-- The dedicated Hostinger VPS already executes /root/whatsapp_worker_cron.sh
-- with mutual exclusion (flock) via system crontab.
-- Having an internal PostgreSQL pg_cron job simultaneously calling the same
-- Edge Function endpoint creates redundant HTTP overhead, duplicate database
-- lock contention, and spikes VPS CPU.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-worker-poll') THEN
      PERFORM cron.unschedule('whatsapp-worker-poll');
      RAISE NOTICE 'Successfully unscheduled duplicate pg_cron job whatsapp-worker-poll.';
    END IF;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron unschedule skipped: %', SQLERRM;
END;
$$;

COMMIT;
