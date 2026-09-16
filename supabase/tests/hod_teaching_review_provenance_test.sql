-- Stream D / Wave 3: HOD teaching-review oversight regression tests.
--
-- Covers:
--  * HOD review visibility follows assigned department/subject responsibility.
--  * Teacher preparation and submission remain separate; only the preparer
--    may submit.
--  * Submission of selected preparations / week / term.
--  * Review events preserve history; return-for-revision appends, does not
--    overwrite the teacher preparation.
--  * Reviewed status / comment feedback / return / review timestamp+reviewer.
--  * Ended/stale HOD placement loses current operational authority.
--  * Another active non-current school cannot expose teaching plans.
--  * Platform Support is denied.
--  * Historical review provenance survives placement changes.
--  * Readiness RPC returns documented exceptions only; no productivity
--    scores/rankings; no invented Ministry moderation.

begin;

select plan(25);

-- Actors -----------------------------------------------------------------
insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('d1000000-0000-4000-8000-000000000001','hod-a@example.test','authenticated','authenticated',now(),now()),
  ('d1000000-0000-4000-8000-000000000002','hod-b@example.test','authenticated','authenticated',now(),now()),
  ('d1000000-0000-4000-8000-000000000003','teacher-a@example.test','authenticated','authenticated',now(),now()),
  ('d1000000-0000-4000-8000-000000000004','principal@example.test','authenticated','authenticated',now(),now()),
  ('d1000000-0000-4000-8000-000000000005','hod-unassigned@example.test','authenticated','authenticated',now(),now()),
  ('d1000000-0000-4000-8000-000000000006','support@example.test','authenticated','authenticated',now(),now()),
  ('d1000000-0000-4000-8000-000000000007','noncurrent-teacher@example.test','authenticated','authenticated',now(),now());

-- Second school for the cross-school boundary test.
insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values('d1100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Other School','D-OTHER','Erongo','Swakopmund','active')
on conflict (id) do nothing;

set local session_replication_role = replica;

-- Staff identities (tenant-wide).
insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('d1200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','d1000000-0000-4000-8000-000000000001','HODA','Hod','A','active'),
  ('d1200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','d1000000-0000-4000-8000-000000000002','HODB','Hod','B','active'),
  ('d1200000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','d1000000-0000-4000-8000-000000000003','TEACHA','Teacher','A','active'),
  ('d1200000-0000-4000-8000-000000000007','11111111-1111-4111-8111-111111111111','d1000000-0000-4000-8000-000000000007','NC','Non','Current','active');

-- School memberships. HOD-A/HOD-B/teacher have staff_member_id linked to
-- their staff identity (required for the placement-backed responsibility
-- chain). The non-current teacher has an active membership at the teaching
-- school but a newer membership at another school makes that one current.
insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from,active_to) values
  ('d1300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','d1000000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000001','hod',current_date-30,null),
  ('d1300000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','d1000000-0000-4000-8000-000000000002','d1200000-0000-4000-8000-000000000002','hod',current_date-30,null),
  ('d1300000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','d1000000-0000-4000-8000-000000000003','d1200000-0000-4000-8000-000000000003','teacher',current_date-30,null),
  ('d1300000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','d1000000-0000-4000-8000-000000000004',null,'principal',current_date-30,null),
  ('d1300000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','d1000000-0000-4000-8000-000000000005',null,'hod',current_date-30,null),
  ('d1300000-0000-4000-8000-000000000006a','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','d1000000-0000-4000-8000-000000000007','d1200000-0000-4000-8000-000000000007','teacher',current_date-30,null),
  ('d1300000-0000-4000-8000-000000000006b','11111111-1111-4111-8111-111111111111','d1100000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000007',null,'teacher',current_date-1,null);

insert into public.platform_memberships(user_id,role_key,active_from) values
  ('d1000000-0000-4000-8000-000000000006','platform_support',current_date-10);

-- Effective-dated staff placements (the governed authority chain).
insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id) values
  ('d1400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','d1200000-0000-4000-8000-000000000001','management',current_date-30,null,'d1000000-0000-4000-8000-000000000004'),
  ('d1400000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','d1200000-0000-4000-8000-000000000002','management',current_date-30,null,'d1000000-0000-4000-8000-000000000004'),
  ('d1400000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','d1200000-0000-4000-8000-000000000003','teacher',current_date-30,null,'d1000000-0000-4000-8000-000000000004'),
  ('d1400000-0000-4000-8000-000000000007','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','d1200000-0000-4000-8000-000000000007','teacher',current_date-30,null,'d1000000-0000-4000-8000-000000000004');

-- Subjects and offerings (subject A owned by HOD-A, subject B by HOD-B).
insert into public.subjects(id,tenant_id,school_id,subject_code,display_name) values
  ('d1500000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','MATH-A','Mathematics A'),
  ('d1500000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','SCI-B','Science B');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id) values
  ('d1600000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'d1500000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010'),
  ('d1600000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'d1500000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000010');

-- Teacher allocation for subject A (teacher) and subject B (HOD-B teaches
-- their own subject so subject B has a schedule item to submit).
insert into public.teacher_allocations(id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from,active_to) values
  ('d1700000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'d1600000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','d1200000-0000-4000-8000-000000000003',current_date-30,null),
  ('d1700000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'d1600000-0000-4000-8000-000000000002','40000000-0000-4000-8000-00000000001a','d1200000-0000-4000-8000-000000000002',current_date-30,null);

-- Minimal teaching graph (replica mode bypasses the curriculum/pacing FK
-- chain; the review/submit RPCs join through teacher_allocations and
-- subject_offerings which are real rows above).
insert into public.teaching_schedule_items(id,tenant_id,school_id,academic_year,pacing_plan_item_id,register_class_id,teacher_allocation_id,planned_on,planned_period_count,status) values
  ('d1800000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'d1800000-0000-4000-8000-000000000099','40000000-0000-4000-8000-00000000001a','d1700000-0000-4000-8000-000000000001',current_date,1,'planned'),
  ('d1800000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'d1800000-0000-4000-8000-000000000099','40000000-0000-4000-8000-00000000001a','d1700000-0000-4000-8000-000000000002',current_date,1,'planned');

-- Two prepared lessons: one for subject A (teacher), one for subject B (HOD-B
-- as preparer). These are authored via replica because the trigger would
-- otherwise require the full authority graph at insert; the oversight layer
-- under test validates authority at submit/review time instead.
insert into public.lesson_preparations(id,tenant_id,school_id,teaching_schedule_item_id,planned_on,prepared_by_user_id,status) values
  ('d1900000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','d1800000-0000-4000-8000-000000000001',current_date,'d1000000-0000-4000-8000-000000000003','prepared'),
  ('d1900000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','d1800000-0000-4000-8000-000000000002',current_date,'d1000000-0000-4000-8000-000000000002','prepared');

set local session_replication_role = origin;

-- HOD department/subject responsibility: HOD-A owns subject A, HOD-B owns B.
insert into public.subject_department_responsibilities(tenant_id,school_id,subject_id,department_head_staff_assignment_id,effective_from,created_by_user_id) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','d1500000-0000-4000-8000-000000000001','d1400000-0000-4000-8000-000000000001',current_date-30,'d1000000-0000-4000-8000-000000000004'),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','d1500000-0000-4000-8000-000000000002','d1400000-0000-4000-8000-000000000002',current_date-30,'d1000000-0000-4000-8000-000000000004');

-- Helper to act as a given user.
create or replace function _as(p_user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
end; $$;

-- 1. Teacher (preparer) submits selected preparations for subject A. -----
perform _as('d1000000-0000-4000-8000-000000000003');
set local role authenticated;
select lives_ok(
  $$select public.submit_preparations('22222222-2222-4222-8222-222222222222',array['d1900000-0000-4000-8000-000000000001'],'selected_preparations',null,null,null)$$,
  'preparer can submit selected preparations'
);
reset role;

select is(
  (select count(*)::integer from public.preparation_submissions where submitted_by_user_id='d1000000-0000-4000-8000-000000000003'),
  1,
  'submission row created for the preparer'
);
select is(
  (select count(*)::integer from public.preparation_review_events where event_kind='submitted'),
  1,
  'submitted event preserved in history'
);
select is(
  (select status from public.lesson_preparations where id='d1900000-0000-4000-8000-000000000001'),
  'submitted',
  'preparation lifecycle marker advanced to submitted by the preparer'
);

-- 2. Only the preparer may submit (preparation and submission separate). -
perform _as('d1000000-0000-4000-8000-000000000002');
set local role authenticated;
select throws_ok(
  $$select public.submit_preparations('22222222-2222-4222-8222-222222222222',array['d1900000-0000-4000-8000-000000000002'],'selected_preparations',null,null,null)$$,
  'Permission denied: only the preparer may submit preparation d1900000-0000-4000-8000-000000000002',
  'another HOD cannot submit a preparation they did not author'
);
reset role;

-- 3. HOD-A reviews the subject-A submission; HOD-B (not responsible) denied.
perform _as('d1000000-0000-4000-8000-000000000001');
set local role authenticated;
select lives_ok(
  $$select public.review_preparation_submission((select id from public.preparation_submissions where submitted_by_user_id='d1000000-0000-4000-8000-000000000003' limit 1),'reviewed','Looks good')$$,
  'HOD-A can review a submission for their assigned subject'
);
reset role;

-- Re-create a second submission for subject A to test HOD-B denial.
perform _as('d1000000-0000-4000-8000-000000000003');
set local role authenticated;
-- Mark the returned/prepared preparation back to prepared via replica so it
-- can be resubmitted; the prior submission was reviewed, not returned.
set local session_replication_role = replica;
update public.lesson_preparations set status='prepared' where id='d1900000-0000-4000-8000-000000000001';
set local session_replication_role = origin;
select lives_ok(
  $$select public.submit_preparations('22222222-2222-4222-8222-222222222222',array['d1900000-0000-4000-8000-000000000001'],'week',null,current_date,current_date+4)$$,
  'preparer can submit a week-scoped preparation pack'
);
reset role;

perform _as('d1000000-0000-4000-8000-000000000002');
set local role authenticated;
select throws_ok(
  $$select public.review_preparation_submission((select id from public.preparation_submissions where submitted_by_user_id='d1000000-0000-4000-8000-000000000003' order by submitted_at desc limit 1),'reviewed','no')$$,
  'Permission denied: reviewer is not an authorized HOD/leader for this submission',
  'HOD-B cannot review a subject-A submission outside their department responsibility'
);
reset role;

-- 4. HOD without any subject responsibility cannot review. ---------------
perform _as('d1000000-0000-4000-8000-000000000005');
set local role authenticated;
select throws_ok(
  $$select public.review_preparation_submission((select id from public.preparation_submissions where submitted_by_user_id='d1000000-0000-4000-8000-000000000003' order by submitted_at desc limit 1),'reviewed','no')$$,
  'Permission denied: reviewer is not an authorized HOD/leader for this submission',
  'unassigned HOD has no oversight authority'
);
reset role;

-- 5. Platform Support is denied review and submit. ----------------------
perform _as('d1000000-0000-4000-8000-000000000006');
set local role authenticated;
select throws_ok(
  $$select public.review_preparation_submission((select id from public.preparation_submissions where submitted_by_user_id='d1000000-0000-4000-8000-000000000003' order by submitted_at desc limit 1),'reviewed','no')$$,
  'Permission denied: reviewer is not an authorized HOD/leader for this submission',
  'Platform Support cannot review preparation submissions'
);
select throws_ok(
  $$select public.submit_preparations('22222222-2222-4222-8222-222222222222',array['d1900000-0000-4000-8000-000000000001'],'selected_preparations',null,null,null)$$,
  'Permission denied: submitter is not an active teacher/HOD at this school',
  'Platform Support cannot submit preparations'
);
reset role;

-- 6. Another active non-current school cannot expose teaching plans. ----
-- The non-current teacher's deterministic current school is the other school.
perform _as('d1000000-0000-4000-8000-000000000007');
set local role authenticated;
select throws_ok(
  $$select public.submit_preparations('22222222-2222-4222-8222-222222222222',array['d1900000-0000-4000-8000-000000000001'],'selected_preparations',null,null,null)$$,
  'Permission denied: submitter is not current-school scoped',
  'another active non-current school cannot supply submission authority'
);
reset role;

-- 7. Return-for-revision appends history; does not overwrite. -----------
perform _as('d1000000-0000-4000-8000-000000000001');
set local role authenticated;
select lives_ok(
  $$select public.review_preparation_submission((select id from public.preparation_submissions where submitted_by_user_id='d1000000-0000-4000-8000-000000000003' order by submitted_at desc limit 1),'returned','Please add assessment section')$$,
  'HOD-A can return a submission for revision'
);
reset role;

select is(
  (select status from public.preparation_submissions where submitted_by_user_id='d1000000-0000-4000-8000-000000000003' order by submitted_at desc limit 1),
  'returned',
  'returned submission status snapshot reflects return'
);
select is(
  (select count(*)::integer from public.preparation_review_events
    where preparation_submission_id=(select id from public.preparation_submissions where submitted_by_user_id='d1000000-0000-4000-8000-000000000003' order by submitted_at desc limit 1)),
  1,
  'review event history is append-only within a single submission lifecycle'
);
select is(
  (select event_kind from public.preparation_review_events
    where preparation_submission_id=(select id from public.preparation_submissions where submitted_by_user_id='d1000000-0000-4000-8000-000000000003' order by submitted_at desc limit 1) order by occurred_at desc limit 1),
  'returned',
  'latest event is the return action'
);

-- 8. Ended/stale HOD placement loses current operational authority. -----
-- End HOD-A's placement effective yesterday.
update public.staff_school_assignments set effective_to=current_date-1 where id='d1400000-0000-4000-8000-000000000001';
-- Re-open the latest submission so a review can be attempted.
set local session_replication_role = replica;
update public.preparation_submissions set status='submitted' where submitted_by_user_id='d1000000-0000-4000-8000-000000000003' order by submitted_at desc limit 1;
set local session_replication_role = origin;

perform _as('d1000000-0000-4000-8000-000000000001');
set local role authenticated;
select throws_ok(
  $$select public.review_preparation_submission((select id from public.preparation_submissions where submitted_by_user_id='d1000000-0000-4000-8000-000000000003' order by submitted_at desc limit 1),'reviewed','no')$$,
  'Permission denied: reviewer is not an authorized HOD/leader for this submission',
  'ended HOD placement loses review authority'
);
reset role;

-- 9. Historical review provenance survives the placement change. --------
select is(
  (select count(*)::integer from public.preparation_review_events
    where actor_user_id='d1000000-0000-4000-8000-000000000001'
      and actor_role_snapshot='hod'
      and actor_staff_assignment_id='d1400000-0000-4000-8000-000000000001'),
  2,
  'prior HOD-A review events retain reviewer placement provenance after placement ended'
);
select is(
  (select actor_staff_assignment_id is not null from public.preparation_review_events
    where actor_user_id='d1000000-0000-4000-8000-000000000001' order by occurred_at desc limit 1),
  true,
  'reviewer placement snapshot preserved on the event'
);

-- 10. School leadership retains school-wide review authority. ----------
perform _as('d1000000-0000-4000-8000-000000000004');
set local role authenticated;
select lives_ok(
  $$select public.review_preparation_submission((select id from public.preparation_submissions where submitted_by_user_id='d1000000-0000-4000-8000-000000000003' order by submitted_at desc limit 1),'reviewed','leadership reviewed')$$,
  'school leadership can review school-wide regardless of department responsibility'
);
reset role;

-- 11. Readiness RPC: documented exceptions only, no productivity scoring.
perform _as('d1000000-0000-4000-8000-000000000001');
set local role authenticated;
-- HOD-A placement was ended above; restore it so readiness is bounded to
-- subject A only.
update public.staff_school_assignments set effective_to=null where id='d1400000-0000-4000-8000-000000000001';
select lives_ok(
  $$select * from public.resolve_hod_teaching_readiness('22222222-2222-4222-8222-222222222222',2026)$$,
  'HOD-A readiness RPC executes'
);
reset role;

-- Readiness result columns must be exactly the documented exception set;
-- no score/rank/productivity columns exist.
select is(
  (select count(*)::integer from information_schema.columns
    where table_schema='public' and table_name='resolve_hod_teaching_readiness'
      and column_name in ('score','rank','productivity','productivity_score','teacher_score')),
  0,
  'readiness RPC exposes no productivity score/rank columns'
);
select is(
  (select count(*)::integer from information_schema.columns
    where table_schema='public' and table_name='resolve_hod_teaching_readiness'),
  7,
  'readiness RPC returns exactly seven documented columns'
);

-- HOD-A readiness must not leak subject B exceptions (department bounding).
perform _as('d1000000-0000-4000-8000-000000000001');
set local role authenticated;
select is(
  (select count(*)::integer from public.resolve_hod_teaching_readiness('22222222-2222-4222-8222-222222222222',2026) where subject_id='d1500000-0000-4000-8000-000000000002'),
  0,
  'HOD-A readiness does not leak subject-B (other department) exceptions'
);
reset role;

-- 12. append-only review events: direct client insert/update denied. ---
select is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='preparation_review_events' and cmd in ('INSERT','UPDATE','DELETE')),
  0,
  'no client insert/update/delete policy on append-only review events'
);

select * from finish();
rollback;
