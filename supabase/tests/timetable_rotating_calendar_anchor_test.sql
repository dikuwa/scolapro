begin;

select plan(12);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values ('fca00000-0000-4000-8000-000000000001','cycle-anchor-principal@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fca00000-0000-4000-8000-000000000001','principal',current_date-1);

insert into public.academic_years(tenant_id,school_id,year,status,starts_on,ends_on)
values ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2027,'setup','2027-01-11','2027-12-05')
on conflict (school_id,year)
do update set starts_on=excluded.starts_on,ends_on=excluded.ends_on,status='setup';

update public.schools
set timetable_cycle_mode='rotating',timetable_cycle_length=10
where id='22222222-2222-4222-8222-222222222222';

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fca00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.configure_timetable_cycle_anchor(
    '22222222-2222-4222-8222-222222222222',2027,'2027-01-11',1::smallint
  )$$,
  'principal may configure a rotating timetable calendar anchor'
);

select is(
  public.resolve_timetable_day('22222222-2222-4222-8222-222222222222',2027,'2027-01-11'),
  1::smallint,
  'anchor date resolves to its configured cycle day'
);

select is(
  public.resolve_timetable_day('22222222-2222-4222-8222-222222222222',2027,'2027-01-12'),
  2::smallint,
  'next expected school day advances the rotating cycle'
);

reset role;

insert into public.school_day_overrides(tenant_id,school_id,school_date,is_school_day,reason,source,created_by_user_id)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','2027-01-13',false,'Closure','school','fca00000-0000-4000-8000-000000000001'),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','2027-01-16',true,'Special Saturday','school','fca00000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub','fca00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  public.resolve_timetable_day('22222222-2222-4222-8222-222222222222',2027,'2027-01-14'),
  3::smallint,
  'closure does not consume a rotating timetable day'
);

select is(
  public.resolve_timetable_day('22222222-2222-4222-8222-222222222222',2027,'2027-01-16'),
  5::smallint,
  'explicit special weekend school day advances the rotating cycle'
);

select is(
  public.resolve_timetable_day('22222222-2222-4222-8222-222222222222',2027,'2027-01-17'),
  null::smallint,
  'ordinary non-school date has no timetable day'
);

select is(
  public.resolve_timetable_day('22222222-2222-4222-8222-222222222222',2027,'2027-01-08'),
  null::smallint,
  'date outside the configured academic year has no timetable day'
);

select throws_ok(
  $$select public.configure_timetable_cycle_anchor(
    '22222222-2222-4222-8222-222222222222',2027,'2027-01-17',1::smallint
  )$$,
  'Anchor date must be a configured school day',
  'anchor must be an expected school day'
);

select throws_ok(
  $$select public.configure_timetable_cycle_anchor(
    '22222222-2222-4222-8222-222222222222',2027,'2027-01-11',11::smallint
  )$$,
  'Anchor day must be inside this school''s configured timetable cycle',
  'anchor day cannot exceed the school cycle length'
);

reset role;

update public.timetable_cycle_anchors
set anchor_day=8
where school_id='22222222-2222-4222-8222-222222222222' and academic_year=2027;

select throws_ok(
  $$update public.schools
    set timetable_cycle_length=5
    where id='22222222-2222-4222-8222-222222222222'$$,
  'Timetable cycle cannot be shortened below configured anchor Day 8',
  'cycle cannot be shortened below an existing rotating anchor day'
);

update public.schools
set timetable_cycle_mode='weekday',timetable_cycle_length=5
where id='22222222-2222-4222-8222-222222222222';

select set_config('request.jwt.claim.sub','fca00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  public.resolve_timetable_day('22222222-2222-4222-8222-222222222222',2027,'2027-01-11'),
  1::smallint,
  'weekday mode resolves Monday to day index one without using the rotating anchor'
);

select throws_ok(
  $$insert into public.timetable_cycle_anchors(
      tenant_id,school_id,academic_year,anchor_date,anchor_day,created_by_user_id
    ) values (
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2028,'2028-01-10',1,'fca00000-0000-4000-8000-000000000001'
    )$$,
  '42501',
  null,
  'authenticated clients cannot bypass the governed anchor RPC with direct writes'
);

reset role;

select * from finish();
rollback;
