begin;

select plan(9);

-- Same authenticated identity, intentionally different authority by school:
-- School Admin in the QA school, plain Teacher in the seeded control school.
-- Sensitive RPCs scoped to the control school must not borrow leadership power
-- from the user's unrelated School Admin membership.
insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fdb00000-0000-4000-8000-000000000001','sensitive-cross-role@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status) values
('fdb10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Sensitive Cross Role School','SENS-XROLE-001','active');

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
('fdb20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fdb00000-0000-4000-8000-000000000001','SENS-XROLE','Sensitive','Crossrole','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','fdb10000-0000-4000-8000-000000000001','fdb00000-0000-4000-8000-000000000001','fdb20000-0000-4000-8000-000000000001','school_admin',current_date-2),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fdb00000-0000-4000-8000-000000000001','fdb20000-0000-4000-8000-000000000001','teacher',current_date-2);

-- Give the teacher a valid staff placement in the target school, but deliberately
-- no teacher allocation for the subject/class below.
insert into public.staff_school_assignments(tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fdb20000-0000-4000-8000-000000000001','teacher',current_date-2,'fdb00000-0000-4000-8000-000000000001');

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status) values
('fdb30000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','XROLE-MATH','Cross Role Mathematics','active');
insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status) values
('fdb40000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fdb30000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active');
insert into public.assessment_schemes(id,tenant_id,school_id,subject_offering_id,scheme_key,version,capture_mode,effective_from,status,created_by_user_id) values
('fdb50000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fdb40000-0000-4000-8000-000000000001','XROLE-MATH','v1','detailed',current_date-2,'active','fdb00000-0000-4000-8000-000000000001');

insert into public.profile_change_requests(
  id,tenant_id,school_id,learner_id,target_type,target_id,field_key,current_value,proposed_value,requested_by_user_id
) values(
  'fdb60000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000001','learner','50000000-0000-4000-8000-000000000001','preferred_name','Amara','Ami XRole','fdb00000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fdb00000-0000-4000-8000-000000000001',true);

select is(
  app_private.has_school_role('fdb10000-0000-4000-8000-000000000001',array['school_admin']),
  true,
  'mixed-role user is School Admin in the authorized school'
);
select is(
  app_private.has_school_role('22222222-2222-4222-8222-222222222222',array['school_admin']),
  false,
  'School Admin authority does not follow the same user into another school'
);
select is(
  app_private.has_school_role('22222222-2222-4222-8222-222222222222',array['teacher']),
  true,
  'the same user retains only the explicit Teacher role in the target school'
);

select is(
  app_private.can_calculate_subject_result('fdb50000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002'),
  false,
  'unallocated target-school teacher cannot borrow School Admin authority to calculate results'
);
select throws_ok(
  $$select public.calculate_subject_result('fdb50000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002',1::smallint)$$,
  'P0001','Permission denied',
  'result RPC enforces target-school relationship scope for a mixed-role user'
);

select throws_ok(
  $$select public.review_profile_change_request('fdb60000-0000-4000-8000-000000000001','approved',null)$$,
  'P0001','Permission denied',
  'teacher cannot borrow School Admin authority from another school to approve profile changes'
);
select is(
  (select status from public.profile_change_requests where id='fdb60000-0000-4000-8000-000000000001'),
  'pending',
  'denied mixed-role profile review leaves the request unchanged'
);

select is(
  app_private.can_manage_guardians_for_learner('50000000-0000-4000-8000-000000000001'),
  false,
  'teacher cannot borrow unrelated School Admin authority to manage target-school guardians'
);
select throws_ok(
  $$select public.upsert_guardian_relationship('50000000-0000-4000-8000-000000000001',null,'Cross','Role Guardian',null,null,'guardian',false,false,false,1::smallint,'[]'::jsonb)$$,
  'P0001','Permission denied',
  'guardian relationship RPC enforces target-school authority for a mixed-role user'
);

select * from finish();
rollback;
