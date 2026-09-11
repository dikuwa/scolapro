begin;

select plan(5);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fda00000-0000-4000-8000-000000000001','assessment-current-hod@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fda00000-0000-4000-8000-000000000001','hod',current_date-30);

insert into public.learners(id,tenant_id,first_names,surname,sex) values
('fda10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Current','Assessment Learner','unspecified'),
('fda10000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Ended','Assessment Learner','unspecified');

-- Isolate the seeded class population inside this transaction so submission
-- completeness proves the stale ended/status=current row is excluded.
update public.enrolments
set enrolled_to=current_date-1,
    status='current'
where school_id='22222222-2222-4222-8222-222222222222'
  and academic_year=2026
  and register_class_id='40000000-0000-4000-8000-00000000001a';

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,grade_id,register_class_id,
  admission_number,enrolled_from,enrolled_to,status
) values
('fda20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fda10000-0000-4000-8000-000000000001',2026,'30000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-00000000001a','CURRENT-ASSESS-001',current_date-10,null,'current'),
('fda20000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fda10000-0000-4000-8000-000000000002',2026,'30000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-00000000001a','ENDED-ASSESS-001',current_date-20,current_date-1,'current');

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values('fda30000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','CURR-ENR','Current Enrolment Assessment','active');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
values('fda40000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fda30000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',1,'active');

insert into public.assessment_schemes(
  id,tenant_id,school_id,subject_offering_id,scheme_key,version,capture_mode,
  effective_from,status,created_by_user_id
) values(
  'fda50000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fda40000-0000-4000-8000-000000000001','CURRENT-ENROL','1','detailed',current_date-30,'active','fda00000-0000-4000-8000-000000000001'
);

insert into public.assessment_components(
  id,tenant_id,school_id,assessment_scheme_id,component_code,display_name,
  component_type,raw_max,weight,contributes_to_report,required,sort_order
) values(
  'fda60000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fda50000-0000-4000-8000-000000000001','TEST','Undated Test','test',100,100,true,true,10
);

insert into public.assessment_instances(
  id,tenant_id,school_id,academic_year,assessment_scheme_id,assessment_component_id,
  subject_offering_id,register_class_id,term_number,display_name,assessment_date,
  raw_max,status,created_by_user_id
) values(
  'fda70000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
  'fda50000-0000-4000-8000-000000000001','fda60000-0000-4000-8000-000000000001','fda40000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-00000000001a',1,'Undated effective enrolment test',null,100,'open','fda00000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fda00000-0000-4000-8000-000000000001',true);

select throws_ok(
  $$insert into public.learner_marks(tenant_id,school_id,assessment_instance_id,enrolment_id,learner_id,numeric_mark,recorded_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fda70000-0000-4000-8000-000000000001','fda20000-0000-4000-8000-000000000002','fda10000-0000-4000-8000-000000000002',70,'fda00000-0000-4000-8000-000000000001')$$,
  'Learner mark scope mismatch: learner enrolment is not currently effective',
  'undated assessment denies an enrolment whose effective period already ended even when status remains current'
);

select lives_ok(
  $$insert into public.learner_marks(tenant_id,school_id,assessment_instance_id,enrolment_id,learner_id,numeric_mark,recorded_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fda70000-0000-4000-8000-000000000001','fda20000-0000-4000-8000-000000000001','fda10000-0000-4000-8000-000000000001',80,'fda00000-0000-4000-8000-000000000001')$$,
  'undated assessment accepts a currently effective enrolment'
);

select lives_ok(
  $$select public.submit_assessment_for_review('fda70000-0000-4000-8000-000000000001')$$,
  'submission completeness excludes stale ended enrolments'
);

select is(
  (select (completeness->>'expected')::integer from public.mark_submissions where assessment_instance_id='fda70000-0000-4000-8000-000000000001' order by submitted_at desc limit 1),
  1,
  'submission expected population contains only currently effective enrolments'
);

select is(
  (select (completeness->>'captured')::integer from public.mark_submissions where assessment_instance_id='fda70000-0000-4000-8000-000000000001' order by submitted_at desc limit 1),
  1,
  'submission captured population matches the current effective enrolment set'
);

select * from finish();
rollback;
