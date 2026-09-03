begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fdb00000-0000-4000-8000-000000000001','dated-assessment-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fdb00000-0000-4000-8000-000000000001',
  'school_admin',current_date-30
);

insert into public.learners(id,tenant_id,first_names,surname,sex)
values(
  'fdb10000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Eligible','Assessment Learner','unspecified'
);

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,grade_id,register_class_id,
  admission_number,enrolled_from,status
) values(
  'fdb20000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fdb10000-0000-4000-8000-000000000001',
  2026,
  '30000000-0000-4000-8000-000000000010',
  '40000000-0000-4000-8000-00000000001a',
  'DATED-ELIG-001',current_date-30,'current'
);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values(
  'fdb30000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'DATED-ELIG','Dated Eligibility','active'
);

insert into public.subject_offerings(
  id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status
) values(
  'fdb40000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2026,
  'fdb30000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000010',1,'active'
);

insert into public.assessment_schemes(
  id,tenant_id,school_id,subject_offering_id,scheme_key,version,capture_mode,
  effective_from,status,created_by_user_id
) values(
  'fdb50000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fdb40000-0000-4000-8000-000000000001',
  'DATED-ELIG','1','detailed',current_date-30,'active',
  'fdb00000-0000-4000-8000-000000000001'
);

insert into public.assessment_components(
  id,tenant_id,school_id,assessment_scheme_id,component_code,display_name,
  component_type,raw_max,weight,contributes_to_report,required,sort_order
) values(
  'fdb60000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fdb50000-0000-4000-8000-000000000001',
  'TEST','Dated Test','test',100,100,true,true,10
);

insert into public.assessment_instances(
  id,tenant_id,school_id,academic_year,assessment_scheme_id,assessment_component_id,
  subject_offering_id,register_class_id,term_number,display_name,assessment_date,
  raw_max,status,created_by_user_id
) values(
  'fdb70000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2026,
  'fdb50000-0000-4000-8000-000000000001',
  'fdb60000-0000-4000-8000-000000000001',
  'fdb40000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-00000000001a',
  1,'Dated Eligibility Assessment',current_date,100,'open',
  'fdb00000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fdb00000-0000-4000-8000-000000000001',true);

-- The seeded 10A learner is deliberately moved to a future start while retaining
-- current status, reproducing lifecycle lag without changing class/year identity.
update public.enrolments
set enrolled_from=current_date+7,
    enrolled_to=null,
    status='current'
where id='60000000-0000-4000-8000-000000000001';

select throws_ok(
  $$insert into public.learner_marks(
    tenant_id,school_id,assessment_instance_id,enrolment_id,learner_id,
    numeric_mark,recorded_by_user_id
  ) values(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'fdb70000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    75,'fdb00000-0000-4000-8000-000000000001'
  )$$,
  'Learner mark scope mismatch: learner was not enrolled in the assessment class on the assessment date',
  'dated assessment rejects a mark for a future-start current-status enrolment'
);

select lives_ok(
  $$insert into public.learner_marks(
    tenant_id,school_id,assessment_instance_id,enrolment_id,learner_id,
    numeric_mark,recorded_by_user_id
  ) values(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'fdb70000-0000-4000-8000-000000000001',
    'fdb20000-0000-4000-8000-000000000001',
    'fdb10000-0000-4000-8000-000000000001',
    82,'fdb00000-0000-4000-8000-000000000001'
  )$$,
  'dated assessment accepts a mark for an enrolment effective on the assessment date'
);

select is(
  (select count(*)::integer from public.learner_marks
   where assessment_instance_id='fdb70000-0000-4000-8000-000000000001'),
  1,
  'only the eligible dated-assessment mark is persisted'
);

select lives_ok(
  $$select public.submit_assessment_for_review(
    'fdb70000-0000-4000-8000-000000000001','weighted-v1'
  )$$,
  'dated assessment submission does not require a mark from a learner not enrolled on assessment date'
);

select is(
  (select status from public.assessment_instances
   where id='fdb70000-0000-4000-8000-000000000001'),
  'review',
  'dated assessment advances to review after all eligible learners are captured'
);

select is(
  (select (completeness->>'expected')::integer
   from public.mark_submissions
   where assessment_instance_id='fdb70000-0000-4000-8000-000000000001'
   order by submitted_at desc limit 1),
  1,
  'dated assessment completeness counts only enrolments effective on assessment date'
);

select is(
  (select (completeness->>'captured')::integer
   from public.mark_submissions
   where assessment_instance_id='fdb70000-0000-4000-8000-000000000001'
   order by submitted_at desc limit 1),
  1,
  'dated assessment completeness captured count uses the same eligible population'
);

select is(
  (select completeness->>'eligibility_reference_date'
   from public.mark_submissions
   where assessment_instance_id='fdb70000-0000-4000-8000-000000000001'
   order by submitted_at desc limit 1),
  current_date::text,
  'dated assessment submission records the eligibility reference date'
);

select * from finish();
rollback;
