-- Stream A / Wave 3 (issue #468): governed teaching-plan authoring authority.
--
-- Regression coverage for supabase/migrations/20260918140000_teaching_planning_authoring_authority.sql
--
-- Covers:
--  * national_baseline plan layers are Platform Admin only; no ordinary school
--    actor can author a national baseline.
--  * School Admin/Principal retain current-school school-wide department/class
--    authoring authority.
--  * HOD authoring authority is bounded by an active subject department
--    responsibility; a HOD cannot author another department's plan or item, and
--    an unassigned HOD has no planning authority at all.
--  * Another active, non-current school membership cannot mutate this school's
--    plans even though the same user still holds the leadership role there.
--  * Platform Support gains no teaching mutation authority.
--  * Pacing plan items inherit exactly the parent plan boundary.
--  * Scheduled lessons may only be placed inside the allocation window.
--  * The allocated teacher keeps their own scheduling authority.
--  * An HOD who is ALSO the member of staff an allocation belongs to keeps that
--    allocation's write authority even outside their department responsibility,
--    because src/features/academics/server/lesson-preparation.ts records
--    prepared/taught status through exactly that path. Bounded by ownership, not
--    by the membership role label.
--  * READ visibility through can_access_teaching_plan is deliberately unchanged
--    while write authority is narrowed. Because the two offending legacy
--    policies were declared FOR ALL, dropping them also closes a leftover SELECT
--    path: has_school_role does not check the current school, so a member whose
--    active but NON-CURRENT school was this one could read these plans through
--    the broad policy alone. That leak is now gone and the surviving legitimate
--    read path is asserted below.
--  * The over-broad legacy policies are gone and the new predicates follow the
--    anon/authenticated execution boundary.

begin;

select plan(30);

-- Actors ---------------------------------------------------------------------
insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('e1000000-0000-4000-8000-000000000001','principal@example.test','authenticated','authenticated',now(),now()),
  ('e1000000-0000-4000-8000-000000000002','hod-a@example.test','authenticated','authenticated',now(),now()),
  ('e1000000-0000-4000-8000-000000000003','hod-b@example.test','authenticated','authenticated',now(),now()),
  ('e1000000-0000-4000-8000-000000000004','cross-school-principal@example.test','authenticated','authenticated',now(),now()),
  ('e1000000-0000-4000-8000-000000000005','support@example.test','authenticated','authenticated',now(),now()),
  ('e1000000-0000-4000-8000-000000000006','platform-admin@example.test','authenticated','authenticated',now(),now()),
  ('e1000000-0000-4000-8000-000000000007','teacher-a@example.test','authenticated','authenticated',now(),now()),
  ('e1000000-0000-4000-8000-000000000008','unassigned-hod@example.test','authenticated','authenticated',now(),now());

-- A second school whose only purpose is to make a membership non-current.
insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values('e0100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Elsewhere Secondary','E-ELSE','Erongo','Walvis Bay','active')
on conflict (id) do nothing;

insert into public.platform_memberships(user_id,role_key,active_from) values
  ('e1000000-0000-4000-8000-000000000005','platform_support',current_date-10),
  ('e1000000-0000-4000-8000-000000000006','platform_admin',current_date-10);

-- Fixtures are built with triggers suspended. The school-membership scope guard
-- legitimately rejects a staff-linked membership whose staff member has not been
-- inserted yet, and this graph is deliberately inserted child-before-parent so
-- it can be built in a single pass. Every authority assertion runs after the
-- switch back to 'origin', so no assertion is taken with triggers disabled.
set local session_replication_role = replica;

-- Memberships. HOD-A/HOD-B/teacher-A carry the staff identity their effective
-- placement and department responsibility chain resolves through. The
-- cross-school principal holds a genuine principal membership here but a newer
-- membership elsewhere, so this school is no longer their current school.
insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from,active_to) values
  ('e1100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e1000000-0000-4000-8000-000000000001',null,'principal',current_date-30,null),
  ('e1100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e1000000-0000-4000-8000-000000000002','e1200000-0000-4000-8000-000000000001','hod',current_date-30,null),
  ('e1100000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e1000000-0000-4000-8000-000000000003','e1200000-0000-4000-8000-000000000002','hod',current_date-30,null),
  ('e1100000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e1000000-0000-4000-8000-000000000004',null,'principal',current_date-30,null),
  ('e1100000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','e0100000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004',null,'principal',current_date-1,null),
  ('e1100000-0000-4000-8000-000000000006','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e1000000-0000-4000-8000-000000000007','e1200000-0000-4000-8000-000000000003','teacher',current_date-30,null),
  ('e1100000-0000-4000-8000-000000000007','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e1000000-0000-4000-8000-000000000008',null,'hod',current_date-30,null);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('e1200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','e1000000-0000-4000-8000-000000000002','HODA','Hod','A','active'),
  ('e1200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','e1000000-0000-4000-8000-000000000003','HODB','Hod','B','active'),
  ('e1200000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','e1000000-0000-4000-8000-000000000007','TEACHA','Teacher','A','active');

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id) values
  ('e1300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e1200000-0000-4000-8000-000000000001','management',current_date-30,null,'e1000000-0000-4000-8000-000000000001'),
  ('e1300000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e1200000-0000-4000-8000-000000000002','management',current_date-30,null,'e1000000-0000-4000-8000-000000000001'),
  ('e1300000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e1200000-0000-4000-8000-000000000003','teacher',current_date-30,null,'e1000000-0000-4000-8000-000000000001');

-- One governed curriculum version drives both subject offerings.
insert into public.curriculum_subjects(id,curriculum_key,display_name,authority) values
  ('e1400000-0000-4000-8000-000000000001','wave3-planning-probe','Wave 3 Planning Probe Subject','NIED');

insert into public.curriculum_versions(id,curriculum_subject_id,version_key,effective_from_year,status) values
  ('e1500000-0000-4000-8000-000000000001','e1400000-0000-4000-8000-000000000001','wave3-planning-2026',2026,'published');

insert into public.curriculum_units(id,curriculum_version_id,unit_code,topic,sequence_number) values
  ('e1600000-0000-4000-8000-000000000001','e1500000-0000-4000-8000-000000000001','U-A','Unit A',10),
  ('e1600000-0000-4000-8000-000000000002','e1500000-0000-4000-8000-000000000001','U-B','Unit B',20);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name) values
  ('e1700000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','MATH-A','Mathematics A'),
  ('e1700000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','SCI-B','Science B');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,curriculum_version_id) values
  ('e1800000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e1700000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010','e1500000-0000-4000-8000-000000000001'),
  ('e1800000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e1700000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000010','e1500000-0000-4000-8000-000000000001');

insert into public.teacher_allocations(id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from,active_to) values
  ('e1900000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e1800000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','e1200000-0000-4000-8000-000000000003',current_date-30,current_date+30),
  ('e1900000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e1800000-0000-4000-8000-000000000002','40000000-0000-4000-8000-00000000001a','e1200000-0000-4000-8000-000000000002',current_date-30,current_date+30),
  -- Allocation 003 exists to prove the ownership branch: it belongs to HOD-A,
  -- who is NOT responsible for Science B, on the Science B offering. Under the
  -- old policy HOD-A wrote this through the school-wide hod shortcut; under the
  -- new policy HOD-A writes it as the member of staff who owns the allocation.
  ('e1900000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e1800000-0000-4000-8000-000000000002','40000000-0000-4000-8000-00000000001a','e1200000-0000-4000-8000-000000000001',current_date-30,current_date+30);

-- Pre-existing department plans and one item each, so item/schedule authority can
-- be exercised against a realistic parent plan.
insert into public.pacing_plans(id,tenant_id,school_id,academic_year,subject_offering_id,curriculum_version_id,plan_level,status,created_by_user_id) values
  ('e2000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e1800000-0000-4000-8000-000000000001','e1500000-0000-4000-8000-000000000001','department','draft','e1000000-0000-4000-8000-000000000001'),
  ('e2000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e1800000-0000-4000-8000-000000000002','e1500000-0000-4000-8000-000000000001','department','draft','e1000000-0000-4000-8000-000000000001');

insert into public.pacing_plan_items(id,tenant_id,school_id,pacing_plan_id,curriculum_unit_id,planned_periods,priority,sequence_number) values
  ('e2100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e2000000-0000-4000-8000-000000000001','e1600000-0000-4000-8000-000000000001',4,'normal',10),
  ('e2100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e2000000-0000-4000-8000-000000000002','e1600000-0000-4000-8000-000000000002',4,'normal',20);

set local session_replication_role = origin;

-- Governed responsibilities: HOD-A owns subject A, HOD-B owns subject B.
insert into public.subject_department_responsibilities(tenant_id,school_id,subject_id,department_head_staff_assignment_id,effective_from,created_by_user_id) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e1700000-0000-4000-8000-000000000001','e1300000-0000-4000-8000-000000000001',current_date-30,'e1000000-0000-4000-8000-000000000001'),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e1700000-0000-4000-8000-000000000002','e1300000-0000-4000-8000-000000000002',current_date-30,'e1000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.role','authenticated',true);

-- national_baseline remains Platform Admin only ------------------------------
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000006',true);
set local role authenticated;
select lives_ok(
  $$insert into public.pacing_plans(id,tenant_id,school_id,academic_year,subject_offering_id,curriculum_version_id,plan_level,created_by_user_id) values('e3000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e1800000-0000-4000-8000-000000000001','e1500000-0000-4000-8000-000000000001','national_baseline','e1000000-0000-4000-8000-000000000006')$$,
  'Platform Admin authors a national_baseline plan layer'
);
reset role;

select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok(
  $$insert into public.pacing_plans(id,tenant_id,school_id,academic_year,subject_offering_id,curriculum_version_id,plan_level,created_by_user_id) values('e3000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e1800000-0000-4000-8000-000000000001','e1500000-0000-4000-8000-000000000001','national_baseline','e1000000-0000-4000-8000-000000000001')$$,
  '42501',null,'a school principal cannot author a national_baseline plan layer'
);

-- Current-school school-wide authority is preserved.
select lives_ok(
  $$insert into public.pacing_plans(id,tenant_id,school_id,academic_year,subject_offering_id,curriculum_version_id,plan_level,created_by_user_id) values('e3000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e1800000-0000-4000-8000-000000000001','e1500000-0000-4000-8000-000000000001','department','e1000000-0000-4000-8000-000000000001')$$,
  'current-school principal authors a department plan'
);
reset role;

-- HOD authority is bounded by the department responsibility -------------------
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select lives_ok(
  $$insert into public.pacing_plans(id,tenant_id,school_id,academic_year,subject_offering_id,curriculum_version_id,plan_level,created_by_user_id) values('e3000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e1800000-0000-4000-8000-000000000001','e1500000-0000-4000-8000-000000000001','department','e1000000-0000-4000-8000-000000000002')$$,
  'HOD responsible for the subject authors that subject department plan'
);
select throws_ok(
  $$insert into public.pacing_plans(id,tenant_id,school_id,academic_year,subject_offering_id,curriculum_version_id,plan_level,created_by_user_id) values('e3000000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e1800000-0000-4000-8000-000000000002','e1500000-0000-4000-8000-000000000001','department','e1000000-0000-4000-8000-000000000002')$$,
  '42501',null,'HOD cannot author another department subject plan'
);
select lives_ok(
  $$insert into public.pacing_plans(id,tenant_id,school_id,academic_year,subject_offering_id,curriculum_version_id,plan_level,register_class_id,created_by_user_id) values('e3000000-0000-4000-8000-000000000006','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e1800000-0000-4000-8000-000000000001','e1500000-0000-4000-8000-000000000001','class','40000000-0000-4000-8000-00000000001a','e1000000-0000-4000-8000-000000000002')$$,
  'HOD responsible for the subject authors a class layer for that subject'
);
reset role;

select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000008',true);
set local role authenticated;
select throws_ok(
  $$insert into public.pacing_plans(id,tenant_id,school_id,academic_year,subject_offering_id,curriculum_version_id,plan_level,created_by_user_id) values('e3000000-0000-4000-8000-000000000007','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e1800000-0000-4000-8000-000000000001','e1500000-0000-4000-8000-000000000001','department','e1000000-0000-4000-8000-000000000008')$$,
  '42501',null,'HOD with no department responsibility has no planning authority'
);
reset role;

-- Non-current school membership and Platform Support -------------------------
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select throws_ok(
  $$insert into public.pacing_plans(id,tenant_id,school_id,academic_year,subject_offering_id,curriculum_version_id,plan_level,created_by_user_id) values('e3000000-0000-4000-8000-000000000008','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e1800000-0000-4000-8000-000000000001','e1500000-0000-4000-8000-000000000001','department','e1000000-0000-4000-8000-000000000004')$$,
  '42501',null,'a non-current school membership cannot author this school plan'
);
reset role;

select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000005',true);
set local role authenticated;
select throws_ok(
  $$insert into public.pacing_plans(id,tenant_id,school_id,academic_year,subject_offering_id,curriculum_version_id,plan_level,created_by_user_id) values('e3000000-0000-4000-8000-000000000009','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e1800000-0000-4000-8000-000000000001','e1500000-0000-4000-8000-000000000001','department','e1000000-0000-4000-8000-000000000005')$$,
  null::char(5),null,'Platform Support gains no teaching-plan authoring authority'
);
reset role;

-- Pacing plan items inherit the parent plan boundary -------------------------
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select lives_ok(
  $$insert into public.pacing_plan_items(id,tenant_id,school_id,pacing_plan_id,curriculum_unit_id,planned_periods,sequence_number) values('e3100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e2000000-0000-4000-8000-000000000001','e1600000-0000-4000-8000-000000000001',4,30)$$,
  'HOD authors an item on their own department plan'
);
select throws_ok(
  $$insert into public.pacing_plan_items(id,tenant_id,school_id,pacing_plan_id,curriculum_unit_id,planned_periods,sequence_number) values('e3100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e2000000-0000-4000-8000-000000000002','e1600000-0000-4000-8000-000000000002',4,30)$$,
  '42501',null,'HOD cannot author an item on another department plan'
);
reset role;

select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select lives_ok(
  $$insert into public.pacing_plan_items(id,tenant_id,school_id,pacing_plan_id,curriculum_unit_id,planned_periods,sequence_number) values('e3100000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e2000000-0000-4000-8000-000000000002','e1600000-0000-4000-8000-000000000002',4,30)$$,
  'the responsible HOD authors an item on their own department plan'
);
reset role;

-- Plan and item updates stay inside the same boundary ------------------------
-- UPDATE is asserted by reading the value back: a failing USING clause filters
-- the row out silently instead of raising, so only the stored value proves the
-- boundary held.
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
update public.pacing_plans set status='active' where id='e2000000-0000-4000-8000-000000000001';
select is(
  (select status from public.pacing_plans where id='e2000000-0000-4000-8000-000000000001'),
  'active','current-school principal updates a plan status'
);
reset role;

select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
update public.pacing_plans set status='archived' where id='e2000000-0000-4000-8000-000000000002';
reset role;
select is(
  (select status from public.pacing_plans where id='e2000000-0000-4000-8000-000000000002'),
  'draft','HOD cannot update another department plan'
);
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
update public.pacing_plan_items set planned_periods=6 where id='e2100000-0000-4000-8000-000000000001';
select is(
  (select planned_periods from public.pacing_plan_items where id='e2100000-0000-4000-8000-000000000001'),
  6::smallint,'HOD updates an item on their own department plan'
);
update public.pacing_plan_items set planned_periods=6 where id='e2100000-0000-4000-8000-000000000002';
reset role;
select is(
  (select planned_periods from public.pacing_plan_items where id='e2100000-0000-4000-8000-000000000002'),
  4::smallint,'HOD cannot update another department plan item'
);

-- Scheduling: allocation window and author boundary --------------------------
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000007',true);
set local role authenticated;
select lives_ok(
  $$insert into public.teaching_schedule_items(id,tenant_id,school_id,academic_year,pacing_plan_item_id,register_class_id,teacher_allocation_id,planned_on,planned_period_count) values('e3200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e2100000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','e1900000-0000-4000-8000-000000000001',current_date,1)$$,
  'the allocated teacher schedules a lesson inside their allocation window'
);
select throws_ok(
  $$insert into public.teaching_schedule_items(id,tenant_id,school_id,academic_year,pacing_plan_item_id,register_class_id,teacher_allocation_id,planned_on,planned_period_count) values('e3200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e2100000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','e1900000-0000-4000-8000-000000000001',(current_date-31)::date,1)$$,
  'P0001','Teaching schedule allocation window mismatch: lesson date is outside the teacher allocation window',
  'a lesson cannot be scheduled before the allocation it names begins'
);
reset role;

select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok(
  $$insert into public.teaching_schedule_items(id,tenant_id,school_id,academic_year,pacing_plan_item_id,register_class_id,teacher_allocation_id,planned_on,planned_period_count) values('e3200000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e2100000-0000-4000-8000-000000000002','40000000-0000-4000-8000-00000000001a','e1900000-0000-4000-8000-000000000002',current_date,1)$$,
  '42501',null,'HOD cannot schedule lessons on another department plan'
);
reset role;

-- Ownership keeps the existing lesson-preparation writer working -------------
-- HOD-A owns allocation 003 on the Science B offering but is responsible for
-- Mathematics A. The department branch must refuse it; ownership must allow it.
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select lives_ok(
  $$insert into public.teaching_schedule_items(id,tenant_id,school_id,academic_year,pacing_plan_item_id,register_class_id,teacher_allocation_id,planned_on,planned_period_count,status) values('e3200000-0000-4000-8000-000000000006','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e2100000-0000-4000-8000-000000000002','40000000-0000-4000-8000-00000000001a','e1900000-0000-4000-8000-000000000003',current_date,1,'planned')$$,
  'an HOD who owns the allocation still schedules outside their department responsibility'
);
update public.teaching_schedule_items set status='prepared' where id='e3200000-0000-4000-8000-000000000006';
select is(
  (select status from public.teaching_schedule_items where id='e3200000-0000-4000-8000-000000000006'),
  'prepared','the allocated teacher records prepared status exactly as lesson-preparation.ts does'
);
reset role;

select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok(
  $$insert into public.teaching_schedule_items(id,tenant_id,school_id,academic_year,pacing_plan_item_id,register_class_id,teacher_allocation_id,planned_on,planned_period_count) values('e3200000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e2100000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','e1900000-0000-4000-8000-000000000001',current_date+1,1)$$,
  'the plan author schedules a lesson on their own school plan item'
);
reset role;

select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000005',true);
set local role authenticated;
select throws_ok(
  $$insert into public.teaching_schedule_items(id,tenant_id,school_id,academic_year,pacing_plan_item_id,register_class_id,teacher_allocation_id,planned_on,planned_period_count) values('e3200000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e2100000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','e1900000-0000-4000-8000-000000000001',current_date,1)$$,
  null::char(5),null,'Platform Support gains no lesson scheduling authority'
);
reset role;

-- HOD read visibility now follows the same explicit subject responsibility. --
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.pacing_plans where id='e2000000-0000-4000-8000-000000000002'),
  0,'HOD cannot read another department plan merely because they hold the HOD role'
);
reset role;

select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.pacing_plans),
  0,'the dropped FOR ALL policies no longer leak reads to a non-current school membership'
);
reset role;

-- Structural guarantees ------------------------------------------------------
select is(
  (select count(*)::integer from pg_policies
    where schemaname='public'
      and policyname in (
        'academic leaders can manage pacing plans',
        'academic leaders can manage pacing plans [insert]',
        'academic leaders can manage pacing items',
        'scoped staff can manage teaching schedule'
      )),
  0,'the over-broad legacy planning write policies are gone'
);

select is(
  (select count(*)::integer from pg_policies
    where schemaname='public'
      and policyname in (
        'planning authors can create pacing plans',
        'planning authors can update pacing plans',
        'planning authors can delete pacing plans',
        'planning authors can create pacing items',
        'planning authors can update pacing items',
        'planning authors can delete pacing items',
        'planning authors can create teaching schedule',
        'planning authors can update teaching schedule',
        'planning authors can delete teaching schedule'
      )),
  9,'every narrowed planning write policy exists'
);

select is(
  has_function_privilege(
    'anon'::name,
    'app_private.can_author_teaching_plan(uuid,uuid,text)'::regprocedure::oid,
    'EXECUTE'::text
  ),
  false,'anonymous clients cannot execute the planning authoring predicate'
);

select is(
  has_function_privilege(
    'authenticated'::name,
    'app_private.can_author_teaching_plan(uuid,uuid,text)'::regprocedure::oid,
    'EXECUTE'::text
  ),
  true,'authenticated clients can execute the predicate the RLS policies call'
);

select is(
  (select count(*)::integer from pg_trigger
    where tgname='teaching_schedule_allocation_window_trg'
      and tgrelid='public.teaching_schedule_items'::regclass
      and not tgisinternal),
  1,'the allocation window trigger guards scheduled lessons'
);

select * from finish();
rollback;
