begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fa300000-0000-4000-8000-000000000001','assignment-teacher@example.test','authenticated','authenticated',now(),now()),
  ('fa300000-0000-4000-8000-000000000002','assignment-admin@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values('fa310000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fa300000-0000-4000-8000-000000000001','ASSIGN-T','Assigned','Teacher','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa300000-0000-4000-8000-000000000001','fa310000-0000-4000-8000-000000000001','teacher',current_date-5),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa300000-0000-4000-8000-000000000002',null,'school_admin',current_date-5);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values('fa320000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ASSIGN-SUB','Assignment Subject','active');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
values('fa330000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fa320000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active');

insert into public.assessment_schemes(id,tenant_id,school_id,subject_offering_id,scheme_key,version,capture_mode,effective_from,status,created_by_user_id)
values('fa340000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa330000-0000-4000-8000-000000000001','ASSIGN','v1','weighted',current_date-10,'active','fa300000-0000-4000-8000-000000000002');

insert into public.teacher_allocations(id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from)
values('fa350000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fa330000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','fa310000-0000-4000-8000-000000000001',current_date-5);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa300000-0000-4000-8000-000000000001',true);

select is(
  app_private.can_manage_assessment_instance_scope('22222222-2222-4222-8222-222222222222',2026,'fa330000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','fa350000-0000-4000-8000-000000000001'),
  true,
  'teacher may manage an assessment instance in the exact active allocation'
);
select is(
  app_private.can_manage_assessment_instance_scope('22222222-2222-4222-8222-222222222222',2026,'fa330000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001b','fa350000-0000-4000-8000-000000000001'),
  false,
  'teacher may not manage an assessment instance in an unallocated class'
);

set local role authenticated;
select lives_ok(
  $$insert into public.assessment_instances(id,tenant_id,school_id,academic_year,assessment_scheme_id,subject_offering_id,register_class_id,teacher_allocation_id,term_number,display_name,status,created_by_user_id)
    values('fa360000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fa340000-0000-4000-8000-000000000001','fa330000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','fa350000-0000-4000-8000-000000000001',3,'Allocated assessment','not_open','fa300000-0000-4000-8000-000000000001')$$,
  'teacher can insert an assessment instance only inside their exact allocation'
);
select throws_ok(
  $$insert into public.assessment_instances(id,tenant_id,school_id,academic_year,assessment_scheme_id,subject_offering_id,register_class_id,teacher_allocation_id,term_number,display_name,status,created_by_user_id)
    values('fa360000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fa340000-0000-4000-8000-000000000001','fa330000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001b','fa350000-0000-4000-8000-000000000001',3,'Wrong class assessment','not_open','fa300000-0000-4000-8000-000000000001')$$,
  'P0001','Assessment instance scope must match teacher allocation',
  'allocation integrity blocks an assessment instance from being rebound to another class'
);
select throws_ok(
  $$update public.assessment_instances set created_by_user_id='fa300000-0000-4000-8000-000000000002' where id='fa360000-0000-4000-8000-000000000001'$$,
  'P0001','Assessment instance creator provenance is immutable',
  'assessment instance creator provenance cannot be rewritten'
);
reset role;

insert into public.official_results(
  id,tenant_id,school_id,academic_year,enrolment_id,learner_id,subject_offering_id,term_number,result_value,symbol,assessment_scheme_key,assessment_scheme_version,calculation_snapshot,approved_by_user_id
) values
  ('fa370000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','fa330000-0000-4000-8000-000000000001',3,75,'B','ASSIGN','v1','{}','fa300000-0000-4000-8000-000000000002'),
  ('fa370000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'60000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','fa330000-0000-4000-8000-000000000001',3,70,'B','ASSIGN','v1','{}','fa300000-0000-4000-8000-000000000002');

set local role authenticated;
select is((select count(*)::integer from public.official_results),1,'teacher sees official results only for exact allocated subject/class');
select is((select id from public.official_results),'fa370000-0000-4000-8000-000000000001'::uuid,'teacher sees the exact in-scope official result');
reset role;

select set_config('request.jwt.claim.sub','fa300000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*)::integer from public.official_results),2,'school administrator retains school-wide official-result oversight');
reset role;

select * from finish();
rollback;
