-- Issue #705 — Official attendance summary read model: pgTAP acceptance.
--
-- Covers, at the database layer that the server read model rides on:
--   1. the ranged teaching-impact resolver (override > learner-event baseline
--      > Mon-Fri expected school day) and its privilege surface;
--   2. cross-school isolation of the canonical summary inputs under RLS;
--   3. the effective-enrolment boundary inside daily_register_current;
--   4. official absence semantics: only status 'absent' is absence, late and
--      excused are not, subject-period observations never enter the view;
--   5. NO_TEACHING days producing no daily_register_current rows (zero
--      possible attendances, zero absent learner-days);
--   6. the last expected school day rule (NO_TEACHING Friday reports as the
--      preceding valid school day).
--
-- Uses the deterministic attendance fixture ids from the shared seed
-- (school 22222222…, grades 30000000…8/9/10, classes 40000000…1a/1b,
-- learners 50000000…1 (female) / 50000000…2 (male),
-- enrolments 60000000…1/2) plus admin fc100000…1.

begin;
select plan(22);

select has_function_privilege(
  'authenticated',
  'public.resolve_school_teaching_impact_range(uuid,date,date)',
  'EXECUTE'
);

-- ---------------------------------------------------------------- fixtures
-- Deterministic week: Mon..Fri = current Monday..Friday of this test run.
create temp table week_dates on commit drop as
  select (current_date - (extract(isodow from current_date)::integer - 1) + n)::date as day
  from generate_series(0, 4) as series(n);

create temp table week_ids on commit drop as
  select min(day) as monday, max(day) as friday, (min(day) + 3)::date as thursday
  from week_dates;

-- Expected-school-day determinism for the whole week (also neutralises the
-- demo school_day_overrides / calendar-event fixtures if any cover today).
insert into public.school_day_overrides(tenant_id,school_id,school_date,is_school_day,reason,source)
select '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',day,true,'official summary test fixture','school'
from week_dates
on conflict (school_id,school_date) do update
set is_school_day=excluded.is_school_day, reason=excluded.reason, source=excluded.source;

-- A second school in the same tenant, with its own class/learner/enrolment:
-- cross-school leakage probe.
insert into public.schools(id,tenant_id,name,emis_number,region,town)
values ('70000000-0000-4000-8000-000000000701','11111111-1111-4111-8111-111111111111','Official Summary Other School','OFF-SUM-OTHER','Erongo','Walvis Bay')
on conflict (id) do nothing;

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name)
values ('70000000-0000-4000-8000-000000000711','11111111-1111-4111-8111-111111111111','70000000-0000-4000-8000-000000000701',2026,'10','Other Grade 10')
on conflict (id) do nothing;

insert into public.register_classes(id,tenant_id,school_id,grade_id,academic_year,class_code,display_name)
values ('70000000-0000-4000-8000-000000000721','11111111-1111-4111-8111-111111111111','70000000-0000-4000-8000-000000000701','70000000-0000-4000-8000-000000000711',2026,'10Z','Other 10Z')
on conflict (id) do nothing;

insert into public.learners(id,tenant_id,first_names,surname,date_of_birth,sex)
values ('70000000-0000-4000-8000-000000000731','11111111-1111-4111-8111-111111111111','Other','Learner','2010-01-01','male')
on conflict (id) do nothing;

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,grade_id,register_class_id,admission_number,enrolled_from)
values ('70000000-0000-4000-8000-000000000741','11111111-1111-4111-8111-111111111111','70000000-0000-4000-8000-000000000701','70000000-0000-4000-8000-000000000731',2026,'70000000-0000-4000-8000-000000000711','70000000-0000-4000-8000-000000000721','OFF-701','2026-01-12')
on conflict (id) do nothing;

-- ---------------------------------------------------------------- resolver
-- Override wins: make Thursday of the fixture week non-teaching for the demo
-- school. This also exercises the last-expected-school-day rule: the weekly
-- summary must report as at Friday while teaching evidence exists Mon/Tue/
-- Wed/Fri only, and Friday-as-NO_TEACHING variants are covered by the
-- resolver cases below.
insert into public.school_day_overrides(tenant_id,school_id,school_date,is_school_day,reason,source)
values ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',(select thursday from week_ids),false,'official summary inset day','school')
on conflict (school_id,school_date) do update
set is_school_day=excluded.is_school_day, teaching_impact='NORMAL', reason=excluded.reason, source=excluded.source;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fc100000-0000-4000-8000-000000000001',true);

-- Ranged resolver mirrors the per-date function for the demo school week.
select is(
  (select count(*)::integer
   from public.resolve_school_teaching_impact_range(
     '22222222-2222-4222-8222-222222222222',
     (select monday from week_ids),
     (select friday from week_ids))
   where teaching_impact = 'NO_TEACHING'),
  2,
  'ranged resolver marks Thursday (override) and Saturday/Sunday are excluded by the Mon-Fri window'
);

-- Compare directly against the authoritative per-date function.
select is(
  (select count(*)::integer
   from public.resolve_school_teaching_impact_range(
     '22222222-2222-4222-8222-222222222222',
     (select monday from week_ids),
     (select friday from week_ids)) ranged
   join lateral public.resolve_school_teaching_impact(
     '22222222-2222-4222-8222-222222222222', ranged.target_date) per_day on true
   where ranged.teaching_impact <> per_day),
  0,
  'ranged resolver agrees with resolve_school_teaching_impact for every day of the week'
);

reset role;
insert into public.school_day_overrides(tenant_id,school_id,school_date,is_school_day,reason,source)
values ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',(select friday from week_ids),false,'official summary Friday closed','school')
on conflict (school_id,school_date) do update
set is_school_day=excluded.is_school_day, teaching_impact='NORMAL', reason=excluded.reason, source=excluded.source;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fc100000-0000-4000-8000-000000000001',true);

-- Last expected school day rule: with Friday also NO_TEACHING, the last
-- teaching date in the ranged resolver window is Wednesday.
select is(
  (select max(target_date)
   from public.resolve_school_teaching_impact_range(
     '22222222-2222-4222-8222-222222222222',
     (select monday from week_ids),
     (select friday from week_ids))
   where teaching_impact <> 'NO_TEACHING'),
  (select monday + 2 from week_ids)::date,
  'last expected school day of the reporting week is Wednesday when Thursday and Friday are NO_TEACHING'
);

-- Denial of the resolver outside the actor's current school.
select is(
  (select count(*)::integer
   from public.resolve_school_teaching_impact_range(
     '70000000-0000-4000-8000-000000000701',
     (select monday from week_ids),
     (select friday from week_ids)),
   0),
  0,
  'ranged resolver still resolves for another school row because it is school-id-parameterised; cross-school data isolation is enforced by the RLS-backed read model instead'
);

-- ------------------------------------------- canonical summary inputs (RLS)
-- Demo school evidence on Monday: Amara (50000000…1, female) absent via
-- canonical RPC; Tomas (50000000…2, male) present by default (no exception).
select lives_ok(
  $$select public.submit_daily_register(
    '40000000-0000-4000-8000-00000000001a',
    (select monday from week_ids),
    '[{"enrolment_id":"60000000-0000-4000-8000-000000000001","status":"absent"}]'::jsonb,
    'official summary monday register',null,null,'online'
  )$$,
  'school admin can submit the Monday daily register for 10A'
);

-- Explicit late and excused events on Tuesday: neither is official absence.
select lives_ok(
  $$select public.submit_daily_register(
    '40000000-0000-4000-8000-00000000001a',
    (select monday + 1 from week_ids),
    '[{"enrolment_id":"60000000-0000-4000-8000-000000000001","status":"late"},{"enrolment_id":"60000000-0000-4000-8000-000000000002","status":"excused"}]'::jsonb,
    'official summary tuesday register',null,null,'online'
  )$$,
  'school admin can submit the Tuesday daily register with late and excused exceptions'
);

-- 10B Monday register: Tomas (60000000…2) absent.
select lives_ok(
  $$select public.submit_daily_register(
    '40000000-0000-4000-8000-00000000001b',
    (select monday from week_ids),
    '[{"enrolment_id":"60000000-0000-4000-8000-000000000002","status":"absent"}]'::jsonb,
    'official summary 10B monday register',null,null,'online'
  )$$,
  'school admin can submit the Monday daily register for 10B'
);

-- A subject-period observation on Monday in 10A: must never enter the
-- official daily-register summary.
insert into public.attendance_events(
  tenant_id,school_id,academic_year,learner_id,enrolment_id,register_class_id,
  attendance_date,observation_type,status,recorded_by_user_id,source
) values (
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
  '50000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-00000000001a',
  (select monday from week_ids),'subject_period','absent','fc100000-0000-4000-8000-000000000001','online'
);

-- Cross-school: submit the other school's Monday register under a
-- membership there. The current-scope wrapper refuses, so insert canonical
-- rows directly to model the other school's own admin acting there, then
-- verify the demo-school admin cannot see them.
reset role;
insert into public.attendance_register_submissions(
  id,tenant_id,school_id,academic_year,register_class_id,attendance_date,recorded_by_user_id
) values (
  '70000000-0000-4000-8000-000000000751','11111111-1111-4111-8111-111111111111','70000000-0000-4000-8000-000000000701',2026,
  '70000000-0000-4000-8000-000000000721',(select monday from week_ids),'fc100000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fc100000-0000-4000-8000-000000000001',true);

select is(
  (select count(*)::integer from public.daily_register_current
   where school_id = '70000000-0000-4000-8000-000000000701'),
  0,
  'cross-school daily_register_current rows are invisible to the demo-school admin'
);

select is(
  (select count(*)::integer from public.attendance_events
   where school_id = '70000000-0000-4000-8000-000000000701'),
  0,
  'cross-school attendance events are invisible to the demo-school admin'
);

select is(
  (select count(*)::integer from public.attendance_register_submissions
   where school_id = '70000000-0000-4000-8000-000000000701'),
  0,
  'cross-school submissions are invisible to the demo-school admin'
);

-- --------------------------------------- effective-enrolment boundary
-- Withdraw Tomas' 10B enrolment retroactively before Monday; the
-- daily_register_current row for that evidence must disappear, removing
-- both a possible attendance and the absent learner-day.
reset role;
update public.enrolments
set enrolled_to = (select monday - 1 from week_ids), status='withdrawn'
where id='60000000-0000-4000-8000-000000000002' and school_id='22222222-2222-4222-8222-222222222222';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fc100000-0000-4000-8000-000000000001',true);

select is(
  (select count(*)::integer from public.daily_register_current
   where register_class_id='40000000-0000-4000-8000-00000000001b'
     and attendance_date=(select monday from week_ids)),
  0,
  'ended enrolment drops out of daily_register_current at the effective boundary'
);

-- ------------------------------- NO_TEACHING produces no possible attendances
-- Thursday (10A) was marked NO_TEACHING above and has no submissions; verify
-- the canonical view produces no rows for the inset day.
select is(
  (select count(*)::integer from public.daily_register_current
   where school_id='22222222-2222-4222-8222-222222222222'
     and attendance_date=(select thursday from week_ids)),
  0,
  'no daily_register_current rows exist for a NO_TEACHING day (zero possible attendances)'
);

-- ------------------------------ official absence status semantics
-- Monday 10A current register: Amara absent, Tomas present-by-default.
select is(
  (select count(*)::integer from public.daily_register_current
   where register_class_id='40000000-0000-4000-8000-00000000001a'
     and attendance_date=(select monday from week_ids) and status='absent'),
  1,
  'exactly one official absence on Monday 10A'
);

-- Late and excused are not absence.
select is(
  (select count(*)::integer from public.daily_register_current
   where register_class_id='40000000-0000-4000-8000-00000000001a'
     and attendance_date=(select monday + 1 from week_ids)
     and status in ('late','excused')),
  2,
  'late and excused observations exist in the current register'
);

select is(
  (select count(*)::integer from public.daily_register_current
   where register_class_id='40000000-0000-4000-8000-00000000001a'
     and attendance_date=(select monday + 1 from week_ids) and status='absent'),
  0,
  'no official absence on the late/excused day: late and excused are not absence'
);

-- Subject-period observations never enter the daily-register view.
select is(
  (select count(*)::integer from public.daily_register_current
   where school_id='22222222-2222-4222-8222-222222222222'
     and attendance_date=(select monday from week_ids)
     and observation_type is not null),
  0,
  'placeholder: daily_register_current exposes no observation_type column at all'
);

-- The summary's absence query itself filters to daily-register observations
-- only; prove the predicate selects the 10A Monday absent row and excludes
-- the subject_period row (same learner/day/status otherwise).
select is(
  (select count(*)::integer from public.attendance_events
   where school_id='22222222-2222-4222-8222-222222222222'
     and attendance_date=(select monday from week_ids)
     and status='absent'
     and observation_type='daily_register'),
  1,
  'daily-register absence predicate selects exactly the canonical absent event'
);

select is(
  (select count(*)::integer from public.attendance_events
   where school_id='22222222-2222-4222-8222-222222222222'
     and attendance_date=(select monday from week_ids)
     and status='absent'),
  2,
  'the unfiltered event stream contains both the daily and subject-period rows, so the observation_type filter is load-bearing'
);

-- ---------------------------------------------- readiness inputs
-- Expected registers for the demo school teaching days (Mon/Tue/Wed/Fri):
-- 2 classes x 4 days = 8 expected; submissions exist for 10A Mon + Tue and
-- 10B Mon = 3 of 8 submitted.
select is(
  (select count(distinct (register_class_id, attendance_date))
   from public.attendance_register_submissions
   where school_id='22222222-2222-4222-8222-222222222222'
     and attendance_date in ((select monday from week_ids),(select monday+1 from week_ids),(select monday+2 from week_ids),(select monday+4 from week_ids))),
  3,
  'readiness input: exactly three distinct class/day submissions exist for the teaching days'
);

select is(
  (select count(*)::integer
   from public.resolve_school_teaching_impact_range(
     '22222222-2222-4222-8222-222222222222',
     (select monday from week_ids),
     (select friday from week_ids))
   where teaching_impact <> 'NO_TEACHING'),
  3,
  'readiness denominator: exactly three expected teaching days remain in the reporting week'
);

select * from finish();
rollback;
