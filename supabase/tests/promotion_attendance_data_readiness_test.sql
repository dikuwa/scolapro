begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fc000000-0000-4000-8000-000000000001','promotion-attendance-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000001','school_admin','2026-01-01');

-- Narrow the seeded enrolment to prove a rule configuration cannot widen the
-- attendance evaluation beyond the learner's actual school membership period.
update public.enrolments
set enrolled_from='2026-02-02',enrolled_to='2026-02-03'
where id='60000000-0000-4000-8000-000000000001';

-- Promotion-rule versions are authored while draft, then activated. The fixture
-- follows the same lifecycle enforced in production instead of bypassing immutability.
insert into public.promotion_rule_sets(
  id,tenant_id,school_id,academic_year,grade_id,rule_set_key,version,result_term_number,
  pass_outcome,fail_outcome,source_reference,effective_from,status,created_by_user_id
) values(
  'fc100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  2026,'30000000-0000-4000-8000-000000000010','TEST-ATTENDANCE-READINESS','1',3,
  'promoted','not_promoted','Behavioral test only — not Namibia policy','2026-01-01','draft','fc000000-0000-4000-8000-000000000001'
);

insert into public.promotion_rule_conditions(
  id,tenant_id,school_id,promotion_rule_set_id,condition_code,condition_type,threshold,required,configuration,sort_order
) values(
  'fc200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fc100000-0000-4000-8000-000000000001','ATTENDANCE','minimum_attendance_rate',80,true,
  '{"starts_on":"2026-01-01","ends_on":"2026-12-31"}',1
);

update public.promotion_rule_sets
set status='active'
where id='fc100000-0000-4000-8000-000000000001';

-- Only one of the two expected enrolment days has a submitted register. The
-- missing day must not be treated as present.
insert into public.attendance_register_submissions(
  id,tenant_id,school_id,academic_year,register_class_id,attendance_date,default_status,recorded_by_user_id,recorded_at,source
) values(
  'fc300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  2026,'40000000-0000-4000-8000-00000000001a','2026-02-02','present','fc000000-0000-4000-8000-000000000001',now(),'online'
);

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

create temporary table promotion_attendance_result(result jsonb) on commit drop;
insert into promotion_attendance_result
select public.evaluate_promotion_recommendation(
  '60000000-0000-4000-8000-000000000001',
  'fc100000-0000-4000-8000-000000000001'
);

select is((select result#>>'{checks,0,evaluation_starts_on}' from promotion_attendance_result),'2026-02-02','attendance evaluation starts at the learner enrolment boundary, not the wider rule date');
select is((select result#>>'{checks,0,evaluation_ends_on}' from promotion_attendance_result),'2026-02-03','attendance evaluation ends at the learner enrolment boundary, not the wider rule date');
select is((select (result#>>'{checks,0,expected_school_days}')::integer from promotion_attendance_result),2,'promotion attendance expects both school days inside the clamped enrolment interval');
select is((select (result#>>'{checks,0,recorded_school_days}')::integer from promotion_attendance_result),1,'promotion attendance counts only actually submitted daily registers');
select is((select (result#>>'{checks,0,missing_register_days}')::integer from promotion_attendance_result),1,'promotion attendance exposes missing register coverage explicitly');
select is((select (result#>>'{checks,0,register_coverage_complete}')::boolean from promotion_attendance_result),false,'incomplete daily-register coverage is never marked complete');
select is((select result->>'attendance_rate' from promotion_attendance_result),null,'attendance rate stays unknown when register evidence is incomplete instead of manufacturing 100 percent');
select ok((select result->'failures' @> '[{"code":"ATTENDANCE","type":"data_readiness","reason":"incomplete_attendance_register"}]'::jsonb from promotion_attendance_result),'incomplete attendance evidence is an explicit data-readiness failure');
select is((select result->>'passed' from promotion_attendance_result),'false','required attendance rule fails safely while its evidence is incomplete');

select * from finish();
rollback;
