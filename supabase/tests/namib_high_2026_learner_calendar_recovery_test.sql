begin;

select plan(25);

select has_function(
  'app_private','recover_namib_high_2026_learner_calendar',array[]::text[],
  'guarded Namib High 2026 learner-calendar recovery exists'
);
select ok(
  not has_function_privilege('authenticated','app_private.recover_namib_high_2026_learner_calendar()','EXECUTE'),
  'authenticated clients cannot invoke the operational recovery'
);

select is(
  (select count(*)::integer
   from public.schools s join public.tenants t on t.id=s.tenant_id
   where s.id='22222222-2222-4222-8222-222222222222'
     and s.tenant_id='11111111-1111-4111-8111-111111111111'
     and s.name='Namib High School' and s.status='active' and t.status='active'),
  1,
  'recovery is bound to the exact active school and tenant identity'
);
select is(
  (select count(*)::integer from public.academic_years
   where school_id='22222222-2222-4222-8222-222222222222' and year=2026),
  1,
  'exactly one Namib High 2026 academic year exists'
);
select is(
  (select concat_ws('|',starts_on::text,ends_on::text,status)
   from public.academic_years
   where school_id='22222222-2222-4222-8222-222222222222' and year=2026),
  '2026-01-12|2026-12-04|active',
  '2026 year dates and lifecycle status are exact'
);
select is(
  (select count(*)::integer from public.academic_years
   where school_id='22222222-2222-4222-8222-222222222222' and status='active'),
  1,
  'one-active-year governance is preserved'
);
select is(
  (select count(*)::integer
   from public.academic_terms at
   join public.academic_years ay on ay.id=at.academic_year_id
   where ay.school_id='22222222-2222-4222-8222-222222222222' and ay.year=2026),
  3,
  'exactly three learner terms exist'
);
select is(
  (select jsonb_agg(
      jsonb_build_array(at.term_number,at.display_name,at.starts_on,at.ends_on,at.status)
      order by at.term_number
    )
   from public.academic_terms at
   join public.academic_years ay on ay.id=at.academic_year_id
   where ay.school_id='22222222-2222-4222-8222-222222222222' and ay.year=2026),
  '[[1,"Term 1","2026-01-12","2026-04-28","closed"],[2,"Term 2","2026-06-01","2026-08-20","closed"],[3,"Term 3","2026-09-07","2026-12-04","active"]]'::jsonb,
  'term dates, names, order, and lifecycle statuses are exact'
);
select is(
  (select count(*)::integer
   from public.academic_terms at
   join public.academic_years ay on ay.id=at.academic_year_id
   where ay.school_id='22222222-2222-4222-8222-222222222222'
     and ay.year=2026 and at.status='closed'),
  2,
  'Terms 1 and 2 are closed'
);
select is(
  (select term_number from public.academic_terms at
   join public.academic_years ay on ay.id=at.academic_year_id
   where ay.school_id='22222222-2222-4222-8222-222222222222'
     and ay.year=2026 and at.status='active'),
  3::smallint,
  'Term 3 is the active operational term'
);
select is(
  (select count(*)::integer from (
    select school_id,year from public.academic_years group by school_id,year having count(*)>1
    union all
    select at.school_id,at.term_number::integer
    from public.academic_terms at
    join public.academic_years ay on ay.id=at.academic_year_id
    where ay.school_id='22222222-2222-4222-8222-222222222222' and ay.year=2026
    group by at.school_id,at.academic_year_id,at.term_number having count(*)>1
  ) duplicates),
  0,
  'no academic-year or term duplicates exist'
);
select is(
  (select count(*)::integer from public.audit_events
   where event_type='academic.calendar.operational_recovery'
     and (school_id<>'22222222-2222-4222-8222-222222222222'
          or metadata->>'academic_year'<>'2026')),
  0,
  'recovery provenance is scoped to no other school or year'
);
select is(
  (select metadata->>'school_days' from public.audit_events
   where event_type='academic.calendar.operational_recovery'
     and school_id='22222222-2222-4222-8222-222222222222'
   order by occurred_at desc limit 1),
  '199',
  'supported audit metadata preserves the published learner-day total'
);

select is(
  app_private.recover_namib_high_2026_learner_calendar(),
  'already_configured',
  'recovery is idempotent when canonical rows already match'
);
select is(
  (select count(*)::integer from public.audit_events
   where event_type='academic.calendar.operational_recovery'
     and school_id='22222222-2222-4222-8222-222222222222'),
  1,
  'idempotent replay does not duplicate recovery provenance'
);

select is(
  (select concat_ws('|',ay.starts_on::text,ay.ends_on::text,count(at.id)::text)
   from public.academic_years ay
   join public.academic_terms at on at.academic_year_id=ay.id
   where ay.school_id='22222222-2222-4222-8222-222222222222' and ay.year=2026
   group by ay.starts_on,ay.ends_on),
  '2026-01-12|2026-12-04|3',
  'Calendar downstream read sees governed year dates and three terms'
);
select is(
  (select at.display_name
   from public.academic_terms at
   join public.academic_years ay on ay.id=at.academic_year_id
   where ay.school_id='22222222-2222-4222-8222-222222222222'
     and ay.year=2026
     and (at.status='active' or date '2026-10-04' between at.starts_on and at.ends_on)
   order by (at.status='active') desc,at.term_number
   limit 1),
  'Term 3',
  'Teaching downstream resolution finds Term 3 for October 2026'
);
select ok(
  (select ay.starts_on is not null and ay.ends_on is not null
          and at.starts_on is not null and at.ends_on is not null
   from public.academic_years ay
   join public.academic_terms at on at.academic_year_id=ay.id and at.term_number=3
   where ay.school_id='22222222-2222-4222-8222-222222222222' and ay.year=2026),
  'Official Academic Schedules has governed year and selected-term dates'
);
select is(
  (select count(*)::integer
   from public.enrolments e
   where e.school_id='22222222-2222-4222-8222-222222222222'
     and e.academic_year=2026
     and e.enrolled_from<=date '2026-12-04'
     and (e.enrolled_to is null or e.enrolled_to>=date '2026-09-07')),
  2,
  'Official Academic Schedules can resolve the Term 3 learner cohort'
);

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values(
  'a1050000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'Issue 1050 Control School','ISSUE-1050-CONTROL','Erongo','Swakopmund','active'
);
insert into public.academic_years(id,tenant_id,school_id,year,status,starts_on,ends_on)
values(
  'a1050000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
  'a1050000-0000-4000-8000-000000000001',2026,'setup','2026-02-01','2026-11-30'
);
create temporary table issue_1050_control_snapshot on commit drop as
select to_jsonb(ay) as row_data from public.academic_years ay
where ay.id='a1050000-0000-4000-8000-000000000002';

select is(
  app_private.recover_namib_high_2026_learner_calendar(),
  'already_configured',
  'replay remains scoped after another school exists'
);
select is(
  (select to_jsonb(ay) from public.academic_years ay where ay.id='a1050000-0000-4000-8000-000000000002'),
  (select row_data from issue_1050_control_snapshot),
  'no other school calendar row is changed'
);

update public.academic_terms
set ends_on='2026-04-27'
where academic_year_id=(
  select id from public.academic_years
  where school_id='22222222-2222-4222-8222-222222222222' and year=2026
) and term_number=1;
select throws_ok(
  $$select app_private.recover_namib_high_2026_learner_calendar()$$,
  'Issue #1050 recovery refused: conflicting governed Term 1 configuration exists',
  'conflicting pre-existing canonical term dates fail safely'
);
update public.academic_terms
set ends_on='2026-04-28'
where academic_year_id=(
  select id from public.academic_years
  where school_id='22222222-2222-4222-8222-222222222222' and year=2026
) and term_number=1;

update public.academic_years
set status='setup'
where school_id='22222222-2222-4222-8222-222222222222' and year=2026;
insert into public.academic_years(id,tenant_id,school_id,year,status,starts_on,ends_on)
values(
  'a1050000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',2027,'active','2027-01-11','2027-12-03'
);
select throws_ok(
  $$select app_private.recover_namib_high_2026_learner_calendar()$$,
  'Issue #1050 recovery refused: an incompatible academic year is already active',
  'incompatible pre-existing active year fails safely'
);
delete from public.academic_years where id='a1050000-0000-4000-8000-000000000003';
update public.academic_years
set status='active'
where school_id='22222222-2222-4222-8222-222222222222' and year=2026;

update public.schools
set name='Wrong Namib Identity'
where id='22222222-2222-4222-8222-222222222222';
select throws_ok(
  $$select app_private.recover_namib_high_2026_learner_calendar()$$,
  'Issue #1050 recovery requires the exact active Namib High School tenant identity',
  'wrong school identity fails safely'
);
update public.schools
set name='Namib High School'
where id='22222222-2222-4222-8222-222222222222';

update public.academic_terms
set status='closed'
where academic_year_id=(
  select id from public.academic_years
  where school_id='22222222-2222-4222-8222-222222222222' and year=2026
) and term_number=3;
select throws_ok(
  $$select app_private.recover_namib_high_2026_learner_calendar()$$,
  'Issue #1050 recovery refused: conflicting governed Term 3 configuration exists',
  'closed Term 3 finality fails safely instead of being reopened'
);

select * from finish();
rollback;
