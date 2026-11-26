\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claim.sub','73000000-0000-4000-8000-000000001329',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
-- Give both clients a reliable overlap window before they perform the RPC.
SELECT pg_sleep(1);
SELECT set_config('issue.runner', :'runner', true);
DO $$
BEGIN
  PERFORM public.submit_guardian_absence_notice(
    '73000000-0000-4000-8000-000000001331', current_date, current_date, 'illness', 'Concurrent submission'
  );
  INSERT INTO public.issue_1329_guardian_absence_results(runner,outcome)
  VALUES (current_setting('issue.runner'), 'accepted');
EXCEPTION WHEN unique_violation THEN
  INSERT INTO public.issue_1329_guardian_absence_results(runner,outcome)
  VALUES (current_setting('issue.runner'), 'duplicate_rejected');
END $$;
COMMIT;
