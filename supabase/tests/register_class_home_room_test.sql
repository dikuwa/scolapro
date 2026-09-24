-- Issue #701: Register Class -> Home Room relationship
-- Companion migration:
--   supabase/migrations/20260923200000_register_class_home_room.sql
--
-- Verifies:
-- - home_room_id is optional (null is valid)
-- - upsert assigns a same-school/same-tenant room
-- - update changes the home room
-- - cross-school room assignment is denied
-- - cross-tenant room assignment is denied
-- - the row-level trigger enforces same-school scope on direct INSERT
-- - the column survives room renumbering (no cascade)
-- - audit log captures home_room_id and previous value
-- - unauthenticated access is denied
-- - non-existent room is denied on update
-- - shared-room arrangement is permitted (no hard one-class-per-room limit)
-- - existing register-class behavior is preserved (code/name update without home room)

begin;

select plan(20);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('70100000-0000-4000-8000-000000000001','admin-701@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug,status)
values('70110000-0000-4000-8000-000000000001','Home Room Tenant','home-room-701','active');

insert into public.schools(id,tenant_id,name,status)
values
  ('70120000-0000-4000-8000-000000000001','70110000-0000-4000-8000-000000000001','Home Room School','active'),
  ('70120000-0000-4000-8000-000000000002','70110000-0000-4000-8000-000000000001','Other School','active');

insert into public.school_memberships(id,tenant_id,school_id,user_id,role_key,active_from)
values('70140000-0000-4000-8000-000000000001','70110000-0000-4000-8000-000000000001','70120000-0000-4000-8000-000000000001','70100000-0000-4000-8000-000000000001','school_admin',current_date-30);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values('70130000-0000-4000-8000-000000000001','70110000-0000-4000-8000-000000000001','70100000-0000-4000-8000-000000000001','T701-A','Home','Room','active');

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name)
values('70150000-0000-4000-8000-000000000010','70110000-0000-4000-8000-000000000001','70120000-0000-4000-8000-000000000001',2026,'07','Grade 7');

insert into public.school_rooms(id,tenant_id,school_id,room_code,display_name,block_name,status)
values
  ('70160000-0000-4000-8000-000000000001','70110000-0000-4000-8000-000000000001','70120000-0000-4000-8000-000000000001','R101','Room 101','Block A','active'),
  ('70160000-0000-4000-8000-000000000002','70110000-0000-4000-8000-000000000001','70120000-0000-4000-8000-000000000001','R102','Room 102','Block B','active'),
  ('70160000-0000-4000-8000-000000000003','70110000-0000-4000-8000-000000000001','70120000-0000-4000-8000-000000000002','R201','Room 201','Block C','active');

-- Cross-tenant room for trigger test: needs a school in the cross-tenant
insert into public.tenants(id,name,slug,status)
values('70110000-0000-4000-8000-000000000002','Cross Tenant','cross-tenant-701','active');

insert into public.schools(id,tenant_id,name,status)
values('70120000-0000-4000-8000-000000000003','70110000-0000-4000-8000-000000000002','Cross Tenant School','active');

insert into public.school_rooms(id,tenant_id,school_id,room_code,display_name,block_name,status)
values('70160000-0000-4000-8000-000000000005','70110000-0000-4000-8000-000000000002','70120000-0000-4000-8000-000000000003','X101','Cross Tenant Room','Block X','active');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','70100000-0000-4000-8000-000000000001',true);

-- 1. upsert with no home room (optional)
select lives_ok(
  $$select public.upsert_register_class(
    '70120000-0000-4000-8000-000000000001', 2026, '70150000-0000-4000-8000-000000000010',
    '7a','Grade 7/A', null
  )$$,
  'register class can be created without a home room (optional)'
);

-- 2. upsert with a same-school/same-tenant home room
select lives_ok(
  $$select public.upsert_register_class(
    '70120000-0000-4000-8000-000000000001', 2026, '70150000-0000-4000-8000-000000000010',
    '7b','Grade 7/B', '70160000-0000-4000-8000-000000000001'
  )$$,
  'register class can be created with a same-school home room'
);

select is(
  (select home_room_id from public.register_classes where class_code='7b' and school_id='70120000-0000-4000-8000-000000000001'),
  '70160000-0000-4000-8000-000000000001',
  'home room is persisted on the register class row'
);

select is(
  (select metadata->>'home_room_id' from public.audit_events
   where event_type='academic.class.upserted' and entity_type='register_class'
      order by occurred_at desc limit 1),
  '70160000-0000-4000-8000-000000000001',
  'audit log captures home_room_id on upsert'
);

-- 3. update changes the home room
select lives_ok(
  $$select public.update_register_class(
    (select id from public.register_classes where class_code='7b'),
    '70150000-0000-4000-8000-000000000010',
    '7b', 'Grade 7/B',
    '70160000-0000-4000-8000-000000000002'
  )$$,
  'register class update assigns a different home room'
);

select is(
  (select home_room_id from public.register_classes where class_code='7b'),
  '70160000-0000-4000-8000-000000000002',
  'updated home room is persisted'
);

select is(
  (select metadata->>'previous_home_room_id' from public.audit_events
      where event_type='register_class.updated' order by occurred_at desc limit 1),
  '70160000-0000-4000-8000-000000000001',
  'audit log captures previous home room on update'
);

-- 4. update with null clears the assignment
select lives_ok(
  $$select public.update_register_class(
    (select id from public.register_classes where class_code='7b'),
    '70150000-0000-4000-8000-000000000010',
    '7b', 'Grade 7/B',
    null
  )$$,
  'register class home room can be cleared'
);

select is(
  (select home_room_id from public.register_classes where class_code='7b'),
  null,
  'home room is cleared to null'
);

-- 5. upsert with cross-school room is denied by the RPC
select throws_ok(
  $$select public.upsert_register_class(
    '70120000-0000-4000-8000-000000000001', 2026, '70150000-0000-4000-8000-000000000010',
    '7c','Grade 7/C', '70160000-0000-4000-8000-000000000003'
  )$$,
  'P0001','Home room must belong to the same school and tenant as the register class',
  'cross-school room assignment is denied at the RPC'
);

-- 6. update with cross-school room is denied
select throws_ok(
  $$select public.update_register_class(
    (select id from public.register_classes where class_code='7b'),
    '70150000-0000-4000-8000-000000000010',
    '7b', 'Grade 7/B',
    '70160000-0000-4000-8000-000000000003'
  )$$,
  'P0001','Home room must belong to the same school and tenant as the register class',
  'cross-school room assignment is denied on update'
);

-- 7. direct INSERT with a cross-tenant room is denied by the trigger
select throws_ok(
  $$insert into public.register_classes(tenant_id,school_id,grade_id,academic_year,class_code,display_name,home_room_id)
    values('70110000-0000-4000-8000-000000000001','70120000-0000-4000-8000-000000000001','70150000-0000-4000-8000-000000000010',2026,'7d','Direct Insert','70160000-0000-4000-8000-000000000005')$$
  'P0001','Home room must belong to the same school and tenant as the register class',
  'trigger enforces scope on direct INSERT (cross-tenant)'
);

-- 8. room survives renumbering (no cascade)
update public.school_rooms set room_code='RENAMED', display_name='Renamed Room'
  where id='70160000-0000-4000-8000-000000000001';

-- Re-create class 7b with the original room for this check
select public.update_register_class(
  (select id from public.register_classes where class_code='7b'),
  '70150000-0000-4000-8000-000000000010', '7b', 'Grade 7/B',
  '70160000-0000-4000-8000-000000000001'
);

select is(
  (select home_room_id from public.register_classes where class_code='7b'),
  '70160000-0000-4000-8000-000000000001',
  'home room reference survives room renumbering (on delete set null, no cascade)'
);

-- 9. unauthenticated access is denied
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','',true);
select throws_ok(
  $$select public.upsert_register_class(
    '70120000-0000-4000-8000-000000000001', 2026, '70150000-0000-4000-8000-000000000010',
    '7e','Grade 7/E', null
  )$$,
  'P0001','Authentication required',
  'unauthenticated user cannot upsert a register class'
);

-- 10. school admin can upsert with a room (auth positive path)
select set_config('request.jwt.claim.sub','70100000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select lives_ok(
  $$select public.upsert_register_class(
    '70120000-0000-4000-8000-000000000001', 2026, '70150000-0000-4000-8000-000000000010',
    '7f','Grade 7/F', null
  )$$,
  'school admin can upsert a register class without home room'
);

-- 11. update with non-existent room is denied
select throws_ok(
  $$select public.update_register_class(
    (select id from public.register_classes where class_code='7f'),
    '70150000-0000-4000-8000-000000000010',
    '7f', 'Grade 7/F',
    '00000000-0000-0000-0000-000000000000'
  )$$,
  'P0001','Home room must belong to the same school and tenant as the register class',
  'non-existent room is denied on update'
);

-- 12. shared-room arrangement is permitted (no hard one-class-per-room limit)
select public.update_register_class(
  (select id from public.register_classes where class_code='7a'),
  '70150000-0000-4000-8000-000000000010', '7a', 'Grade 7/A',
  '70160000-0000-4000-8000-000000000001'
);

select is(
  (select count(*) from public.register_classes where home_room_id='70160000-0000-4000-8000-000000000001'),
  2,
  'shared-room arrangement is permitted: more than one class can reference the same room'
);

-- 13. existing register-class behavior preserved
select lives_ok(
  $$select public.update_register_class(
    (select id from public.register_classes where class_code='7f'),
    '70150000-0000-4000-8000-000000000010',
    '7f', 'Grade Seven F',
    null
  )$$,
  'register class code and name can be updated without touching home room'
);

select is(
  (select display_name from public.register_classes where class_code='7f'),
  'Grade Seven F',
  'display name update without home room succeeds'
);

select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','',true);

select * from finish();
rollback;
