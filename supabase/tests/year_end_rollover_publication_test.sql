begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fa000000-0000-4000-8000-000000000001','rollover-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa000000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.academic_years(id,tenant_id,school_id,year,status,starts_on,ends_on)
values('fa100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2027,'setup','2027-01-13','2027-12-03')
on conflict (school_id,year) do nothing;

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name)
values('fa200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2027,'G11','Grade 11');

insert into public.register_classes(id,tenant_id,school_id,grade_id,academic_year,class_code,display_name)
values('fa300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa200000-0000-4000-8000-000000000001',2027,'11A','11A');

insert into public.year_end_progressions(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,source_grade_id,
  destination_grade_code,outcome,rule_set_key,rule_set_version,rationale,status,
  decided_by_user_id,decided_at,locked_at
) values(
  'fa400000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  2026,
  '30000000-0000-4000-8000-000000000010',
  'G11',
  'promoted',
  'TEST_RULES',
  'v1',
  '{"recommendation":"promoted"}'::jsonb,
  'locked',
  'fa000000-0000-4000-8000-000000000001',
  now(),
  now()
);

select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$select public.publish_year_end_progression('fa400000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000001','2026-12-04')$$,
  'school admin can publish a locked progression into configured next-year structure'
);

select is(
  (select count(*)::integer from public.year_end_progression_publications where progression_id='fa400000-0000-4000-8000-000000000001'),
  1,
  'one immutable publication receipt is recorded'
);

select is(
  (select academic_year from public.enrolments where id=(select destination_enrolment_id from public.year_end_progression_publications where progression_id='fa400000-0000-4000-8000-000000000001')),
  2027,
  'publication creates the next academic-year enrolment'
);

select is(
  (select grade_id from public.enrolments where id=(select destination_enrolment_id from public.year_end_progression_publications where progression_id='fa400000-0000-4000-8000-000000000001')),
  'fa200000-0000-4000-8000-000000000001'::uuid,
  'next-year enrolment uses the configured destination grade'
);

select is(
  (select register_class_id from public.enrolments where id=(select destination_enrolment_id from public.year_end_progression_publications where progression_id='fa400000-0000-4000-8000-000000000001')),
  'fa300000-0000-4000-8000-000000000001'::uuid,
  'next-year enrolment uses the explicitly selected destination class'
);

select is(
  (select status from public.enrolments where id='60000000-0000-4000-8000-000000000001'),
  'completed',
  'source academic-year enrolment is closed after rollover publication'
);

select is(
  (select public.publish_year_end_progression('fa400000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000001','2026-12-04')),
  (select id from public.year_end_progression_publications where progression_id='fa400000-0000-4000-8000-000000000001'),
  'repeat publication is idempotent and returns the existing receipt'
);

select throws_ok(
  $$update public.year_end_progression_publications set effective_on='2026-12-05' where progression_id='fa400000-0000-4000-8000-000000000001'$$,
  'Year-end progression publications are immutable',
  'published rollover provenance cannot be rewritten'
);

select is(
  (select count(*)::integer from public.audit_events where event_type='progression.published' and metadata->>'progression_id'='fa400000-0000-4000-8000-000000000001'),
  1,
  'rollover publication is audited exactly once'
);

select * from finish();
rollback;