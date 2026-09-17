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
  ('d1300000-0000-4000-8000-000000000006','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','d1000000-0000-4000-8000-000000000007','d1200000-0000-4000-8000-000000000007','teacher',current_date-30,null),
  ('d1300000-0000-4000-8000-000000000007','11111111-1111-4111-8111-111111111111','d1100000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000007',null,'teacher',current_date-1,null);

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

-- RPC signature: (uuid, uuid[], text, text, date, date).
-- Capture each returned ID: now() is identical throughout this transaction.
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000003', true);

select lives_ok($$select set_config('test.stream_d_selected',public.submit_preparations('22222222-2222-4222-8222-222222222222'::uuid,array['d1900000-0000-4000-8000-000000000001']::uuid[],'selected_preparations'::text,null::text,null::date,null::date)::text,true)$$, 'preparer can submit selected preparations');

select ok(
  (select count(*)=1 from public.preparation_submissions where id=current_setting('test.stream_d_selected')::uuid)
  and (select count(*)=1 from public.preparation_review_events where preparation_submission_id=current_setting('test.stream_d_selected')::uuid and event_kind='submitted')
  and (select status='submitted' from public.lesson_preparations where id='d1900000-0000-4000-8000-000000000001'),
  'submission, submitted history and preparation lifecycle are created together');

select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000002', true);

select throws_ok($$select public.submit_preparations('22222222-2222-4222-8222-222222222222'::uuid,array['d1900000-0000-4000-8000-000000000001']::uuid[],'selected_preparations'::text,null::text,null::date,null::date)$$, 'P0001', 'Permission denied: only the preparer may submit preparation d1900000-0000-4000-8000-000000000001', 'another HOD cannot submit someone else preparation');

select throws_ok($$select public.submit_preparations('22222222-2222-4222-8222-222222222222'::uuid,array['d1900000-0000-4000-8000-000000000002','d1900000-0000-4000-8000-000000000001']::uuid[],'selected_preparations'::text,null::text,null::date,null::date)$$, 'P0001', 'Permission denied: only the preparer may submit preparation d1900000-0000-4000-8000-000000000001', 'every item is ownership-checked even after a valid first preparation');

select throws_ok($$select public.submit_preparations('22222222-2222-4222-8222-222222222222'::uuid,array[]::uuid[],'selected_preparations'::text,null::text,null::date,null::date)$$, 'P0001', 'At least one lesson preparation is required', 'empty UUID array cannot create a submission');

select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);

select lives_ok($$select public.review_preparation_submission(current_setting('test.stream_d_selected')::uuid,'reviewed'::text,'Review feedback'::text)$$, 'responsible HOD can review subject A');

select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000003', true);

-- Fixture reset only; production submit/review triggers remain enabled.
set local session_replication_role = replica;
update public.lesson_preparations set status='prepared' where id='d1900000-0000-4000-8000-000000000001';
set local session_replication_role = origin;

select lives_ok($$select set_config('test.stream_d_week',public.submit_preparations('22222222-2222-4222-8222-222222222222'::uuid,array['d1900000-0000-4000-8000-000000000001']::uuid[],'week'::text,null::text,current_date::date,(current_date+4)::date)::text,true)$$, 'preparer can submit a week pack with DATE arguments');

select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000002', true);
set local role authenticated;

select is(array[
  (select count(*)::integer from public.preparation_submissions where id=current_setting('test.stream_d_week')::uuid),
  (select count(*)::integer from public.preparation_submission_items where preparation_submission_id=current_setting('test.stream_d_week')::uuid),
  (select count(*)::integer from public.preparation_review_events where preparation_submission_id=current_setting('test.stream_d_week')::uuid)
], array[0,0,0], 'wrong-subject HOD cannot enumerate submissions, items or events under RLS');
reset role;

select throws_ok($$select public.review_preparation_submission(current_setting('test.stream_d_week')::uuid,'reviewed'::text,'Review feedback'::text)$$, 'P0001', 'Permission denied: reviewer is not an authorized HOD/leader for this submission', 'wrong-subject HOD cannot review a known submission ID');

select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000005', true);

select throws_ok($$select public.review_preparation_submission(current_setting('test.stream_d_week')::uuid,'reviewed'::text,'Review feedback'::text)$$, 'P0001', 'Permission denied: reviewer is not an authorized HOD/leader for this submission', 'unassigned HOD has no review authority');

select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000006', true);

select throws_ok($$select public.review_preparation_submission(current_setting('test.stream_d_week')::uuid,'reviewed'::text,'Review feedback'::text)$$, 'P0001', 'Permission denied: reviewer is not an authorized HOD/leader for this submission', 'Platform Support cannot review');

select throws_ok($$select public.submit_preparations('22222222-2222-4222-8222-222222222222'::uuid,array['d1900000-0000-4000-8000-000000000001']::uuid[],'selected_preparations'::text,null::text,null::date,null::date)$$, 'P0001', 'Permission denied: submitter is not an active teacher/HOD at this school', 'Platform Support cannot submit');

select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000007', true);

select throws_ok($$select public.submit_preparations('22222222-2222-4222-8222-222222222222'::uuid,array['d1900000-0000-4000-8000-000000000001']::uuid[],'selected_preparations'::text,null::text,null::date,null::date)$$, 'P0001', 'Permission denied: submitter is not current-school scoped', 'non-current school cannot supply submission authority');

select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
create temp table preparation_before_review as
  select to_jsonb(lp) as content from public.lesson_preparations lp where id='d1900000-0000-4000-8000-000000000001';

select lives_ok($$select public.review_preparation_submission(current_setting('test.stream_d_week')::uuid,'returned'::text,'Review feedback'::text)$$, 'responsible HOD can return for revision');

select ok(
  (select status='returned' and review_note='Review feedback' and reviewed_at is not null from public.preparation_submissions where id=current_setting('test.stream_d_week')::uuid)
  and (select to_jsonb(lp)=(select content from preparation_before_review) from public.lesson_preparations lp where id='d1900000-0000-4000-8000-000000000001'),
  'return updates oversight feedback without changing any teacher preparation content');

select is(
  (select array_agg(event_kind order by event_kind) from public.preparation_review_events where preparation_submission_id=current_setting('test.stream_d_week')::uuid),
  array['returned','submitted']::text[], 'return appends to the submitted event instead of replacing it');
update public.staff_school_assignments set effective_to=current_date-1 where id='d1400000-0000-4000-8000-000000000001';
-- Select the exact captured submission; UPDATE does not accept ORDER BY/LIMIT.
update public.preparation_submissions set status='submitted' where id=current_setting('test.stream_d_week')::uuid;

select throws_ok($$select public.review_preparation_submission(current_setting('test.stream_d_week')::uuid,'reviewed'::text,'Review feedback'::text)$$, 'P0001', 'Permission denied: reviewer is not an authorized HOD/leader for this submission', 'ended HOD placement loses review authority');

select is(
  (select count(*)::integer from public.preparation_review_events where actor_user_id='d1000000-0000-4000-8000-000000000001' and actor_role_snapshot='hod' and actor_staff_assignment_id='d1400000-0000-4000-8000-000000000001'),
  2, 'both historical HOD reviews retain their exact placement after it ends');

select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000004', true);

select lives_ok($$select public.review_preparation_submission(current_setting('test.stream_d_week')::uuid,'reviewed'::text,'Review feedback'::text)$$, 'governed school leadership retains school-wide review authority');

select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
update public.staff_school_assignments set effective_to=null where id='d1400000-0000-4000-8000-000000000001';

select lives_ok($$select * from public.resolve_hod_teaching_readiness('22222222-2222-4222-8222-222222222222'::uuid,2026)$$, 'HOD readiness executes');

select is(
  (select array_agg(p.proargnames[a.ordinality] order by a.ordinality)
   from pg_proc p cross join lateral unnest(p.proargmodes) with ordinality a(mode,ordinality)
   where p.oid='public.resolve_hod_teaching_readiness(uuid,integer)'::regprocedure and a.mode='t'),
  array['exception_kind','subject_offering_id','subject_id','register_class_id','teacher_allocation_id','detail','severity']::text[],
  'readiness has exactly seven documented output columns and no score/rank/productivity model');

select is(
  (select count(*)::integer from public.resolve_hod_teaching_readiness('22222222-2222-4222-8222-222222222222'::uuid,2026) where subject_id='d1500000-0000-4000-8000-000000000002'),
  0, 'readiness does not leak another department');
set local role authenticated;

select ok(
  not has_table_privilege('authenticated','public.preparation_review_events','INSERT')
  and not has_table_privilege('authenticated','public.preparation_review_events','UPDATE')
  and not has_table_privilege('authenticated','public.preparation_review_events','DELETE'),
  'review history is append-only through governed RPCs; clients have no write privileges');

select ok(
  not has_table_privilege('authenticated','public.preparation_submissions','INSERT')
  and not has_table_privilege('authenticated','public.preparation_submissions','UPDATE')
  and not has_table_privilege('authenticated','public.preparation_submission_items','INSERT'),
  'clients cannot bypass empty/per-item validation or rewrite reviewed submission state');

select is(array[
  (select count(*)::integer from public.preparation_submissions where id=current_setting('test.stream_d_week')::uuid),
  (select count(*)::integer from public.preparation_submission_items where preparation_submission_id=current_setting('test.stream_d_week')::uuid),
  (select count(*)::integer from public.preparation_review_events where preparation_submission_id=current_setting('test.stream_d_week')::uuid)
], array[1,1,3], 'responsible HOD can read the submission, item and complete review history under RLS');
reset role;

select * from finish();
rollback;
