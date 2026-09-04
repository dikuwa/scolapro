begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fb800000-0000-4000-8000-000000000001','mark-hod@example.test','authenticated','authenticated',now(),now()),
  ('fb800000-0000-4000-8000-000000000002','mark-other@example.test','authenticated','authenticated',now(),now()),
  ('fb800000-0000-4000-8000-000000000003','mark-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(id,tenant_id,school_id,user_id,role_key,active_from)
values('fb810000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb800000-0000-4000-8000-000000000001','hod',current_date-10);

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status,user_id)
values('fb820000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','MARK-T1','Mark','Teacher','active','fb800000-0000-4000-8000-000000000003');

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id)
values('fb830000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb820000-0000-4000-8000-000000000001','teacher',current_date-10,'fb800000-0000-4000-8000-000000000001');

insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values('fb810000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb800000-0000-4000-8000-000000000003','fb820000-0000-4000-8000-000000000001','teacher',current_date-10);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values('fb840000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','MARK-AUTH','Mark Authority','active');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
values('fb850000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fb840000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active');

insert into public.assessment_schemes(id,tenant_id,school_id,subject_offering_id,scheme_key,version,capture_mode,effective_from,status,created_by_user_id)
values('fb860000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb850000-0000-4000-8000-000000000001','MARK-AUTH','1','detailed','2026-01-01','active','fb800000-0000-4000-8000-000000000001');

insert into public.teacher_allocations(id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from)
values('fb870000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fb850000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','fb820000-0000-4000-8000-000000000001',current_date-1);

insert into public.assessment_instances(id,tenant_id,school_id,academic_year,assessment_scheme_id,subject_offering_id,register_class_id,term_number,display_name,status,created_by_user_id)
values
  ('fb880000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fb860000-0000-4000-8000-000000000001','fb850000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a',1,'Leader mark instance','not_open','fb800000-0000-4000-8000-000000000001'),
  ('fb880000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fb860000-0000-4000-8000-000000000001','fb850000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a',1,'Leader self-auth instance','not_open','fb800000-0000-4000-8000-000000000001');

insert into public.assessment_instances(id,tenant_id,school_id,academic_year,assessment_scheme_id,subject_offering_id,register_class_id,teacher_allocation_id,term_number,display_name,status,created_by_user_id)
values('fb880000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fb860000-0000-4000-8000-000000000001','fb850000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','fb870000-0000-4000-8000-000000000001',1,'Allocated teacher mark instance','not_open','fb800000-0000-4000-8000-000000000003');

select ok(
  not has_function_privilege('authenticated','app_private.user_can_access_assessment_instance(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_can_access_assessment_instance(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_learner_mark_recorder_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_learner_mark_recorder_integrity()','EXECUTE'),
  'learner-mark recorder authority helpers are private'
);

select trigger_is('public','learner_marks','learner_mark_recorder_integrity_trg','app_private','enforce_learner_mark_recorder_integrity','recorder integrity trigger is installed');

select throws_ok(
  $$insert into public.learner_marks(tenant_id,school_id,assessment_instance_id,enrolment_id,learner_id,numeric_mark,recorded_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb880000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',35,'fb800000-0000-4000-8000-000000000002')$$,
  'Learner mark recorder is not authorized for assessment instance',
  'trusted write cannot credit an unrelated recorder'
);

select lives_ok(
  $$insert into public.learner_marks(id,tenant_id,school_id,assessment_instance_id,enrolment_id,learner_id,numeric_mark,recorded_by_user_id)
    values('fb890000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb880000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',42,'fb800000-0000-4000-8000-000000000001')$$,
  'academic leader remains a valid trusted recorder'
);

select lives_ok(
  $$insert into public.learner_marks(id,tenant_id,school_id,assessment_instance_id,enrolment_id,learner_id,numeric_mark,recorded_by_user_id)
    values('fb890000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb880000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',43,'fb800000-0000-4000-8000-000000000003')$$,
  'teacher assigned to the exact assessment instance remains a valid trusted recorder'
);

select throws_ok(
  $$insert into public.learner_marks(tenant_id,school_id,assessment_instance_id,enrolment_id,learner_id,numeric_mark,recorded_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb880000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',41,'fb800000-0000-4000-8000-000000000003')$$,
  'Learner mark recorder is not authorized for assessment instance',
  'teacher cannot record against an instance outside the exact allocation'
);

select throws_ok(
  $$update public.learner_marks set recorded_by_user_id='fb800000-0000-4000-8000-000000000003' where id='fb890000-0000-4000-8000-000000000001'$$,
  'Learner mark scope and provenance are immutable',
  'existing physical scope guard keeps recorder provenance immutable'
);

select set_config('request.jwt.claim.sub','fb800000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select throws_ok(
  $$insert into public.learner_marks(tenant_id,school_id,assessment_instance_id,enrolment_id,learner_id,numeric_mark,recorded_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb880000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',44,'fb800000-0000-4000-8000-000000000003')$$,
  'Learner mark recorder must match authenticated actor',
  'authenticated academic leader cannot forge recorder provenance'
);

select lives_ok(
  $$insert into public.learner_marks(tenant_id,school_id,assessment_instance_id,enrolment_id,learner_id,numeric_mark,recorded_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb880000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',44,'fb800000-0000-4000-8000-000000000001')$$,
  'authenticated academic leader can record a self-authored learner mark'
);

reset role;

select ok(
  exists(
    select 1 from pg_policies
    where schemaname='public' and tablename='learner_marks'
      and policyname='scoped academic staff can append learner marks'
      and with_check like '%recorded_by_user_id%auth.uid()%'
  ),
  'existing learner-mark insert policy remains bound to authenticated recorder'
);

select * from finish();
rollback;
