begin;

select plan(9);

select ok(
  not has_table_privilege('authenticated','public.mark_submissions','INSERT'),
  'authenticated clients cannot forge mark-submission rows directly'
);
select ok(
  not has_table_privilege('authenticated','public.mark_submissions','UPDATE'),
  'authenticated clients cannot bypass mark-submission review transitions directly'
);
select ok(
  has_table_privilege('authenticated','public.mark_submissions','SELECT'),
  'authenticated clients retain RLS-scoped mark-submission reads'
);
select ok(
  not has_table_privilege('authenticated','public.official_results','INSERT'),
  'authenticated clients cannot forge authoritative official-result rows directly'
);
select ok(
  has_table_privilege('authenticated','public.official_results','SELECT'),
  'authenticated clients retain relationship-scoped official-result reads'
);

select is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='mark_submissions' and cmd='INSERT'),
  0,
  'no direct mark-submission INSERT RLS policy remains'
);
select is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='mark_submissions' and cmd='UPDATE'),
  0,
  'no direct mark-submission UPDATE RLS policy remains'
);
select is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='official_results' and cmd='INSERT'),
  0,
  'no direct official-result INSERT RLS policy remains'
);
select ok(
  has_function_privilege('authenticated','public.submit_assessment_for_review(uuid,text)','EXECUTE')
  and has_function_privilege('authenticated','public.review_mark_submission(uuid,text,text)','EXECUTE')
  and has_function_privilege('authenticated','public.approve_official_subject_result(uuid,uuid,smallint,uuid)','EXECUTE'),
  'governed submission, moderation and official-result RPC boundaries remain callable'
);

select * from finish();
rollback;
