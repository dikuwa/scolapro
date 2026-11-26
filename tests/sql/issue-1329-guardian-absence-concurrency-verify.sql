\set ON_ERROR_STOP on
DO $$
BEGIN
  IF (SELECT count(*) FROM public.issue_1329_guardian_absence_results) <> 2 THEN
    RAISE EXCEPTION 'Expected two concurrent submission outcomes';
  END IF;
  IF (SELECT count(*) FROM public.issue_1329_guardian_absence_results WHERE outcome='accepted') <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one concurrent submission winner';
  END IF;
  IF (SELECT count(*) FROM public.issue_1329_guardian_absence_results WHERE outcome='duplicate_rejected') <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one database duplicate rejection';
  END IF;
  IF (SELECT count(*) FROM public.guardian_absence_notices WHERE learner_id='73000000-0000-4000-8000-000000001331') <> 1 THEN
    RAISE EXCEPTION 'Concurrent submissions created more than one notice';
  END IF;
  IF (SELECT count(*) FROM public.guardian_absence_notice_events WHERE notice_id IN (SELECT id FROM public.guardian_absence_notices WHERE learner_id='73000000-0000-4000-8000-000000001331')) <> 1 THEN
    RAISE EXCEPTION 'Loser transaction left notice event history behind';
  END IF;
  IF (SELECT count(*) FROM public.audit_events WHERE entity_type='guardian_absence_notice' AND entity_id IN (SELECT id FROM public.guardian_absence_notices WHERE learner_id='73000000-0000-4000-8000-000000001331')) <> 1 THEN
    RAISE EXCEPTION 'Loser transaction left audit history behind';
  END IF;
  RAISE NOTICE 'GUARDIAN_ABSENCE_CONCURRENCY_SERIALIZED_AT_DATABASE_BOUNDARY';
END $$;
DROP TABLE public.issue_1329_guardian_absence_results;
