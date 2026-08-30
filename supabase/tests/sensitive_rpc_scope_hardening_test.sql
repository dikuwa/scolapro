begin;

select plan(12);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fa100000-0000-4000-8000-000000000001','scope-admin@example.test','authenticated','authenticated',now(),now()),
  ('fa100000-0000-4000-8000-000000000002','scope-teacher@example.test','authenticated','authenticated',now(),now()),
  ('fa100000-0000-4000-8000-000000000003','scope-counsellor@example.test','authenticated','authenticated',now(),now()),
  ('fa100000-0000-4000-8000-000000000004','scope-other-staff@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('fa110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Second Scope School','SCOPE002','Erongo','Walvis Bay');

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values
  ('fa120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fa100000-0000-4000-8000-000000000001','SCOPE-ADMIN','Scope','Admin','active'),
  ('fa120000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fa100000-0000-4000-8000-000000000002','SCOPE-TEACH','Scope','Teacher','active'),
  ('fa120000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fa100000-0000-4000-8000-000000000003','SCOPE-COUN','Scope','Counsellor','active'),
  ('fa120000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','fa100000-0000-4000-8000-000000000004','SCOPE-OTHER','Other','Staff','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa100000-0000-4000-8000-000000000001','fa120000-0000-4000-8000-000000000001','school_admin',current_date-10),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa100000-0000-4000-8000-000000000002','fa120000-0000-4000-8000-000000000002','teacher',current_date-10),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa100000-0000-4000-8000-000000000003','fa120000-0000-4000-8000-000000000003','counsellor',current_date-10),
  ('11111111-1111-4111-8111-111111111111','fa110000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000004','fa120000-0000-4000-8000-000000000004','teacher',current_date-10);

insert into public.staff_school_assignments(tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa120000-0000-4000-8000-000000000002','teacher',current_date-10,'fa100000-0000-4000-8000-000000000001'),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa120000-0000-4000-8000-000000000003','support',current_date-10,'fa100000-0000-4000-8000-000000000001'),
  ('11111111-1111-4111-8111-111111111111','fa110000-0000-4000-8000-000000000001','fa120000-0000-4000-8000-000000000004','teacher',current_date-10,'fa100000-0000-4000-8000-000000000001');

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values('fa130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','SCOPE-MATH','Scope Mathematics','active');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
values('fa140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fa130000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active');

insert into public.assessment_schemes(id,tenant_id,school_id,subject_offering_id,scheme_key,version,capture_mode,effective_from,status,created_by_user_id)
values('fa150000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa140000-0000-4000-8000-000000000001','SCOPE-MATH','v1','weighted',current_date-30,'active','fa100000-0000-4000-8000-000000000001');

insert into public.teacher_allocations(id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from)
values('fa160000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fa140000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','fa120000-0000-4000-8000-000000000002',current_date-10);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000002',true);
select is(app_private.can_calculate_subject_result('fa150000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001'),true,'allocated teacher can calculate a result for their exact subject/class');
select is(app_private.can_calculate_subject_result('fa150000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002'),false,'teacher cannot calculate a result for an unallocated class');
select throws_ok(
  $$select public.calculate_subject_result('fa150000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002',1::smallint)$$,
  'P0001','Permission denied','result calculator enforces relationship-aware teacher scope'
);

select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000001',true);
select is(app_private.can_calculate_subject_result('fa150000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002'),true,'school administrator retains school-wide result oversight');

insert into public.profile_change_requests(
  id,tenant_id,school_id,learner_id,target_type,target_id,field_key,current_value,proposed_value,requested_by_user_id
) values(
  'fa170000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000001','learner','50000000-0000-4000-8000-000000000001','preferred_name','Amara','Ami','fa100000-0000-4000-8000-000000000003'
);

select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$select public.review_profile_change_request('fa170000-0000-4000-8000-000000000001','approved',null)$$,
  'P0001','Permission denied','counsellor may manage learner support relationships but cannot approve authoritative profile corrections'
);
select is((select status from public.profile_change_requests where id='fa170000-0000-4000-8000-000000000001'),'pending','unauthorized profile review leaves request pending');

select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000001',true);
select is(public.review_profile_change_request('fa170000-0000-4000-8000-000000000001','approved',null),true,'school administrator can approve the reviewed correction');
select is((select preferred_name from public.learners where id='50000000-0000-4000-8000-000000000001'),'Ami','approved correction updates authoritative learner profile');

insert into public.guardian_profiles(id,tenant_id,first_names,surname,preferred_name,identity_number)
values('fa180000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Shared','Guardian','Share','ID-SHARED-001');

select throws_ok(
  $$select public.upsert_guardian_relationship('50000000-0000-4000-8000-000000000001','fa180000-0000-4000-8000-000000000001','Changed','Guardian','Share','ID-SHARED-001','parent',true,false,false,1::smallint,'[]'::jsonb)$$,
  'P0001','Existing guardian identity changes require the reviewed profile-change workflow','linking an existing guardian cannot silently overwrite shared identity data'
);
select is((select first_names from public.guardian_profiles where id='fa180000-0000-4000-8000-000000000001'),'Shared','rejected relationship upsert preserves guardian identity');
select is(
  public.upsert_guardian_relationship('50000000-0000-4000-8000-000000000001','fa180000-0000-4000-8000-000000000001','Shared','Guardian','Share','ID-SHARED-001','parent',true,false,false,1::smallint,'[]'::jsonb),
  'fa180000-0000-4000-8000-000000000001'::uuid,
  'unchanged existing guardian identity can still be linked to the learner'
);

select throws_ok(
  $$select public.create_detention_session('22222222-2222-4222-8222-222222222222',current_date,null,null,'fa120000-0000-4000-8000-000000000004',null,null)$$,
  'P0001','Detention supervisor is not actively assigned to this school on the session date','tenant-wide staff identity cannot supervise detention at an unrelated school'
);
select ok(
  public.create_detention_session('22222222-2222-4222-8222-222222222222',current_date,null,null,'fa120000-0000-4000-8000-000000000002',null,null) is not null,
  'staff actively assigned to the school can supervise detention'
);

select * from finish();
rollback;
