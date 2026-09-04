begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('f9800000-0000-4000-8000-000000000001','official-hod@example.test','authenticated','authenticated',now(),now()),
  ('f9800000-0000-4000-8000-000000000002','official-other@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(id,tenant_id,school_id,user_id,role_key,active_from)
values('f9810000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9800000-0000-4000-8000-000000000001','hod',current_date-10);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values('f9820000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','OFF-FINAL','Official Finality','active');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
values('f9830000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'f9820000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active');

select ok(
  not has_function_privilege('authenticated','app_private.enforce_official_result_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_official_result_integrity()','EXECUTE'),
  'official-result integrity helper is private'
);

select trigger_is('public','official_results','official_result_integrity_trg','app_private','enforce_official_result_integrity','official-result integrity trigger is installed');

select ok(
  has_table_privilege('authenticated','public.official_results','SELECT')
  and not has_table_privilege('authenticated','public.official_results','INSERT')
  and not has_table_privilege('authenticated','public.official_results','UPDATE')
  and not has_table_privilege('authenticated','public.official_results','DELETE'),
  'authenticated clients remain read-only on official results'
);

select throws_ok(
  $$insert into public.official_results(tenant_id,school_id,academic_year,enrolment_id,learner_id,subject_offering_id,term_number,result_value,symbol,assessment_scheme_key,assessment_scheme_version,approved_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','f9830000-0000-4000-8000-000000000001',1,74,'A','OFFICIAL','1','f9800000-0000-4000-8000-000000000002')$$,
  'Official result approver is not authorized for school',
  'trusted write cannot credit an unrelated approver'
);

select throws_ok(
  $$insert into public.official_results(tenant_id,school_id,academic_year,enrolment_id,learner_id,subject_offering_id,term_number,result_value,symbol,assessment_scheme_key,assessment_scheme_version,approved_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','f9830000-0000-4000-8000-000000000001',1,74,'A','OFFICIAL','1','f9800000-0000-4000-8000-000000000001')$$,
  'Official result scope mismatch: enrolment identity differs',
  'official result learner identity must match enrolment'
);

select throws_ok(
  $$insert into public.official_results(tenant_id,school_id,academic_year,enrolment_id,learner_id,subject_offering_id,term_number,result_value,symbol,assessment_scheme_key,assessment_scheme_version,approved_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2025,'60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','f9830000-0000-4000-8000-000000000001',1,74,'A','OFFICIAL','1','f9800000-0000-4000-8000-000000000001')$$,
  'Official result scope mismatch: enrolment identity differs',
  'official result academic year must match enrolment and subject offering'
);

select lives_ok(
  $$insert into public.official_results(id,tenant_id,school_id,academic_year,enrolment_id,learner_id,subject_offering_id,term_number,result_value,symbol,assessment_scheme_key,assessment_scheme_version,calculation_snapshot,approved_by_user_id)
    values('f9840000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','f9830000-0000-4000-8000-000000000001',1,74,'A','OFFICIAL','1','{"source":"test"}'::jsonb,'f9800000-0000-4000-8000-000000000001')$$,
  'authorized academic leader can be preserved as official-result approver'
);

select lives_ok(
  $$update public.official_results set published_at=now() where id='f9840000-0000-4000-8000-000000000001'$$,
  'publication timestamp remains available for a separate governed publication lifecycle'
);

select throws_ok(
  $$update public.official_results set result_value=75 where id='f9840000-0000-4000-8000-000000000001'$$,
  'Official result calculation and approval provenance are immutable',
  'locked official result calculation cannot be rewritten'
);

select throws_ok(
  $$delete from public.official_results where id='f9840000-0000-4000-8000-000000000001'$$,
  'Official result cannot be deleted; use governed correction workflow',
  'official result cannot be erased after approval'
);

select * from finish();
rollback;
