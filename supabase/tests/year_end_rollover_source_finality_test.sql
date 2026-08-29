begin;

select plan(4);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fc000000-0000-4000-8000-000000000001','rollover-finality-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.year_end_progressions(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,source_grade_id,
  destination_grade_code,outcome,rule_set_key,rule_set_version,rationale,status,
  decided_by_user_id,decided_at,locked_at
) values(
  'fc100000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000002',
  '60000000-0000-4000-8000-000000000002',
  2026,
  '30000000-0000-4000-8000-000000000010',
  'G11','promoted','TEST_RULES','v1','{"recommendation":"promoted"}'::jsonb,
  'locked','fc000000-0000-4000-8000-000000000001',now(),now()
);

-- Simulate a competing governed exit that already closed the learner's source
-- enrolment after the progression decision was locked but before rollover publish.
update public.enrolments
set status='transferred', enrolled_to=current_date, updated_at=now()
where id='60000000-0000-4000-8000-000000000002';

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select throws_ok(
  $$select public.publish_year_end_progression('fc100000-0000-4000-8000-000000000001',null,'2026-12-04')$$,
  'Only a current source enrolment can be published into year-end rollover',
  'rollover cannot create a next-year enrolment after the source learner already exited'
);

select is(
  (select count(*)::integer from public.year_end_progression_publications where progression_id='fc100000-0000-4000-8000-000000000001'),
  0,
  'failed rollover does not create a publication receipt'
);

select is(
  (select count(*)::integer from public.enrolments where learner_id='50000000-0000-4000-8000-000000000002' and academic_year=2027),
  0,
  'failed rollover does not create a destination enrolment'
);

select ok(
  not has_function_privilege('authenticated','public.publish_year_end_progression_internal(uuid,uuid,date)','EXECUTE'),
  'authenticated clients cannot bypass the rollover source-state wrapper'
);

select * from finish();
rollback;