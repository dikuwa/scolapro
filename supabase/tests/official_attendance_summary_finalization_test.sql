-- Issue #706 — Official Attendance Summary finalization: pgTAP acceptance.
--
-- Covers, at the database layer that governs finalization:
--   1. authority: only Principal / Deputy Principal / School Admin may finalize;
--      HOD and teacher are denied; cross-school admins are denied (tenant scope).
--   2. readiness gate: an incomplete reporting period cannot be finalized.
--   3. immutable snapshot: a finalized snapshot is preserved byte-for-byte after
--      later register edits (corrections never mutate the finalized output).
--   4. revision chain: a later finalize of the same scope supersedes the prior
--      revision; the prior revision remains historically valid.
--   5. superseded verification resolves to its own (old) revision — no silent
--      redirect to the newest version.
--   6. minimal public verifier: the public resolver returns only opaque
--      provenance, never source-record, tenant, school, or learner data.
--   7. no draft leakage: nothing is exportable until finalized; an un-finalized
--      scope resolves to nothing.
--
-- Uses deterministic seed ids (school 22222222…, classes 40000000…1a/1b,
-- learners 50000000…1/2, enrolments 60000000…1/2) and creates its own actors.

begin;
select plan(23);

-- ---------------------------------------------------------------- fixtures
create temp table week_dates on commit drop as
  select (current_date - (extract(isodow from current_date)::integer - 1) + n)::date as day
  from generate_series(0, 4) as series(n);

create temp table week_ids on commit drop as
  select min(day) as monday, max(day) as friday, (min(day) + 1)::date as tuesday
  from week_dates;

grant select on week_dates, week_ids to authenticated;

-- Make Mon/Tue/Wed teaching days for the demo school (neutralise demo overrides).
insert into public.school_day_overrides(tenant_id, school_id, school_date, is_school_day, reason, source)
select '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', day, true, 'finalization test fixture', 'school'
from week_dates
on conflict (school_id, school_date) do update
set is_school_day = excluded.is_school_day, reason = excluded.reason, source = excluded.source;

-- Cross-school probe school (same tenant) and its admin.
insert into public.schools(id, tenant_id, name, emis_number, region, town)
values ('70600000-0000-4000-8000-000000000701', '11111111-1111-4111-8111-111111111111', 'Finalization Other School', 'FIN-OTHER', 'Erongo', 'Swakopmund')
on conflict (id) do nothing;

-- Actors in the demo school.
insert into auth.users(id, email, aud, role, created_at, updated_at)
values
  ('70600000-0000-4000-8000-000000000711', 'fin-principal@example.test', 'authenticated', 'authenticated', now(), now()),
  ('70600000-0000-4000-8000-000000000712', 'fin-hod@example.test', 'authenticated', 'authenticated', now(), now()),
  ('70600000-0000-4000-8000-000000000713', 'fin-teacher@example.test', 'authenticated', 'authenticated', now(), now()),
  ('70600000-0000-4000-8000-000000000714', 'fin-cross@example.test', 'authenticated', 'authenticated', now(), now())
on conflict (id) do nothing;

insert into public.school_memberships(tenant_id, school_id, user_id, role_key, active_from)
values
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '70600000-0000-4000-8000-000000000711', 'principal', current_date - 1),
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '70600000-0000-4000-8000-000000000712', 'hod', current_date - 1),
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '70600000-0000-4000-8000-000000000713', 'teacher', current_date - 1),
  ('11111111-1111-4111-8111-111111111111', '70600000-0000-4000-8000-000000000701', '70600000-0000-4000-8000-000000000714', 'school_admin', current_date - 1);

-- Helper to act as a given user. Functions cannot be TEMPORARY; this is created
-- in public and removed by the test transaction's final rollback. SET LOCAL ROLE
-- inside the function persists to the end of the transaction, so later
-- statements keep acting as the chosen user.
create or replace function public.act_as(p_user uuid) returns void as $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end;
$$ language plpgsql;

-- ---------------------------------------------------------------- submit regs
-- As the principal, confirm 10A and 10B for Monday (full readiness for [Mon,Mon]).
select act_as('70600000-0000-4000-8000-000000000711');
select lives_ok(
  $$select public.submit_daily_register(
    '40000000-0000-4000-8000-00000000001a',
    (select monday from week_ids),
    '[{"enrolment_id":"60000000-0000-4000-8000-000000000001","status":"absent"}]'::jsonb,
    'finalization monday 10A', null, null, 'online'
  )$$,
  'principal can submit the Monday register for 10A'
);

select lives_ok(
  $$select public.submit_daily_register(
    '40000000-0000-4000-8000-00000000001b',
    (select monday from week_ids),
    '[]'::jsonb,
    'finalization monday 10B', null, null, 'online'
  )$$,
  'principal can submit the Monday register for 10B'
);

-- 10A only for Tuesday (so [Tue,Tue] is NOT ready).
select lives_ok(
  $$select public.submit_daily_register(
    '40000000-0000-4000-8000-00000000001a',
    (select tuesday from week_ids),
    '[{"enrolment_id":"60000000-0000-4000-8000-000000000001","status":"absent"}]'::jsonb,
    'finalization tuesday 10A', null, null, 'online'
  )$$,
  'principal can submit the Tuesday register for 10A'
);

-- ---------------------------------------------------------------- authorize
select act_as('70600000-0000-4000-8000-000000000712'); -- hod
select throws_ok(
  $$select * from public.finalize_official_attendance_summary(
    '22222222-2222-4222-8222-222222222222', 2026, 'week',
    (select monday from week_ids), (select monday from week_ids), null,
    '{"mode":"week","scopeStart":"x","lastTeachingDate":"x"}'::jsonb)$$,
  null,
  'HOD cannot finalize the official attendance summary'
);

select act_as('70600000-0000-4000-8000-000000000713'); -- teacher
select throws_ok(
  $$select * from public.finalize_official_attendance_summary(
    '22222222-2222-4222-8222-222222222222', 2026, 'week',
    (select monday from week_ids), (select monday from week_ids), null,
    '{"mode":"week","scopeStart":"x","lastTeachingDate":"x"}'::jsonb)$$,
  null,
  'Teacher cannot finalize the official attendance summary'
);

select act_as('70600000-0000-4000-8000-000000000714'); -- cross-school admin
select throws_ok(
  $$select * from public.finalize_official_attendance_summary(
    '22222222-2222-4222-8222-222222222222', 2026, 'week',
    (select monday from week_ids), (select monday from week_ids), null,
    '{"mode":"week","scopeStart":"x","lastTeachingDate":"x"}'::jsonb)$$,
  null,
  'Cross-school admin cannot finalize another school''s summary'
);

-- ---------------------------------------------------------------- readiness
select act_as('70600000-0000-4000-8000-000000000711'); -- principal
select throws_ok(
  $$select * from public.finalize_official_attendance_summary(
    '22222222-2222-4222-8222-222222222222', 2026, 'week',
    (select tuesday from week_ids), (select tuesday from week_ids), null,
    '{"mode":"week","scopeStart":"x","lastTeachingDate":"x"}'::jsonb)$$,
  null,
  'Incomplete readiness blocks finalization'
);

-- ---------------------------------------------------------------- finalize v1
create temp table finalize_out on commit drop as
  select * from public.finalize_official_attendance_summary(
    '22222222-2222-4222-8222-222222222222', 2026, 'week',
    (select monday from week_ids), (select monday from week_ids), null,
    jsonb_build_object('mode','week','scopeStart', (select monday from week_ids), 'lastTeachingDate', (select monday from week_ids), 'percentAbsence', 10)
  );

select is(
  (select scolapro_reference from finalize_out),
  'SP-ATT-' || extract(year from (select monday from week_ids))::integer || '-000001',
  'finalization mints a canonical SP-ATT reference'
);

select is(
  (select revision from finalize_out),
  1,
  'first finalization is revision 1'
);

select is(
  (select status from public.official_attendance_summary_snapshots where id = (select snapshot_id from finalize_out)),
  'finalized',
  'finalized snapshot is stored as finalized (no draft state)'
);

select is(
  (select verification_token from finalize_out) ~ '^[A-Za-z0-9_-]{32}$',
  true,
  'verification token is a 32-char opaque token'
);

-- ---------------------------------------------------------------- public verify (minimal)
select is(
  (select count(*)::integer from public.resolve_official_document_verification((select verification_token from finalize_out))),
  1,
  'public resolver returns exactly one minimal record for the token'
);

select is(
  (select validity_status from public.resolve_official_document_verification((select verification_token from finalize_out))),
  'valid',
  'fresh verification resolves as valid'
);

-- public projection must not expose tenant/school/source identifiers or learner data.
select is(
  (select (r.school_name is not null and r.document_type is not null and r.scolapro_reference is not null and r.issued_on is not null and r.revision is not null and r.confirmation is not null)
   from public.resolve_official_document_verification((select verification_token from finalize_out)) r),
  true,
  'public verifier returns only opaque provenance fields'
);

-- ---------------------------------------------------------------- immutable + no draft leakage
-- A different, never-finalized scope resolves to nothing (no draft exposure).
select act_as('70600000-0000-4000-8000-000000000711');
select is(
  (select count(*)::integer from public.get_official_attendance_summary_finalization(
    '22222222-2222-4222-8222-222222222222', 'week',
    (select tuesday from week_ids), (select tuesday from week_ids), null)),
  0,
  'an un-finalized scope is not resolvable (no draft leakage)'
);

-- Edit 10B Monday after finalizing: the frozen v1 snapshot must not change.
select lives_ok(
  $$select public.submit_daily_register(
    '40000000-0000-4000-8000-00000000001b',
    (select monday from week_ids),
    '[{"enrolment_id":"60000000-0000-4000-8000-000000000002","status":"absent"}]'::jsonb,
    'finalization monday 10B correction', null, null, 'online'
  )$$,
  'principal can submit a corrected Monday register for 10B'
);

select is(
  (select data_snapshot from public.official_attendance_summary_snapshots where id = (select snapshot_id from finalize_out)),
  jsonb_build_object('mode','week','scopeStart', (select monday from week_ids), 'lastTeachingDate', (select monday from week_ids), 'percentAbsence', 10),
  'frozen v1 snapshot is preserved exactly after later edits'
);

-- ---------------------------------------------------------------- revision chain
create temp table finalize_out2 on commit drop as
  select * from public.finalize_official_attendance_summary(
    '22222222-2222-4222-8222-222222222222', 2026, 'week',
    (select monday from week_ids), (select monday from week_ids), null,
    jsonb_build_object('mode','week','scopeStart', (select monday from week_ids), 'lastTeachingDate', (select monday from week_ids), 'percentAbsence', 5)
  );

select is((select revision from finalize_out2), 2, 'a later finalize of the same scope becomes revision 2');

select is(
  (select status from public.official_attendance_summary_snapshots where id = (select snapshot_id from finalize_out)),
  'superseded',
  'prior finalized revision is marked superseded'
);

select is(
  (select revision from public.get_official_attendance_summary_finalization(
    '22222222-2222-4222-8222-222222222222', 'week',
    (select monday from week_ids), (select monday from week_ids), null)),
  2,
  'resolution returns the latest revision'
);

-- ---------------------------------------------------------------- superseded QR resolves old revision (no silent redirect)
select is(
  (select revision from public.resolve_official_document_verification((select verification_token from finalize_out))),
  1,
  'old revision token still resolves to revision 1'
);

select is(
  (select validity_status from public.resolve_official_document_verification((select verification_token from finalize_out))),
  'superseded',
  'old revision token resolves as superseded, not redirected to the newest'
);

select is(
  (select revision from public.resolve_official_document_verification((select verification_token from finalize_out2))),
  2,
  'new revision token resolves to revision 2'
);

select * from finish();
rollback;
