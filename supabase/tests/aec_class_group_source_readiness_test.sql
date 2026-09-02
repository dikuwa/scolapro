begin;

select plan(16);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('face0000-0000-4000-8000-000000000001','aec-class-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','face0000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.learners(id,tenant_id,first_names,surname,sex) values
  ('face1000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Unassigned','Both','female'),
  ('face1000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Unassigned','Class','male');

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,grade_id,register_class_id,admission_number,enrolled_from,status
) values
  ('face2000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','face1000-0000-4000-8000-000000000001',2026,null,null,'AEC-GAP-1','2026-01-01','current'),
  ('face2000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','face1000-0000-4000-8000-000000000002',2026,'30000000-0000-4000-8000-000000000008',null,'AEC-GAP-2','2026-01-01','current');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','face0000-0000-4000-8000-000000000001',true);
set local role authenticated;

create temporary table aec_class_snapshot on commit drop as
select public.build_school_operational_snapshot(
  '22222222-2222-4222-8222-222222222222',
  2026,
  date '2026-09-01'
) as data;

select is(
  (select jsonb_typeof(data #> '{learners,by_class_and_sex}') from aec_class_snapshot),
  'array',
  'statutory source snapshot exposes class-group learner counts by sex'
);
select is(
  (select jsonb_array_length(data #> '{learners,by_class_and_sex}') from aec_class_snapshot),
  (select count(*)::integer from public.register_classes where school_id='22222222-2222-4222-8222-222222222222' and academic_year=2026),
  'class-group source contains one row for every configured register class'
);
select is(
  (select count(*)::integer
   from aec_class_snapshot
   cross join lateral jsonb_array_elements(data #> '{learners,by_class_and_sex}') item
   where (item->>'total')::integer <>
     (item->>'female')::integer + (item->>'male')::integer + (item->>'other_or_unspecified')::integer),
  0,
  'every class-group row reconciles female plus male plus unspecified to total'
);
select is(
  (select count(*)::integer
   from aec_class_snapshot
   cross join lateral jsonb_array_elements(data #> '{learners,by_class_and_sex}') item
   left join public.register_classes rc on rc.id=(item->>'class_id')::uuid
   left join public.grades g on g.id=rc.grade_id
   where rc.id is null
      or item->>'class_code'<>rc.class_code
      or (item->>'grade_id')::uuid<>g.id
      or item->>'grade_code'<>g.grade_code),
  0,
  'class-group source preserves configured class and grade identity'
);

select is(
  (select (data #>> '{learners,assignment_gaps,unassigned_grade,total}')::integer from aec_class_snapshot),
  1,
  'unassigned-grade source exposes the deliberately ungraded learner'
);
select is(
  (select (data #>> '{learners,assignment_gaps,unassigned_grade,female}')::integer from aec_class_snapshot),
  1,
  'unassigned-grade source preserves learner sex'
);
select is(
  (select (data #>> '{learners,assignment_gaps,unassigned_register_class,total}')::integer from aec_class_snapshot),
  2,
  'unassigned-class source exposes both deliberately unassigned learners'
);
select is(
  (select (data #>> '{learners,assignment_gaps,unassigned_register_class,male}')::integer from aec_class_snapshot),
  1,
  'unassigned-class source includes the graded male learner without a class'
);
select is(
  (select (data #>> '{learners,assignment_gaps,unassigned_register_class,female}')::integer from aec_class_snapshot),
  1,
  'unassigned-class source includes the ungraded female learner without a class'
);

select is(
  (select coalesce(sum((item->>'total')::integer),0)::integer
   from aec_class_snapshot cross join lateral jsonb_array_elements(data #> '{learners,by_class_and_sex}') item)
  + (select (data #>> '{learners,assignment_gaps,unassigned_register_class,total}')::integer from aec_class_snapshot),
  (select (data #>> '{learners,total}')::integer from aec_class_snapshot),
  'class-group totals plus explicit unassigned-class count reconcile to authoritative learner total'
);
select is(
  (select coalesce(sum((item->>'female')::integer),0)::integer
   from aec_class_snapshot cross join lateral jsonb_array_elements(data #> '{learners,by_class_and_sex}') item)
  + (select (data #>> '{learners,assignment_gaps,unassigned_register_class,female}')::integer from aec_class_snapshot),
  (select (data #>> '{learners,female}')::integer from aec_class_snapshot),
  'class female counts plus unassigned-class female count reconcile to authoritative female total'
);
select is(
  (select coalesce(sum((item->>'male')::integer),0)::integer
   from aec_class_snapshot cross join lateral jsonb_array_elements(data #> '{learners,by_class_and_sex}') item)
  + (select (data #>> '{learners,assignment_gaps,unassigned_register_class,male}')::integer from aec_class_snapshot),
  (select (data #>> '{learners,male}')::integer from aec_class_snapshot),
  'class male counts plus unassigned-class male count reconcile to authoritative male total'
);

select is(
  (select coalesce(sum((item->>'total')::integer),0)::integer
   from aec_class_snapshot cross join lateral jsonb_array_elements(data #> '{learners,by_grade_and_sex}') item)
  + (select (data #>> '{learners,assignment_gaps,unassigned_grade,total}')::integer from aec_class_snapshot),
  (select (data #>> '{learners,total}')::integer from aec_class_snapshot),
  'grade totals plus explicit unassigned-grade count reconcile to authoritative learner total'
);
select is(
  (select coalesce(sum((item->>'female')::integer),0)::integer
   from aec_class_snapshot cross join lateral jsonb_array_elements(data #> '{learners,by_grade_and_sex}') item)
  + (select (data #>> '{learners,assignment_gaps,unassigned_grade,female}')::integer from aec_class_snapshot),
  (select (data #>> '{learners,female}')::integer from aec_class_snapshot),
  'grade female counts plus unassigned-grade female count reconcile to authoritative female total'
);
select is(
  (select coalesce(sum((item->>'male')::integer),0)::integer
   from aec_class_snapshot cross join lateral jsonb_array_elements(data #> '{learners,by_grade_and_sex}') item)
  + (select (data #>> '{learners,assignment_gaps,unassigned_grade,male}')::integer from aec_class_snapshot),
  (select (data #>> '{learners,male}')::integer from aec_class_snapshot),
  'grade male counts plus unassigned-grade male count reconcile to authoritative male total'
);

select is(
  (select coalesce(sum((item->>'learners')::integer),0)::integer
   from aec_class_snapshot cross join lateral jsonb_array_elements(data #> '{learners,by_class}') item)
  + (select (data #>> '{learners,assignment_gaps,unassigned_register_class,total}')::integer from aec_class_snapshot),
  (select (data #>> '{learners,total}')::integer from aec_class_snapshot),
  'legacy class distribution remains consistent with the class assignment-gap contract'
);

reset role;
select * from finish();
rollback;
