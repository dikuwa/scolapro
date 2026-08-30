begin;

select plan(19);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fb000000-0000-4000-8000-000000000001','promotion-test-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb000000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('fb200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Promotion Boundary School','PROMO002','Erongo','Walvis Bay');

insert into public.academic_years(id,tenant_id,school_id,year,status,starts_on,ends_on)
values
  ('fb210000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2027,'setup','2027-01-15','2027-12-10'),
  ('fb210000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fb200000-0000-4000-8000-000000000001',2027,'setup','2027-01-15','2027-12-10');

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name)
select
  'fb220000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2027,
  grade_code,
  display_name
from public.grades
where id='30000000-0000-4000-8000-000000000010';

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name)
values
  ('fb220000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2027,'TEST-WRONG','Wrong destination grade'),
  ('fb220000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fb200000-0000-4000-8000-000000000001',2027,'OTHER-SCHOOL','Other school grade');

insert into public.register_classes(id,tenant_id,school_id,grade_id,academic_year,class_code,display_name)
values
  ('fb230000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb220000-0000-4000-8000-000000000001',2027,'ROLL-A','Rollover A'),
  ('fb230000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb220000-0000-4000-8000-000000000002',2027,'WRONG-A','Wrong Grade A'),
  ('fb230000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fb200000-0000-4000-8000-000000000001','fb220000-0000-4000-8000-000000000003',2027,'OTHER-A','Other School A');

insert into public.promotion_rule_sets(
  id,tenant_id,school_id,academic_year,grade_id,rule_set_key,version,result_term_number,pass_outcome,fail_outcome,source_reference,effective_from,status,created_by_user_id
)
values
  ('fb100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'30000000-0000-4000-8000-000000000010','TEST-CONFIGURED','1',3,'promoted','not_promoted','Behavioral test only — not Namibia policy',current_date-30,'active','fb000000-0000-4000-8000-000000000001'),
  ('fb100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'30000000-0000-4000-8000-000000000009','TEST-CROSS-GRADE','1',3,'promoted','not_promoted','Behavioral test only — not Namibia policy',current_date-30,'active','fb000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select is(
  public.evaluate_promotion_recommendation('60000000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000001')->>'passed',
  'false',
  'promotion evaluator fails safely when official results are absent'
);

select is(
  public.evaluate_promotion_recommendation('60000000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000001')->>'recommended_outcome',
  'not_promoted',
  'configured fail outcome is used rather than an inferred grade rule'
);

select ok(
  public.evaluate_promotion_recommendation('60000000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000001')->'failures' @> '[{"code":"no_official_results","type":"data_readiness"}]'::jsonb,
  'missing official results are exposed as an explicit data-readiness failure'
);

select lives_ok(
  $$select public.generate_year_end_progression('60000000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000001')$$,
  'progression generator records the explainable configured recommendation for review'
);

select throws_ok(
  $$select public.evaluate_promotion_recommendation('60000000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000002')$$,
  'Promotion rule set does not match enrolment scope',
  'promotion evaluator rejects a rule set for a different grade'
);

select lives_ok(
  $$select public.approve_year_end_progression((select id from public.year_end_progressions where enrolment_id='60000000-0000-4000-8000-000000000001'))$$,
  'reviewed progression is approved through the governed leader transition'
);

select is(
  (select status from public.year_end_progressions where enrolment_id='60000000-0000-4000-8000-000000000001'),
  'approved',
  'governed approval records approved status'
);

select throws_ok(
  $$update public.year_end_progressions set outcome='promoted' where enrolment_id='60000000-0000-4000-8000-000000000001'$$,
  'Approved progression decisions may only transition to locked',
  'approved progression content cannot be edited through ordinary SQL'
);

select lives_ok(
  $$select public.lock_year_end_progression((select id from public.year_end_progressions where enrolment_id='60000000-0000-4000-8000-000000000001'))$$,
  'approved progression can be locked by an authorized school administrator'
);

select is(
  (select status from public.year_end_progressions where enrolment_id='60000000-0000-4000-8000-000000000001'),
  'locked',
  'locking preserves the progression as an immutable terminal decision'
);

select throws_ok(
  $$select public.generate_year_end_progression('60000000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000001')$$,
  'Progression is already approved or locked and cannot be regenerated',
  'locked progression cannot be regenerated from later live rule/result state'
);

select throws_ok(
  $$delete from public.year_end_progressions where enrolment_id='60000000-0000-4000-8000-000000000001'$$,
  'Approved or locked progression decisions cannot be deleted',
  'locked progression cannot be deleted even through privileged direct SQL'
);

select throws_ok(
  $$select public.publish_year_end_progression((select id from public.year_end_progressions where enrolment_id='60000000-0000-4000-8000-000000000001'),'fb230000-0000-4000-8000-000000000003','2026-12-31')$$,
  'Destination register class does not match the next-year grade',
  'year-end rollover rejects a destination class belonging to another school'
);

select is(
  (select status from public.enrolments where id='60000000-0000-4000-8000-000000000001'),
  'current',
  'a rejected cross-school rollover leaves the authoritative source enrolment current'
);

select throws_ok(
  $$select public.publish_year_end_progression((select id from public.year_end_progressions where enrolment_id='60000000-0000-4000-8000-000000000001'),'fb230000-0000-4000-8000-000000000002','2026-12-31')$$,
  'Destination register class does not match the next-year grade',
  'year-end rollover rejects a same-school class for the wrong destination grade'
);

select is(
  (select count(*)::bigint from public.year_end_progression_publications where progression_id=(select id from public.year_end_progressions where enrolment_id='60000000-0000-4000-8000-000000000001')),
  0::bigint,
  'invalid destination attempts do not create a publication record'
);

select lives_ok(
  $$select public.publish_year_end_progression((select id from public.year_end_progressions where enrolment_id='60000000-0000-4000-8000-000000000001'),'fb230000-0000-4000-8000-000000000001','2026-12-31')$$,
  'locked progression publishes successfully into the configured next-year grade and class'
);

select ok(
  exists(
    select 1
    from public.enrolments
    where learner_id='50000000-0000-4000-8000-000000000001'
      and school_id='22222222-2222-4222-8222-222222222222'
      and academic_year=2027
      and grade_id='fb220000-0000-4000-8000-000000000001'
      and register_class_id='fb230000-0000-4000-8000-000000000001'
      and status='current'
  ),
  'valid rollover creates exactly scoped next-year enrolment state'
);

select is(
  (select status from public.enrolments where id='60000000-0000-4000-8000-000000000001'),
  'completed',
  'successful rollover closes the source enrolment without rewriting its history'
);

select * from finish();
rollback;
