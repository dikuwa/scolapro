begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('faec0000-0000-4000-8000-000000000001','aec-source-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','faec0000-0000-4000-8000-000000000001','school_admin',current_date);

select ok(
  not has_function_privilege('anon','public.build_school_operational_snapshot(uuid,integer,date)','EXECUTE'),
  'anonymous users cannot build statutory source snapshots'
);
select ok(
  has_function_privilege('authenticated','public.build_school_operational_snapshot(uuid,integer,date)','EXECUTE'),
  'authenticated callers reach the self-authorizing statutory source RPC'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','faec0000-0000-4000-8000-000000000001',true);
set local role authenticated;

create temporary table aec_snapshot on commit drop as
select public.build_school_operational_snapshot(
  '22222222-2222-4222-8222-222222222222',
  2026,
  date '2026-09-01'
) as data;

select is(
  (select jsonb_typeof(data #> '{learners,by_grade_and_sex}') from aec_snapshot),
  'array',
  'statutory source snapshot exposes a grade-by-sex learner array'
);

select is(
  (select jsonb_array_length(data #> '{learners,by_grade_and_sex}') from aec_snapshot),
  (select count(*)::integer from public.grades where school_id='22222222-2222-4222-8222-222222222222' and academic_year=2026),
  'grade-by-sex source contains one row for every configured grade'
);

select is(
  (select coalesce(sum((item->>'total')::integer),0)::integer from aec_snapshot cross join lateral jsonb_array_elements(data #> '{learners,by_grade_and_sex}') item),
  (select (data #>> '{learners,total}')::integer from aec_snapshot),
  'grade-by-sex totals reconcile to the authoritative learner total'
);
select is(
  (select coalesce(sum((item->>'female')::integer),0)::integer from aec_snapshot cross join lateral jsonb_array_elements(data #> '{learners,by_grade_and_sex}') item),
  (select (data #>> '{learners,female}')::integer from aec_snapshot),
  'grade female counts reconcile to the authoritative female learner total'
);
select is(
  (select coalesce(sum((item->>'male')::integer),0)::integer from aec_snapshot cross join lateral jsonb_array_elements(data #> '{learners,by_grade_and_sex}') item),
  (select (data #>> '{learners,male}')::integer from aec_snapshot),
  'grade male counts reconcile to the authoritative male learner total'
);
select is(
  (select coalesce(sum((item->>'other_or_unspecified')::integer),0)::integer from aec_snapshot cross join lateral jsonb_array_elements(data #> '{learners,by_grade_and_sex}') item),
  (select (data #>> '{learners,other_or_unspecified}')::integer from aec_snapshot),
  'grade unspecified-sex counts reconcile to the authoritative unspecified learner total'
);

select is(
  (select coalesce(sum((item->>'learners')::integer),0)::integer from aec_snapshot cross join lateral jsonb_array_elements(data #> '{learners,by_grade}') item),
  (select (data #>> '{learners,total}')::integer from aec_snapshot),
  'legacy by-grade distribution now uses the same reference-date learner population'
);

select is(
  (select count(*)::integer
   from aec_snapshot
   cross join lateral jsonb_array_elements(data #> '{learners,by_grade_and_sex}') item
   where (item->>'total')::integer <>
     (item->>'female')::integer + (item->>'male')::integer + (item->>'other_or_unspecified')::integer),
  0,
  'every grade row reconciles female plus male plus unspecified to total'
);

select is(
  (select count(*)::integer
   from aec_snapshot
   cross join lateral jsonb_array_elements(data #> '{learners,by_grade_and_sex}') item
   left join public.grades g
     on g.id=(item->>'grade_id')::uuid
    and g.school_id='22222222-2222-4222-8222-222222222222'
    and g.academic_year=2026
   where g.id is null or item->>'grade_code'<>g.grade_code),
  0,
  'statutory source preserves ScolaPro grade identity instead of hard-coding Ministry AEC codes'
);

reset role;
select * from finish();
rollback;
