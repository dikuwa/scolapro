begin;

select plan(14);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('54500000-0000-4000-8000-000000000001','assessment-current-teacher@example.test','authenticated','authenticated',now(),now()),
('54500000-0000-4000-8000-000000000002','assessment-support-hod@example.test','authenticated','authenticated',now(),now()),
('54500000-0000-4000-8000-000000000003','assessment-leader@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
('54501000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','54500000-0000-4000-8000-000000000001','ASM545-T','Current','Teacher','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id
) values(
  '54502000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222','54501000-0000-4000-8000-000000000001',
  'teacher',current_date-10,'54500000-0000-4000-8000-000000000003'
);

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','54500000-0000-4000-8000-000000000001','54501000-0000-4000-8000-000000000001','teacher',current_date-10),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','54500000-0000-4000-8000-000000000002',null,'hod',current_date-10),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','54500000-0000-4000-8000-000000000003',null,'hod',current_date-10);

insert into public.platform_memberships(user_id,role_key,active_from)
values('54500000-0000-4000-8000-000000000002','platform_support',current_date-10);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values('54503000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ASM545','Assessment 545','active');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
values('54504000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'54503000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active');

insert into public.assessment_schemes(
  id,tenant_id,school_id,subject_offering_id,scheme_key,version,capture_mode,effective_from,status,created_by_user_id
) values(
  '54505000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222','54504000-0000-4000-8000-000000000001',
  'ASM545','v1','detailed',current_date-30,'active','54500000-0000-4000-8000-000000000003'
);

insert into public.assessment_components(
  id,tenant_id,school_id,assessment_scheme_id,component_code,display_name,component_type,raw_max,weight,contributes_to_report,required,sort_order
) values(
  '54506000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222','54505000-0000-4000-8000-000000000001',
  'BASE','Base component','task',100,100,true,true,1
);

insert into public.teacher_allocations(
  id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from
) values(
  '54507000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',2026,'54504000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-00000000001a','54501000-0000-4000-8000-000000000001',current_date-5
);

insert into public.assessment_instances(
  id,tenant_id,school_id,academic_year,assessment_scheme_id,assessment_component_id,subject_offering_id,
  register_class_id,teacher_allocation_id,term_number,display_name,raw_max,status,created_by_user_id
) values
('54508000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'54505000-0000-4000-8000-000000000001','54506000-0000-4000-8000-000000000001','54504000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','54507000-0000-4000-8000-000000000001',1,'Open marks',100,'open','54500000-0000-4000-8000-000000000003'),
('54508000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'54505000-0000-4000-8000-000000000001','54506000-0000-4000-8000-000000000001','54504000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','54507000-0000-4000-8000-000000000001',2,'Review marks',100,'review','54500000-0000-4000-8000-000000000003'),
('54508000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'54505000-0000-4000-8000-000000000001','54506000-0000-4000-8000-000000000001','54504000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','54507000-0000-4000-8000-000000000001',3,'Verified marks',100,'verified','54500000-0000-4000-8000-000000000003');

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public' and tablename='assessment_components'
     and policyname like 'academic leaders can manage assessment components [%'),
  0,
  'legacy split component mutation policies are removed'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public' and tablename='assessment_schemes'
     and policyname in (
       'academic leaders can manage assessment schemes [update]',
       'academic leaders can manage assessment schemes [delete]'
     )),
  0,
  'legacy split scheme update/delete policies are removed while creator-bound insert remains'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','54500000-0000-4000-8000-000000000002',true);
set local role authenticated;

select throws_ok(
  $$insert into public.assessment_components(
      tenant_id,school_id,assessment_scheme_id,component_code,display_name,component_type,raw_max,sort_order
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      '54505000-0000-4000-8000-000000000001','SUP','Support bypass','task',10,99
    )$$,
  '42501',null,
  'Platform Support cannot borrow HOD component mutation authority'
);
reset role;

select set_config('request.jwt.claim.sub','54500000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$insert into public.learner_marks(
      id,tenant_id,school_id,assessment_instance_id,enrolment_id,learner_id,numeric_mark,recorded_by_user_id
    ) values(
      '54509000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222','54508000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',72,
      '54500000-0000-4000-8000-000000000001'
    )$$,
  'assigned teacher can append a working mark while assessment is open'
);

select throws_ok(
  $$insert into public.learner_marks(
      tenant_id,school_id,assessment_instance_id,enrolment_id,learner_id,numeric_mark,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      '54508000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',73,'54500000-0000-4000-8000-000000000001'
    )$$,
  'P0001','Assessment is not open for mark editing',
  'working marks cannot be appended while governed review is active'
);

select throws_ok(
  $$insert into public.learner_marks(
      tenant_id,school_id,assessment_instance_id,enrolment_id,learner_id,numeric_mark,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      '54508000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',74,'54500000-0000-4000-8000-000000000001'
    )$$,
  'P0001','Assessment is not open for mark editing',
  'working marks cannot be appended after verification'
);

select lives_ok(
  $$update public.assessment_instances set display_name='Open marks edited'
    where id='54508000-0000-4000-8000-000000000001'$$,
  'ordinary pre-finality instance metadata remains editable'
);

select throws_ok(
  $$update public.assessment_instances set status='review'
    where id='54508000-0000-4000-8000-000000000001'$$,
  '42501',null,
  'ordinary client cannot move an open instance into governed review'
);

select is(
  (select status from public.assessment_instances where id='54508000-0000-4000-8000-000000000001'),
  'open',
  'rejected direct review transition leaves the instance open'
);

select lives_ok(
  $$update public.assessment_instances set status='open'
    where id='54508000-0000-4000-8000-000000000003'$$,
  'RLS hides governed-finality rows from ordinary update'
);
reset role;

select is(
  (select status from public.assessment_instances where id='54508000-0000-4000-8000-000000000003'),
  'verified',
  'verified instance cannot be silently reopened through ordinary mutation'
);

select ok(
  (select with_check from pg_policies
   where schemaname='public' and tablename='learner_marks'
     and policyname='scoped academic staff can append learner marks')
  ilike '%status%not_open%open%returned%',
  'learner-mark insert policy is lifecycle-bound'
);

select ok(
  (select qual from pg_policies
   where schemaname='public' and tablename='assessment_instances'
     and policyname='scoped academic staff update assessment instances')
  ilike '%not_open%open%returned%',
  'ordinary assessment-instance updates are pre-finality only'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_learner_mark_recorder_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_learner_mark_recorder_integrity()','EXECUTE'),
  'working-mark recorder integrity helper remains private'
);

select is(
  (select count(*)::integer from public.learner_marks where id='54509000-0000-4000-8000-000000000001'
     and recorded_by_user_id='54500000-0000-4000-8000-000000000001'),
  1,
  'accepted working mark retains immutable recorder provenance'
);

select * from finish();
rollback;
