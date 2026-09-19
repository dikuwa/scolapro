begin;
select plan(8);

select has_column('public','profile_change_requests','source_category','correction requests record the source category');
select has_column('public','profile_change_requests','evidence_reference','correction requests retain optional evidence references');
select ok(
  exists(
    select 1
    from pg_constraint
    where conrelid='public.profile_change_requests'::regclass
      and conname='profile_change_requests_source_category_check'
      and contype='c'
      and pg_get_constraintdef(oid) like '%source_category%'
  ),
  'source categories are bounded by a database check constraint'
);
select has_function('public','submit_profile_change_request',
  ARRAY['uuid','text','uuid','text','text','text','text','text']::text[],
  'canonical submit RPC accepts source and evidence metadata');
select has_function('app_private','is_current_guardian_user_for_learner',
  ARRAY['uuid','uuid','uuid']::text[],
  'current effective guardian helper exists');
select has_function('public','cancel_profile_change_request',ARRAY['uuid']::text[],
  'canonical requester cancellation remains available');
select ok(to_regclass('public.profile_change_requests') is not null,
  'intake uses the canonical profile_change_requests table');
select ok(to_regclass('public.correction_requests') is null,
  'no second correction table exists');

select * from finish();
rollback;
