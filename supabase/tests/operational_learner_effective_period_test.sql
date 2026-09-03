begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fd700000-0000-4000-8000-000000000001','operational-period-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fd700000-0000-4000-8000-000000000001',
  'school_admin',current_date-30
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd700000-0000-4000-8000-000000000001',true);

select is(
  (select count(*)::integer
   from public.search_operational_learner_directory(
     '22222222-2222-4222-8222-222222222222',null,100
   )
   where learner_id='50000000-0000-4000-8000-000000000001'),
  1,
  'operational selector includes a learner while enrolment is effective today'
);

select is(
  (select count(*)::integer
   from public.list_late_arrival_roster_summary(
     '22222222-2222-4222-8222-222222222222',2026,current_date-7,current_date
   )
   where learner_id='50000000-0000-4000-8000-000000000001'),
  1,
  'late-arrival roster includes a learner while enrolment is effective today'
);

update public.enrolments
set enrolled_from=current_date+7,
    enrolled_to=null,
    status='current'
where learner_id='50000000-0000-4000-8000-000000000001'
  and school_id='22222222-2222-4222-8222-222222222222'
  and academic_year=2026;

select is(
  (select count(*)::integer
   from public.search_operational_learner_directory(
     '22222222-2222-4222-8222-222222222222',null,100
   )
   where learner_id='50000000-0000-4000-8000-000000000001'),
  0,
  'future-start current-status learner is hidden from operational selector'
);

select is(
  (select count(*)::integer
   from public.list_late_arrival_roster_summary(
     '22222222-2222-4222-8222-222222222222',2026,current_date-7,current_date
   )
   where learner_id='50000000-0000-4000-8000-000000000001'),
  0,
  'future-start current-status learner is hidden from late-arrival roster'
);

update public.enrolments
set enrolled_from=current_date-30,
    enrolled_to=current_date-1,
    status='current'
where learner_id='50000000-0000-4000-8000-000000000001'
  and school_id='22222222-2222-4222-8222-222222222222'
  and academic_year=2026;

select is(
  (select count(*)::integer
   from public.search_operational_learner_directory(
     '22222222-2222-4222-8222-222222222222',null,100
   )
   where learner_id='50000000-0000-4000-8000-000000000001'),
  0,
  'ended current-status learner is hidden from operational selector'
);

select is(
  (select count(*)::integer
   from public.list_late_arrival_roster_summary(
     '22222222-2222-4222-8222-222222222222',2026,current_date-7,current_date
   )
   where learner_id='50000000-0000-4000-8000-000000000001'),
  0,
  'ended current-status learner is hidden from late-arrival roster'
);

select is(
  (select count(*)::integer
   from public.search_operational_learner_directory(
     '22222222-2222-4222-8222-222222222222',null,100
   )
   where learner_id='50000000-0000-4000-8000-000000000002'),
  1,
  'another effective learner remains available in operational selector'
);

select is(
  (select count(*)::integer
   from public.list_late_arrival_roster_summary(
     '22222222-2222-4222-8222-222222222222',2026,current_date-7,current_date
   )
   where learner_id='50000000-0000-4000-8000-000000000002'),
  1,
  'another effective learner remains available in late-arrival roster'
);

select * from finish();
rollback;
