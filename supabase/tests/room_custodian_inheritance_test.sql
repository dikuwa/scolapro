-- Issue #702: Room Inventory — default custodian inheritance + manual override.
-- Companion migration:
--   supabase/migrations/20260924140000_room_custodian_inheritance.sql
--
-- Verifies:
-- - inherited custodian is derived from Register Class -> Home Room -> Register Teacher
-- - manual override wins while the inherited default stays visible
-- - clearing a manual override restores the inherited default and keeps history
-- - changing the register teacher changes the default inheritance
-- - room without a register class stays a valid manual-only workflow
-- - shared room with different teachers is surfaced as ambiguous, never silently chosen
-- - shared room with one teacher still resolves
-- - cross-school and cross-tenant resolution/assignment is denied
-- - no privilege broadening and no hard one-class-per-room constraint

begin;

select plan(46);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser)
-- ---------------------------------------------------------------------------
insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('70200000-0000-4000-8000-000000000001','admin-702@example.test','authenticated','authenticated',now(),now()),
  ('70200000-0000-4000-8000-000000000002','teacher-702@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug,status)
values
  ('70210000-0000-4000-8000-000000000001','Custodian Tenant','custodian-702','active'),
  ('70210000-0000-4000-8000-000000000002','Cross Tenant 702','cross-tenant-702','active');

insert into public.schools(id,tenant_id,name,status)
values
  ('70220000-0000-4000-8000-000000000001','70210000-0000-4000-8000-000000000001','Homeroom School','active'),
  ('70220000-0000-4000-8000-000000000002','70210000-0000-4000-8000-000000000001','Other School 702','active'),
  ('70220000-0000-4000-8000-000000000003','70210000-0000-4000-8000-000000000002','Cross Tenant School 702','active');

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values
  ('70230000-0000-4000-8000-000000000001','70210000-0000-4000-8000-000000000001','70200000-0000-4000-8000-000000000001','E702-1','Ada','Admin','active'),
  ('70230000-0000-4000-8000-000000000002','70210000-0000-4000-8000-000000000001',null,'E702-2','Alpha','Teacher','active'),
  ('70230000-0000-4000-8000-000000000003','70210000-0000-4000-8000-000000000001',null,'E702-3','Bravo','Teacher','active'),
  ('70230000-0000-4000-8000-000000000004','70210000-0000-4000-8000-000000000001',null,'E702-4','Noor','Longstaff','inactive'),
  ('70230000-0000-4000-8000-000000000005','70210000-0000-4000-8000-000000000001',null,'E702-5','Cara','Teacher','active'),
  ('70230000-0000-4000-8000-000000000006','70210000-0000-4000-8000-000000000001','70200000-0000-4000-8000-000000000002','E702-6','Tim','Teacher','active'),
  ('70230000-0000-4000-8000-000000000007','70210000-0000-4000-8000-000000000002',null,'E702-7','Xen','Crossstaff','active');

insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values
  ('70240000-0000-4000-8000-000000000001','70210000-0000-4000-8000-000000000001','70220000-0000-4000-8000-000000000001','70200000-0000-4000-8000-000000000001','70230000-0000-4000-8000-000000000001','school_admin',current_date-30),
  ('70240000-0000-4000-8000-000000000002','70210000-0000-4000-8000-000000000001','70220000-0000-4000-8000-000000000001','70200000-0000-4000-8000-000000000002','70230000-0000-4000-8000-000000000006','teacher',current_date-30);

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id)
select gen_random_uuid(),'70210000-0000-4000-8000-000000000001','70220000-0000-4000-8000-000000000001',s.id,'teacher',current_date-30,'70200000-0000-4000-8000-000000000001'
from public.staff_members s
where s.id in (
  '70230000-0000-4000-8000-000000000001','70230000-0000-4000-8000-000000000002',
  '70230000-0000-4000-8000-000000000003','70230000-0000-4000-8000-000000000004',
  '70230000-0000-4000-8000-000000000005','70230000-0000-4000-8000-000000000006'
);

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id)
values('70250000-0000-4000-8000-000000000001','70210000-0000-4000-8000-000000000002','70220000-0000-4000-8000-000000000003','70230000-0000-4000-8000-000000000007','staff',current_date-30,'70200000-0000-4000-8000-000000000001');

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name)
values
  ('70260000-0000-4000-8000-000000000001','70210000-0000-4000-8000-000000000001','70220000-0000-4000-8000-000000000001',2026,'07','Grade 7'),
  ('70260000-0000-4000-8000-000000000002','70210000-0000-4000-8000-000000000001','70220000-0000-4000-8000-000000000002',2026,'07','Grade 7'),
  ('70260000-0000-4000-8000-000000000003','70210000-0000-4000-8000-000000000002','70220000-0000-4000-8000-000000000003',2026,'07','Grade 7');

insert into public.school_rooms(id,tenant_id,school_id,room_code,display_name,block_name,status)
values
  ('70270000-0000-4000-8000-000000000001','70210000-0000-4000-8000-000000000001','70220000-0000-4000-8000-000000000001','R101','Room 101','Block A','active'),
  ('70270000-0000-4000-8000-000000000002','70210000-0000-4000-8000-000000000001','70220000-0000-4000-8000-000000000001','R102','Room 102','Block A','active'),
  ('70270000-0000-4000-8000-000000000003','70210000-0000-4000-8000-000000000001','70220000-0000-4000-8000-000000000001','R103','Room 103','Block A','active'),
  ('70270000-0000-4000-8000-000000000004','70210000-0000-4000-8000-000000000001','70220000-0000-4000-8000-000000000001','R104','Room 104','Block B','active'),
  ('70270000-0000-4000-8000-000000000005','70210000-0000-4000-8000-000000000001','70220000-0000-4000-8000-000000000001','R105','Room 105','Block B','active'),
  ('70270000-0000-4000-8000-000000000006','70210000-0000-4000-8000-000000000001','70220000-0000-4000-8000-000000000001','R106','Room 106','Block B','active'),
  ('70270000-0000-4000-8000-000000000007','70210000-0000-4000-8000-000000000001','70220000-0000-4000-8000-000000000002','R201','Room 201','Block C','active'),
  ('70270000-0000-4000-8000-000000000008','70210000-0000-4000-8000-000000000002','70220000-0000-4000-8000-000000000003','R301','Room 301','Block X','active');

-- Register classes: home room + register teacher relationships (from #701)
insert into public.register_classes(id,tenant_id,school_id,grade_id,academic_year,class_code,display_name,home_room_id,register_teacher_staff_id)
values
  ('70280000-0000-4000-8000-000000000001','70210000-0000-4000-8000-000000000001','70220000-0000-4000-8000-000000000001','70260000-0000-4000-8000-000000000001',2026,'7A','Grade 7/A','70270000-0000-4000-8000-000000000001','70230000-0000-4000-8000-000000000002'),
  ('70280000-0000-4000-8000-000000000002','70210000-0000-4000-8000-000000000001','70220000-0000-4000-8000-000000000001','70260000-0000-4000-8000-000000000001',2026,'7B','Grade 7/B','70270000-0000-4000-8000-000000000002',null),
  ('70280000-0000-4000-8000-000000000003','70210000-0000-4000-8000-000000000001','70220000-0000-4000-8000-000000000001','70260000-0000-4000-8000-000000000001',2026,'7C','Grade 7/C','70270000-0000-4000-8000-000000000003','70230000-0000-4000-8000-000000000004'),
  ('70280000-0000-4000-8000-000000000004','70210000-0000-4000-8000-000000000001','70220000-0000-4000-8000-000000000001','70260000-0000-4000-8000-000000000001',2026,'4A','Grade 4/A','70270000-0000-4000-8000-000000000004','70230000-0000-4000-8000-000000000002'),
  ('70280000-0000-4000-8000-000000000005','70210000-0000-4000-8000-000000000001','70220000-0000-4000-8000-000000000001','70260000-0000-4000-8000-000000000001',2026,'4B','Grade 4/B','70270000-0000-4000-8000-000000000004','70230000-0000-4000-8000-000000000003'),
  ('70280000-0000-4000-8000-000000000006','70210000-0000-4000-8000-000000000001','70220000-0000-4000-8000-000000000001','70260000-0000-4000-8000-000000000001',2026,'5A','Grade 5/A','70270000-0000-4000-8000-000000000005','70230000-0000-4000-8000-000000000002'),
  ('70280000-0000-4000-8000-000000000007','70210000-0000-4000-8000-000000000001','70220000-0000-4000-8000-000000000001','70260000-0000-4000-8000-000000000001',2026,'5B','Grade 5/B','70270000-0000-4000-8000-000000000005','70230000-0000-4000-8000-000000000002'),
  ('70280000-0000-4000-8000-000000000008','70210000-0000-4000-8000-000000000001','70220000-0000-4000-8000-000000000001','70260000-0000-4000-8000-000000000001',2026,'6A','Grade 6/A',null,'70230000-0000-4000-8000-000000000002');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','70200000-0000-4000-8000-000000000001',true);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- 1. Contracts and grant surface
-- ---------------------------------------------------------------------------
select ok(to_regprocedure('public.resolve_room_inventory_custodian(uuid)') is not null,'single room resolver exists');
select ok(to_regprocedure('public.resolve_school_room_custodians(uuid)') is not null,'school room resolver exists');
select ok(to_regprocedure('public.clear_room_inventory_custodian(uuid,date)') is not null,'clear override RPC exists');
select ok(to_regprocedure('app_private.resolve_room_custodian_core(uuid)') is not null,'internal core resolver exists');

select ok(not has_function_privilege('anon','public.resolve_room_inventory_custodian(uuid)','EXECUTE'),'anonymous users cannot resolve a room custodian');
select ok(not has_function_privilege('anon','public.resolve_school_room_custodians(uuid)','EXECUTE'),'anonymous users cannot resolve school custodians');
select ok(not has_function_privilege('anon','public.clear_room_inventory_custodian(uuid,date)','EXECUTE'),'anonymous users cannot clear a custodian override');
select ok(not has_function_privilege('authenticated','app_private.resolve_room_custodian_core(uuid)','EXECUTE'),'core resolver stays internal to security definer code');
select ok(has_function_privilege('authenticated','public.resolve_room_inventory_custodian(uuid)','EXECUTE'),'authenticated users can resolve a room custodian');
select ok(has_function_privilege('authenticated','public.clear_room_inventory_custodian(uuid,date)','EXECUTE'),'authenticated managers can invoke clear override (authorization enforced inside)');

-- ---------------------------------------------------------------------------
-- 2. Inherited default from Register Class -> Home Room -> Register Teacher
-- ---------------------------------------------------------------------------
select is(
  (select source from public.resolve_room_inventory_custodian('70270000-0000-4000-8000-000000000001')),
  'inherited',
  'room with one home-room register teacher inherits the default custodian'
);
select is(
  (select staff_member_id from public.resolve_room_inventory_custodian('70270000-0000-4000-8000-000000000001')),
  '70230000-0000-4000-8000-000000000002',
  'inherited custodian is the register teacher'
);
select is(
  (select inherited_staff_member_id from public.resolve_room_inventory_custodian('70270000-0000-4000-8000-000000000001')),
  '70230000-0000-4000-8000-000000000002',
  'inherited source is reported separately for display'
);
select is(
  (select manual_staff_member_id from public.resolve_room_inventory_custodian('70270000-0000-4000-8000-000000000001')),
  null,
  'no manual override exists yet'
);
select is(
  (select reason from public.resolve_room_inventory_custodian('70270000-0000-4000-8000-000000000001')),
  'home_room_register_teacher',
  'inherited state reports its source reason'
);

-- ---------------------------------------------------------------------------
-- 3. Rooms that must not inherit
-- ---------------------------------------------------------------------------
select is(
  (select source from public.resolve_room_inventory_custodian('70270000-0000-4000-8000-000000000006')),
  'none',
  'room without a register class resolves to no custodian'
);
select is(
  (select reason from public.resolve_room_inventory_custodian('70270000-0000-4000-8000-000000000006')),
  'no_home_room_class',
  'room without a register class reports why nothing inherited'
);
select is(
  (select reason from public.resolve_room_inventory_custodian('70270000-0000-4000-8000-000000000002')),
  'home_room_teacher_unassigned',
  'home room without a register teacher reports the missing assignment'
);
select is(
  (select reason from public.resolve_room_inventory_custodian('70270000-0000-4000-8000-000000000003')),
  'home_room_teacher_not_current',
  'home room whose register teacher is not current reports that instead of inheriting'
);

-- ---------------------------------------------------------------------------
-- 4. Shared room / ambiguity is surfaced, never silently chosen
-- ---------------------------------------------------------------------------
select is(
  (select source from public.resolve_room_inventory_custodian('70270000-0000-4000-8000-000000000004')),
  'ambiguous',
  'room shared by classes with different register teachers is ambiguous'
);
select is(
  (select staff_member_id from public.resolve_room_inventory_custodian('70270000-0000-4000-8000-000000000004')),
  null,
  'ambiguous room never silently picks a custodian'
);
select is(
  (select home_room_class_count from public.resolve_room_inventory_custodian('70270000-0000-4000-8000-000000000004')),
  2,
  'ambiguous room reports how many register classes share it'
);
select is(
  (select home_room_teacher_count from public.resolve_room_inventory_custodian('70270000-0000-4000-8000-000000000004')),
  2,
  'ambiguous room reports how many different register teachers compete'
);
select is(
  (select source from public.resolve_room_inventory_custodian('70270000-0000-4000-8000-000000000005')),
  'inherited',
  'shared room with a single register teacher still inherits'
);
select is(
  (select home_room_class_count from public.resolve_room_inventory_custodian('70270000-0000-4000-8000-000000000005')),
  2,
  'shared room counts both register classes without a unique constraint'
);
select is(
  (select count(*)::int from public.room_inventory_custodians where room_id='70270000-0000-4000-8000-000000000004'),
  0,
  'inherited or ambiguous state never materialises a custodian row'
);

-- ---------------------------------------------------------------------------
-- 5. Manual override wins, clearing restores the inherited default
-- ---------------------------------------------------------------------------
select ok(
  public.assign_room_inventory_custodian('70270000-0000-4000-8000-000000000001','70230000-0000-4000-8000-000000000003',current_date - 1) is not null,
  'a manual custodian override can be recorded'
);
select is(
  (select source from public.resolve_room_inventory_custodian('70270000-0000-4000-8000-000000000001')),
  'manual',
  'manual override wins over the inherited default'
);
select is(
  (select staff_member_id from public.resolve_room_inventory_custodian('70270000-0000-4000-8000-000000000001')),
  '70230000-0000-4000-8000-000000000003',
  'manual custodian is the effective custodian'
);
select is(
  (select inherited_staff_member_id from public.resolve_room_inventory_custodian('70270000-0000-4000-8000-000000000001')),
  '70230000-0000-4000-8000-000000000002',
  'inherited default stays visible while a manual override exists'
);

select ok(
  (select public.clear_room_inventory_custodian('70270000-0000-4000-8000-000000000001', current_date)) > 0,
  'a manual override can be cleared'
);
select is(
  (select source from public.resolve_room_inventory_custodian('70270000-0000-4000-8000-000000000001')),
  'inherited',
  'clearing the override restores the inherited default'
);
select is(
  (select staff_member_id from public.resolve_room_inventory_custodian('70270000-0000-4000-8000-000000000001')),
  '70230000-0000-4000-8000-000000000002',
  'restored default is the register teacher'
);
select is(
  (select count(*)::int from public.room_inventory_custodians where room_id='70270000-0000-4000-8000-000000000001'),
  1,
  'historical custodian row survives clearing'
);
select is(
  (select count(*)::int from public.room_inventory_custodians where room_id='70270000-0000-4000-8000-000000000001' and effective_to is not null),
  1,
  'cleared custodian row is ended rather than rewritten'
);
select is(
  (select metadata->>'restored_source' from public.audit_events
   where event_type='room_inventory.custodian.cleared'
     and metadata->>'room_id'='70270000-0000-4000-8000-000000000001'),
  'inherited',
  'clear audit event records the restored default source'
);
select throws_ok(
  $$select public.clear_room_inventory_custodian('70270000-0000-4000-8000-000000000001', current_date)$$,
  'P0001','No manual custodian override to clear',
  'clearing again reports that no manual override exists'
);

-- ---------------------------------------------------------------------------
-- 6. Register teacher change drives future/default inheritance
-- ---------------------------------------------------------------------------
select is(
  public.assign_register_teacher('70280000-0000-4000-8000-000000000001','70230000-0000-4000-8000-000000000005'),
  true,
  'register teacher is changed through the governed path'
);
select is(
  (select staff_member_id from public.resolve_room_inventory_custodian('70270000-0000-4000-8000-000000000001')),
  '70230000-0000-4000-8000-000000000005',
  'changing the register teacher changes the inherited default'
);

-- ---------------------------------------------------------------------------
-- 7. Authorization boundaries
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub','70200000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select public.clear_room_inventory_custodian('70270000-0000-4000-8000-000000000001', current_date)$$,
  'P0001','Permission denied',
  'a non-manager cannot clear a custodian override'
);
select set_config('request.jwt.claim.sub','70200000-0000-4000-8000-000000000001',true);

select throws_ok(
  $$select source from public.resolve_room_inventory_custodian('70270000-0000-4000-8000-000000000007')$$,
  'P0001','Permission denied',
  'cross-school room resolution is denied'
);
select throws_ok(
  $$select source from public.resolve_room_inventory_custodian('70270000-0000-4000-8000-000000000008')$$,
  'P0001','Permission denied',
  'cross-tenant room resolution is denied'
);
select throws_ok(
  $$insert into public.register_classes(tenant_id,school_id,grade_id,academic_year,class_code,display_name,home_room_id,register_teacher_staff_id)
    values('70210000-0000-4000-8000-000000000001','70220000-0000-4000-8000-000000000002','70260000-0000-4000-8000-000000000002',2026,'X1','Cross School','70270000-0000-4000-8000-000000000001',null)$$,
  'Home room must belong to the same school and tenant as the register class',
  'cross-school inheritance is denied at write time'
);

-- ---------------------------------------------------------------------------
-- 8. No hard unique constraint and no privilege broadening
-- ---------------------------------------------------------------------------
select ok(
  not exists (
    select 1 from pg_indexes
    where tablename='register_classes'
      and indexdef ilike '%home_room_id%'
      and indexdef ilike '%unique%'
  ),
  'shared rooms are not blocked by a unique home-room constraint'
);
select ok(
  position('register_classes' in pg_get_functiondef('app_private.is_current_room_inventory_custodian(uuid)'::regprocedure)) = 0,
  'inherited default does not broaden room inventory authority'
);
select ok(
  to_regprocedure('public.assign_room_inventory_custodian(uuid,uuid,date)') is not null,
  'the governed manual assignment RPC is unchanged'
);

select * from finish();
rollback;

