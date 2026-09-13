begin;

select plan(15);

-- School A uses the stable seed tenant/school/grade/class. School B is an active
-- second school for deterministic-current-school regression coverage.
insert into public.schools(id,tenant_id,name,emis_number,status)
values('ac120000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Assessment Older School','ASM-OLD','active');

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name)
values('ac125000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ac120000-0000-4000-8000-000000000002',2026,'ASM-G','Assessment Grade');

insert into public.register_classes(id,tenant_id,school_id,grade_id,academic_year,class_code,display_name)
values('ac126000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ac120000-0000-4000-8000-000000000002','ac125000-0000-4000-8000-000000000002',2026,'ASM-C','Assessment Class');

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('ac100000-0000-4000-8000-000000000001','assessment-current@example.test','authenticated','authenticated',now(),now()),
  ('ac100000-0000-4000-8000-000000000002','assessment-stale@example.test','authenticated','authenticated',now(),now()),
  ('ac100000-0000-4000-8000-000000000003','assessment-support@example.test','authenticated','authenticated',now(),now()),
  ('ac100000-0000-4000-8000-000000000004','assessment-admin-a@example.test','authenticated','authenticated',now(),now()),
  ('ac100000-0000-4000-8000-000000000005','assessment-admin-b@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('ac140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ac100000-0000-4000-8000-000000000001','ASM-CUR','Current','Teacher','active'),
  ('ac140000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ac100000-0000-4000-8000-000000000002','ASM-STALE','Stale','Teacher','active'),
  ('ac140000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','ac100000-0000-4000-8000-000000000003','ASM-SUP','Support','Teacher','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values
  ('ac150000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ac140000-0000-4000-8000-000000000001','staff',current_date-30,null,'ac100000-0000-4000-8000-000000000004'),
  ('ac150000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ac120000-0000-4000-8000-000000000002','ac140000-0000-4000-8000-000000000001','staff',current_date-60,null,'ac100000-0000-4000-8000-000000000005'),
  ('ac150000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ac140000-0000-4000-8000-000000000002','staff',current_date-60,current_date-1,'ac100000-0000-4000-8000-000000000004'),
  ('ac150000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ac140000-0000-4000-8000-000000000003','staff',current_date-30,null,'ac100000-0000-4000-8000-000000000004');

insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
  ('ac130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ac120000-0000-4000-8000-000000000002','ac100000-0000-4000-8000-000000000001','ac140000-0000-4000-8000-000000000001','teacher',current_date-30),
  ('ac130000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ac100000-0000-4000-8000-000000000001','ac140000-0000-4000-8000-000000000001','teacher',current_date-5),
  ('ac130000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ac100000-0000-4000-8000-000000000002','ac140000-0000-4000-8000-000000000002','teacher',current_date-30),
  ('ac130000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ac100000-0000-4000-8000-000000000003','ac140000-0000-4000-8000-000000000003','teacher',current_date-30),
  ('ac130000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ac100000-0000-4000-8000-000000000004',null,'school_admin',current_date-30),
  ('ac130000-0000-4000-8000-000000000006','11111111-1111-4111-8111-111111111111','ac120000-0000-4000-8000-000000000002','ac100000-0000-4000-8000-000000000005',null,'school_admin',current_date-30);

insert into public.platform_memberships(user_id,role_key,active_from)
values('ac100000-0000-4000-8000-000000000003','platform_support',current_date-30);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status) values
  ('ac160000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ASM-A','Assessment A','active'),
  ('ac160000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ac120000-0000-4000-8000-000000000002','ASM-B','Assessment B','active');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status) values
  ('ac161000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ac160000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active'),
  ('ac161000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ac120000-0000-4000-8000-000000000002',2026,'ac160000-0000-4000-8000-000000000002','ac125000-0000-4000-8000-000000000002',5,'active');

insert into public.assessment_schemes(id,tenant_id,school_id,subject_offering_id,scheme_key,version,capture_mode,effective_from,status,created_by_user_id) values
  ('ac162000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ac161000-0000-4000-8000-000000000001','ASM-A','v1','detailed',current_date-30,'active','ac100000-0000-4000-8000-000000000004'),
  ('ac162000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ac120000-0000-4000-8000-000000000002','ac161000-0000-4000-8000-000000000002','ASM-B','v1','detailed',current_date-30,'active','ac100000-0000-4000-8000-000000000005');

insert into public.teacher_allocations(id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from) values
  ('ac163000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ac161000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','ac140000-0000-4000-8000-000000000001',current_date-30),
  ('ac163000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ac120000-0000-4000-8000-000000000002',2026,'ac161000-0000-4000-8000-000000000002','ac126000-0000-4000-8000-000000000002','ac140000-0000-4000-8000-000000000001',current_date-30),
  ('ac163000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ac161000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','ac140000-0000-4000-8000-000000000002',current_date-30),
  ('ac163000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ac161000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','ac140000-0000-4000-8000-000000000003',current_date-30);

insert into public.assessment_instances(id,tenant_id,school_id,academic_year,assessment_scheme_id,subject_offering_id,register_class_id,teacher_allocation_id,term_number,display_name,status,created_by_user_id) values
  ('ac164000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ac162000-0000-4000-8000-000000000001','ac161000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','ac163000-0000-4000-8000-000000000001',3,'Current assessment','open','ac100000-0000-4000-8000-000000000004'),
  ('ac164000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ac120000-0000-4000-8000-000000000002',2026,'ac162000-0000-4000-8000-000000000002','ac161000-0000-4000-8000-000000000002','ac126000-0000-4000-8000-000000000002','ac163000-0000-4000-8000-000000000002',3,'Non-current school assessment','open','ac100000-0000-4000-8000-000000000005'),
  ('ac164000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ac162000-0000-4000-8000-000000000001','ac161000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','ac163000-0000-4000-8000-000000000003',3,'Stale teacher assessment','open','ac100000-0000-4000-8000-000000000004'),
  ('ac164000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ac162000-0000-4000-8000-000000000001','ac161000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','ac163000-0000-4000-8000-000000000004',3,'Support teacher assessment','open','ac100000-0000-4000-8000-000000000004');

insert into public.learners(id,tenant_id,first_names,surname) values
  ('ac170000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Current','Learner'),
  ('ac170000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Ended','Learner');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,grade_id,register_class_id,admission_number,enrolled_from,enrolled_to,status) values
  ('ac171000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ac170000-0000-4000-8000-000000000001',2026,'30000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-00000000001a','ASM-CURRENT',current_date-30,null,'current'),
  ('ac171000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ac170000-0000-4000-8000-000000000002',2026,'30000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-00000000001a','ASM-ENDED',current_date-60,current_date-1,'withdrawn');

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','ac100000-0000-4000-8000-000000000001',true);
select is(app_private.can_access_assessment_instance('ac164000-0000-4000-8000-000000000001'),true,'current teacher can access the exact current-school subject/class assessment');
select is(app_private.can_manage_assessment_instance_scope('22222222-2222-4222-8222-222222222222',2026,'ac161000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001b','ac163000-0000-4000-8000-000000000001'),false,'teacher cannot manage an unassigned class scope');
select is(app_private.can_access_assessment_instance('ac164000-0000-4000-8000-000000000002'),false,'another active but non-current school cannot authorize assessment access');

select set_config('request.jwt.claim.sub','ac100000-0000-4000-8000-000000000002',true);
select is(app_private.can_access_assessment_instance('ac164000-0000-4000-8000-000000000003'),false,'ended authoritative staff placement removes marks authority despite active membership/allocation');

select set_config('request.jwt.claim.sub','ac100000-0000-4000-8000-000000000003',true);
select is(app_private.can_access_assessment_instance('ac164000-0000-4000-8000-000000000004'),false,'Platform Support cannot gain school-operational assessment authority through a teacher membership');

select set_config('request.jwt.claim.sub','ac100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select count(*)::integer from public.assessment_instances where id='ac164000-0000-4000-8000-000000000001'),1,'current exact assessment remains visible through RLS');
select is((select count(*)::integer from public.assessment_instances where id='ac164000-0000-4000-8000-000000000002'),0,'non-current-school assessment is not enumerable through RLS');
select lives_ok(
  $$insert into public.learner_marks(id,tenant_id,school_id,assessment_instance_id,enrolment_id,learner_id,numeric_mark,recorded_by_user_id)
    values('ac180000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ac164000-0000-4000-8000-000000000001','ac171000-0000-4000-8000-000000000001','ac170000-0000-4000-8000-000000000001',72,'ac100000-0000-4000-8000-000000000001')$$,
  'current enrolled learner can receive a current mark from the exact assigned teacher'
);
select throws_ok(
  $$insert into public.learner_marks(id,tenant_id,school_id,assessment_instance_id,enrolment_id,learner_id,numeric_mark,recorded_by_user_id)
    values('ac180000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ac164000-0000-4000-8000-000000000001','ac171000-0000-4000-8000-000000000002','ac170000-0000-4000-8000-000000000002',65,'ac100000-0000-4000-8000-000000000001')$$,
  'Learner mark scope mismatch: learner enrolment is not currently effective',
  'ended learner enrolment cannot receive a current undated assessment mark'
);
select is((select recorded_by_user_id from public.learner_marks where id='ac180000-0000-4000-8000-000000000001'),'ac100000-0000-4000-8000-000000000001'::uuid,'mark recorder provenance is stored as the authenticated teacher');
reset role;

select set_config('request.jwt.claim.sub','ac100000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*)::integer from public.learner_marks where assessment_instance_id='ac164000-0000-4000-8000-000000000003'),0,'stale teacher cannot enumerate learner marks for the stale-authority assessment');
reset role;

select set_config('request.jwt.claim.sub','ac100000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select count(*)::integer from public.assessment_schemes where school_id='22222222-2222-4222-8222-222222222222'),0,'Platform Support cannot enumerate school assessment configuration through a mixed school role');
reset role;

-- Ending the current teacher placement removes current visibility but does not erase
-- the historical mark row or its recorder provenance.
update public.staff_school_assignments
set effective_to=current_date-1
where id='ac150000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','ac100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select count(*)::integer from public.learner_marks where id='ac180000-0000-4000-8000-000000000001'),0,'ended placement removes current marks visibility');
reset role;
select is((select count(*)::integer from public.learner_marks where id='ac180000-0000-4000-8000-000000000001' and recorded_by_user_id='ac100000-0000-4000-8000-000000000001'),1,'historical mark and immutable recorder provenance remain durable after placement ends');

select set_config('request.jwt.claim.sub','ac100000-0000-4000-8000-000000000004',true);
set local role authenticated;
select is((select count(*)::integer from public.assessment_schemes where id='ac162000-0000-4000-8000-000000000001'),1,'current school academic leadership retains assessment oversight visibility');
reset role;

select * from finish();
rollback;
