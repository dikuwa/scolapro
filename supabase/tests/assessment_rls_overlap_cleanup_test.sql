begin;

select plan(14);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public'
     and tablename='assessment_components'
     and policyname='academic leaders can manage assessment components'),
  0,
  'stale assessment-components ALL policy is removed'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public'
     and tablename='assessment_scheme_candidates'
     and policyname='academic leaders can manage assessment scheme candidates'),
  0,
  'stale assessment-scheme-candidates ALL policy is removed'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public'
     and tablename='assessment_schemes'
     and policyname='academic leaders can manage assessment schemes'),
  0,
  'stale assessment-schemes ALL policy is removed'
);

select is(
  (select cmd from pg_policies
   where schemaname='public'
     and tablename='assessment_components'
     and policyname='academic staff can read assessment components'),
  'SELECT',
  'assessment-components dedicated read policy remains authoritative'
);

select is(
  (select cmd from pg_policies
   where schemaname='public'
     and tablename='assessment_scheme_candidates'
     and policyname='academic staff can read assessment scheme candidates'),
  'SELECT',
  'assessment-scheme-candidates dedicated read policy remains authoritative'
);

select is(
  (select cmd from pg_policies
   where schemaname='public'
     and tablename='assessment_schemes'
     and policyname='academic staff can read assessment schemes'),
  'SELECT',
  'assessment-schemes dedicated read policy remains authoritative'
);

select is(
  (select cmd from pg_policies
   where schemaname='public'
     and tablename='assessment_schemes'
     and policyname='academic leaders can manage assessment schemes [insert]'),
  'INSERT',
  'creator-bound assessment-scheme INSERT policy remains'
);

select ok(
  (select with_check from pg_policies
   where schemaname='public'
     and tablename='assessment_schemes'
     and policyname='academic leaders can manage assessment schemes [insert]')
    ilike '%created_by_user_id%auth.uid%',
  'assessment-scheme INSERT still binds creator to authenticated actor'
);

select is(
  (select string_agg(cmd, ',' order by cmd)
   from pg_policies
   where schemaname='public'
     and tablename='assessment_components'
     and policyname like 'academic leaders can manage assessment components [%'),
  'DELETE,INSERT,UPDATE',
  'assessment-components management policy is write-only by command'
);

select is(
  (select string_agg(cmd, ',' order by cmd)
   from pg_policies
   where schemaname='public'
     and tablename='assessment_scheme_candidates'
     and policyname like 'academic leaders can manage assessment scheme candidates [%'),
  'DELETE,INSERT,UPDATE',
  'assessment-scheme-candidates management policy is write-only by command'
);

select is(
  (select string_agg(cmd, ',' order by cmd)
   from pg_policies
   where schemaname='public'
     and tablename='assessment_schemes'
     and policyname in (
       'academic leaders can manage assessment schemes [update]',
       'academic leaders can manage assessment schemes [delete]'
     )),
  'DELETE,UPDATE',
  'assessment-schemes broad management authority is update/delete only'
);

select ok(
  (select bool_and(
      coalesce(qual,'') ilike '%can_manage_current_assessment_school%'
      or coalesce(with_check,'') ilike '%can_manage_current_assessment_school%'
    )
   from pg_policies
   where schemaname='public'
     and tablename='assessment_components'
     and policyname like 'academic leaders can manage assessment components [%'),
  'assessment-components write policies preserve current-school management authority'
);

select ok(
  (select bool_and(
      coalesce(qual,'') ilike '%can_manage_current_assessment_school%'
      or coalesce(with_check,'') ilike '%can_manage_current_assessment_school%'
    )
   from pg_policies
   where schemaname='public'
     and tablename='assessment_scheme_candidates'
     and policyname like 'academic leaders can manage assessment scheme candidates [%'),
  'assessment-scheme-candidates write policies preserve current-school management authority'
);

select ok(
  (select bool_and(
      coalesce(qual,'') ilike '%can_manage_current_assessment_school%'
      or coalesce(with_check,'') ilike '%can_manage_current_assessment_school%'
    )
   from pg_policies
   where schemaname='public'
     and tablename='assessment_schemes'
     and policyname in (
       'academic leaders can manage assessment schemes [update]',
       'academic leaders can manage assessment schemes [delete]'
     )),
  'assessment-schemes update/delete preserve current-school management authority'
);

select * from finish();
rollback;
