begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('e1700000-0000-4000-8000-000000000001','lesson-allocated-teacher@example.test','authenticated','authenticated',now(),now()),
  ('e1700000-0000-4000-8000-000000000002','lesson-other-teacher@example.test','authenticated','authenticated',now(),now()),
  ('e1700000-0000-4000-8000-000000000003','lesson-unrelated@example.test','authenticated','authenticated',now(),now()),
  ('e1700000-0000-4000-8000-000000000004','lesson-leader@example.test','authenticated','authenticated',now(),now());

-- Seed a deliberately minimal teaching graph so this regression exercises the
-- lesson-preparation boundary rather than unrelated curriculum setup guards.
set local session_replication_role = replica;

insert into public.staff_members(id,tenant_id,user_id,first_name,last_name,status)
values
  ('e1710000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','e1700000-0000-4000-8000-000000000001','Allocated','Teacher','active'),
  ('e1710000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','e1700000-0000-4000-8000-000000000002','Other','Teacher','active');

insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from,active_to)
values
  ('e1720000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e1700000-0000-4000-8000-000000000001','e1710000-0000-4000-8000-000000000001','teacher',current_date-10,null),
  ('e1720000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e1700000-0000-4000-8000-000000000002','e1710000-0000-4000-8000-000000000002','teacher',current_date-10,null),
  ('e1720000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e1700000-0000-4000-8000-000000000004',null,'hod',current_date-10,null);

insert into public.teacher_allocations(
  id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from,active_to
) values(
  'e1730000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
  'e1740000-0000-4000-8000-000000000001','e1750000-0000-4000-8000-000000000001','e1710000-0000-4000-8000-000000000001',current_date-10,null
);

insert into public.teaching_schedule_items(
  id,tenant_id,school_id,academic_year,pacing_plan_item_id,register_class_id,teacher_allocation_id,planned_on,planned_period_count,status
) values
  (
    'e1760000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
    'e1770000-0000-4000-8000-000000000001','e1750000-0000-4000-8000-000000000001','e1730000-0000-4000-8000-000000000001',current_date,1,'planned'
  ),
  (
    'e1760000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
    'e1770000-0000-4000-8000-000000000002','e1750000-0000-4000-8000-000000000001','e1730000-0000-4000-8000-000000000001',current_date,1,'planned'
  );

set local session_replication_role = origin;

select set_config('request.jwt.claim.sub','e1700000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select throws_ok(
  $$insert into public.lesson_preparations(
      id,tenant_id,school_id,teaching_schedule_item_id,planned_on,prepared_by_user_id
    ) values(
      'e1780000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'e1760000-0000-4000-8000-000000000001',current_date,'e1700000-0000-4000-8000-000000000003'
    )$$,
  'Lesson preparation authority mismatch: preparer is not authorized for teaching allocation',
  'unrelated authenticated account cannot forge itself as preparer for another teaching schedule'
);

reset role;
select set_config('request.jwt.claim.sub','e1700000-0000-4000-8000-000000000002',true);
set local role authenticated;

select throws_ok(
  $$insert into public.lesson_preparations(
      id,tenant_id,school_id,teaching_schedule_item_id,planned_on,prepared_by_user_id
    ) values(
      'e1780000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'e1760000-0000-4000-8000-000000000001',current_date,'e1700000-0000-4000-8000-000000000002'
    )$$,
  'Lesson preparation authority mismatch: preparer is not authorized for teaching allocation',
  'another teacher at the same school cannot claim the allocated teacher schedule'
);

reset role;
select set_config('request.jwt.claim.sub','e1700000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$insert into public.lesson_preparations(
      id,tenant_id,school_id,teaching_schedule_item_id,planned_on,prepared_by_user_id
    ) values(
      'e1780000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'e1760000-0000-4000-8000-000000000001',current_date,'e1700000-0000-4000-8000-000000000001'
    )$$,
  'date-valid allocated teacher can prepare the scheduled lesson'
);

reset role;
select set_config('request.jwt.claim.sub','e1700000-0000-4000-8000-000000000004',true);
set local role authenticated;

select lives_ok(
  $$insert into public.lesson_preparations(
      id,tenant_id,school_id,teaching_schedule_item_id,planned_on,prepared_by_user_id
    ) values(
      'e1780000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'e1760000-0000-4000-8000-000000000002',current_date,'e1700000-0000-4000-8000-000000000004'
    )$$,
  'authorized HOD can remain a valid lesson-preparation author'
);

reset role;

select throws_ok(
  $$update public.lesson_preparations
       set prepared_by_user_id='e1700000-0000-4000-8000-000000000004'
     where id='e1780000-0000-4000-8000-000000000003'$$,
  'Lesson preparation root scope and provenance are immutable',
  'lesson preparation author provenance remains immutable'
);

select is(
  (select count(*)::integer from public.lesson_preparations where id in ('e1780000-0000-4000-8000-000000000001','e1780000-0000-4000-8000-000000000002')),
  0,
  'rejected forged preparations leave no durable rows'
);

select is(
  (select count(*)::integer from public.lesson_preparations where id in ('e1780000-0000-4000-8000-000000000003','e1780000-0000-4000-8000-000000000004')),
  2,
  'authorized teacher and HOD preparations persist'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_lesson_preparation_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_lesson_preparation_scope_integrity()','EXECUTE'),
  'lesson preparation integrity helper remains private from client roles'
);

select is(
  (select count(*)::integer from pg_trigger where tgrelid='public.lesson_preparations'::regclass and tgname='lesson_preparation_scope_integrity_trg' and not tgisinternal),
  1,
  'lesson preparations retain exactly one scope-integrity trigger'
);

select * from finish();
rollback;
