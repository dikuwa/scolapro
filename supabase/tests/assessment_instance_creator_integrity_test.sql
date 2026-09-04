begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fc800000-0000-4000-8000-000000000001','instance-hod@example.test','authenticated','authenticated',now(),now()),
  ('fc800000-0000-4000-8000-000000000002','instance-other@example.test','authenticated','authenticated',now(),now()),
  ('fc800000-0000-4000-8000-000000000003','instance-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(id,tenant_id,school_id,user_id,role_key,active_from)
values('fc810000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc800000-0000-4000-8000-000000000001','hod',current_date-10);

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status,user_id)
values('fc820000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','INSTANCE-T1','Instance','Teacher','active','fc800000-0000-4000-8000-000000000003');

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id)
values('fc830000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc820000-0000-4000-8000-000000000001','teacher',current_date-10,'fc800000-0000-4000-8000-000000000001');

insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values('fc810000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc800000-0000-4000-8000-000000000003','fc820000-0000-4000-8000-000000000001','teacher',current_date-10);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values('fc840000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','INST-AUTH','Instance Authority','active');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
values('fc850000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fc840000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active');

insert into public.assessment_schemes(id,tenant_id,school_id,subject_offering_id,scheme_key,version,capture_mode,effective_from,status,created_by_user_id)
values('fc860000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc850000-0000-4000-8000-000000000001','INST-AUTH','1','detailed','2026-01-01','active','fc800000-0000-4000-8000-000000000001');

insert into public.teacher_allocations(id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from)
values('fc870000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fc850000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','fc820000-0000-4000-8000-000000000001',current_date-1);

select ok(
  not has_function_privilege('authenticated','app_private.user_can_manage_assessment_instance_scope(uuid,uuid,integer,uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_can_manage_assessment_instance_scope(uuid,uuid,integer,uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_assessment_instance_creator_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_assessment_instance_creator_integrity()','EXECUTE'),
  'assessment-instance creator authority helpers are private'
);

select trigger_is('public','assessment_instances','assessment_instance_creator_integrity_trg','app_private','enforce_assessment_instance_creator_integrity','creator integrity trigger is installed');

select throws_ok(
  $$insert into public.assessment_instances(tenant_id,school_id,academic_year,assessment_scheme_id,subject_offering_id,register_class_id,term_number,display_name,status,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fc860000-0000-4000-8000-000000000001','fc850000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a',1,'Unrelated creator','not_open','fc800000-0000-4000-8000-000000000002')$$,
  'Assessment instance creator is not authorized for scope',
  'trusted write cannot credit an unrelated account'
);

select lives_ok(
  $$insert into public.assessment_instances(id,tenant_id,school_id,academic_year,assessment_scheme_id,subject_offering_id,register_class_id,term_number,display_name,status,created_by_user_id)
    values('fc880000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fc860000-0000-4000-8000-000000000001','fc850000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a',1,'Leader creator','not_open','fc800000-0000-4000-8000-000000000001')$$,
  'academic leader remains a valid trusted creator'
);

select lives_ok(
  $$insert into public.assessment_instances(id,tenant_id,school_id,academic_year,assessment_scheme_id,subject_offering_id,register_class_id,teacher_allocation_id,term_number,display_name,status,created_by_user_id)
    values('fc880000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fc860000-0000-4000-8000-000000000001','fc850000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','fc870000-0000-4000-8000-000000000001',1,'Teacher creator','not_open','fc800000-0000-4000-8000-000000000003')$$,
  'teacher assigned to the exact assessment scope remains a valid creator'
);

select throws_ok(
  $$insert into public.assessment_instances(tenant_id,school_id,academic_year,assessment_scheme_id,subject_offering_id,register_class_id,term_number,display_name,status,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fc860000-0000-4000-8000-000000000001','fc850000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a',1,'Teacher without allocation','not_open','fc800000-0000-4000-8000-000000000003')$$,
  'Assessment instance creator is not authorized for scope',
  'teacher cannot be credited outside an exact active allocation'
);

select set_config('request.jwt.claim.sub','fc800000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select throws_ok(
  $$insert into public.assessment_instances(tenant_id,school_id,academic_year,assessment_scheme_id,subject_offering_id,register_class_id,term_number,display_name,status,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fc860000-0000-4000-8000-000000000001','fc850000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a',1,'Forged by leader','not_open','fc800000-0000-4000-8000-000000000003')$$,
  'Assessment instance creator must match authenticated actor',
  'authenticated leader cannot forge creator provenance'
);

select lives_ok(
  $$insert into public.assessment_instances(tenant_id,school_id,academic_year,assessment_scheme_id,subject_offering_id,register_class_id,term_number,display_name,status,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fc860000-0000-4000-8000-000000000001','fc850000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a',1,'Self authored by leader','not_open','fc800000-0000-4000-8000-000000000001')$$,
  'authenticated leader can create a self-authored assessment instance'
);

reset role;

select ok(
  exists(
    select 1 from pg_policies
    where schemaname='public' and tablename='assessment_instances'
      and policyname='scoped academic staff insert assessment instances'
      and with_check like '%created_by_user_id%auth.uid()%'
  ),
  'existing insert policy remains bound to the authenticated creator'
);

select * from finish();
rollback;
