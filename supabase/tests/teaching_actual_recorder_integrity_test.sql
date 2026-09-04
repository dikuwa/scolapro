begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('e1800000-0000-4000-8000-000000000001','actual-allocated-teacher@example.test','authenticated','authenticated',now(),now()),
  ('e1800000-0000-4000-8000-000000000002','actual-other-teacher@example.test','authenticated','authenticated',now(),now()),
  ('e1800000-0000-4000-8000-000000000003','actual-unrelated@example.test','authenticated','authenticated',now(),now()),
  ('e1800000-0000-4000-8000-000000000004','actual-leader@example.test','authenticated','authenticated',now(),now());

-- Seed only the teaching graph needed by this regression. Other scope guards are
-- covered independently; this suite isolates recorder authority at the physical
-- teaching_actuals boundary.
set local session_replication_role = replica;

insert into public.staff_members(id,tenant_id,user_id,first_name,last_name,status)
values
  ('e1810000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','e1800000-0000-4000-8000-000000000001','Allocated','Actual Teacher','active'),
  ('e1810000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','e1800000-0000-4000-8000-000000000002','Other','Actual Teacher','active');

insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from,active_to)
values
  ('e1820000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e1800000-0000-4000-8000-000000000001','e1810000-0000-4000-8000-000000000001','teacher',current_date-10,null),
  ('e1820000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e1800000-0000-4000-8000-000000000002','e1810000-0000-4000-8000-000000000002','teacher',current_date-10,null),
  ('e1820000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e1800000-0000-4000-8000-000000000004',null,'hod',current_date-10,null);

insert into public.teacher_allocations(
  id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from,active_to
) values(
  'e1830000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
  'e1840000-0000-4000-8000-000000000001','e1850000-0000-4000-8000-000000000001','e1810000-0000-4000-8000-000000000001',current_date-10,null
);

insert into public.teaching_schedule_items(
  id,tenant_id,school_id,academic_year,pacing_plan_item_id,register_class_id,teacher_allocation_id,planned_on,planned_period_count,status
) values(
  'e1860000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
  'e1870000-0000-4000-8000-000000000001','e1850000-0000-4000-8000-000000000001','e1830000-0000-4000-8000-000000000001',current_date,1,'planned'
);

set local session_replication_role = origin;

select throws_ok(
  $$insert into public.teaching_actuals(
      id,tenant_id,school_id,teaching_schedule_item_id,taught_on,coverage_state,recorded_by_user_id
    ) values(
      'e1880000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'e1860000-0000-4000-8000-000000000001',current_date,'taught','e1800000-0000-4000-8000-000000000003'
    )$$,
  'Teaching actual recorder mismatch: user is not authorized for teaching allocation',
  'unrelated user cannot be forged as teaching actual recorder'
);

select throws_ok(
  $$insert into public.teaching_actuals(
      id,tenant_id,school_id,teaching_schedule_item_id,taught_on,coverage_state,recorded_by_user_id
    ) values(
      'e1880000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'e1860000-0000-4000-8000-000000000001',current_date,'taught','e1800000-0000-4000-8000-000000000002'
    )$$,
  'Teaching actual recorder mismatch: user is not authorized for teaching allocation',
  'different teacher at same school cannot claim another allocation actual'
);

select lives_ok(
  $$insert into public.teaching_actuals(
      id,tenant_id,school_id,teaching_schedule_item_id,taught_on,coverage_state,recorded_by_user_id
    ) values(
      'e1880000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'e1860000-0000-4000-8000-000000000001',current_date,'taught','e1800000-0000-4000-8000-000000000001'
    )$$,
  'current allocated teacher can record teaching actual'
);

select lives_ok(
  $$insert into public.teaching_actuals(
      id,tenant_id,school_id,teaching_schedule_item_id,taught_on,coverage_state,recorded_by_user_id
    ) values(
      'e1880000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'e1860000-0000-4000-8000-000000000001',current_date,'taught','e1800000-0000-4000-8000-000000000004'
    )$$,
  'authorized HOD remains valid teaching actual recorder'
);

select throws_ok(
  $$update public.teaching_actuals
       set recorded_by_user_id='e1800000-0000-4000-8000-000000000004'
     where id='e1880000-0000-4000-8000-000000000003'$$,
  'Teaching actual root scope and provenance are immutable',
  'teaching actual recorder provenance remains immutable'
);

select is(
  (select count(*)::integer from public.teaching_actuals where id in ('e1880000-0000-4000-8000-000000000001','e1880000-0000-4000-8000-000000000002')),
  0,
  'rejected forged teaching actuals leave no rows'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_teaching_actual_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_teaching_actual_scope_integrity()','EXECUTE'),
  'teaching actual integrity helper remains private'
);

select is(
  (select count(*)::integer from pg_trigger where tgrelid='public.teaching_actuals'::regclass and tgname='teaching_actual_scope_integrity_trg' and not tgisinternal),
  1,
  'teaching actuals retain exactly one integrity trigger'
);

select * from finish();
rollback;
