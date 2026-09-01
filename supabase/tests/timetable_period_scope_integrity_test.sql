begin;

select plan(7);

select has_function(
  'app_private',
  'enforce_timetable_period_scope_integrity',
  array[]::text[],
  'timetable period scope helper exists'
);

select trigger_is(
  'public',
  'timetable_periods',
  'timetable_period_scope_integrity_trg',
  'app_private',
  'enforce_timetable_period_scope_integrity',
  'timetable period integrity trigger installed'
);

select is(
  has_function_privilege('anon','app_private.enforce_timetable_period_scope_integrity()','EXECUTE'),
  false,
  'anon cannot execute timetable period scope helper'
);

select is(
  has_function_privilege('authenticated','app_private.enforce_timetable_period_scope_integrity()','EXECUTE'),
  false,
  'authenticated cannot execute timetable period scope helper'
);

select throws_ok(
  $$insert into public.timetable_periods(
      tenant_id,school_id,academic_year,period_number,display_name,starts_at,ends_at
    ) values(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222',2026,29,
      'Wrong tenant period','14:00','14:45'
    )$$,
  'Timetable period scope mismatch: school does not belong to tenant',
  'timetable period cannot claim a tenant different from its school'
);

select lives_ok(
  $$insert into public.timetable_periods(
      id,tenant_id,school_id,academic_year,period_number,display_name,starts_at,ends_at
    ) values(
      'fc340000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,29,
      'Scope test period','14:00','14:45'
    )$$,
  'valid same-school timetable period remains allowed'
);

select throws_ok(
  $$update public.timetable_periods
       set academic_year=2025
     where id='fc340000-0000-4000-8000-000000000001'$$,
  'Timetable period root scope and provenance are immutable',
  'timetable period cannot be moved to another academic year'
);

select * from finish();
rollback;
