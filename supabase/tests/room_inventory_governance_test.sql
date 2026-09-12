begin;

select plan(33);

select ok(to_regclass('public.room_inventory_custodians') is not null,'room inventory custodian table exists');
select ok(to_regclass('public.room_inventory_items') is not null,'room inventory item table exists');
select ok(to_regclass('public.room_inventory_events') is not null,'room inventory event table exists');
select ok(to_regclass('public.room_inventory_verifications') is not null,'room inventory verification table exists');

select ok((select relrowsecurity from pg_class where oid='public.room_inventory_custodians'::regclass),'custodian RLS is enabled');
select ok((select relrowsecurity from pg_class where oid='public.room_inventory_items'::regclass),'item RLS is enabled');
select ok((select relrowsecurity from pg_class where oid='public.room_inventory_events'::regclass),'event RLS is enabled');
select ok((select relrowsecurity from pg_class where oid='public.room_inventory_verifications'::regclass),'verification RLS is enabled');

select ok(to_regprocedure('public.assign_room_inventory_custodian(uuid,uuid,date)') is not null,'custodian assignment RPC exists');
select ok(to_regprocedure('public.create_room_inventory_item(uuid,text,text,integer,text,text,text)') is not null,'inventory creation RPC exists');
select ok(to_regprocedure('public.change_room_inventory_item(uuid,text,integer,text,text,text)') is not null,'inventory change RPC exists');
select ok(to_regprocedure('public.verify_room_inventory(uuid,text,text)') is not null,'inventory verification RPC exists');

select ok(not has_function_privilege('anon','public.assign_room_inventory_custodian(uuid,uuid,date)','EXECUTE'),'anonymous users cannot assign room custodians');
select ok(not has_function_privilege('anon','public.create_room_inventory_item(uuid,text,text,integer,text,text,text)','EXECUTE'),'anonymous users cannot create room inventory items');
select ok(not has_function_privilege('anon','public.change_room_inventory_item(uuid,text,integer,text,text,text)','EXECUTE'),'anonymous users cannot mutate room inventory items');
select ok(not has_function_privilege('anon','public.verify_room_inventory(uuid,text,text)','EXECUTE'),'anonymous users cannot verify room inventory');

select ok(has_function_privilege('authenticated','public.assign_room_inventory_custodian(uuid,uuid,date)','EXECUTE'),'authenticated users can invoke governed custodian assignment RPC');
select ok(has_function_privilege('authenticated','public.create_room_inventory_item(uuid,text,text,integer,text,text,text)','EXECUTE'),'authenticated users can invoke governed inventory creation RPC');
select ok(has_function_privilege('authenticated','public.change_room_inventory_item(uuid,text,integer,text,text,text)','EXECUTE'),'authenticated users can invoke governed inventory change RPC');
select ok(has_function_privilege('authenticated','public.verify_room_inventory(uuid,text,text)','EXECUTE'),'authenticated users can invoke governed inventory verification RPC');

select ok(not has_table_privilege('authenticated','public.room_inventory_custodians','INSERT,UPDATE,DELETE'),'authenticated users cannot directly mutate custodians');
select ok(not has_table_privilege('authenticated','public.room_inventory_items','INSERT,UPDATE,DELETE'),'authenticated users cannot directly mutate inventory items');
select ok(not has_table_privilege('authenticated','public.room_inventory_events','INSERT,UPDATE,DELETE'),'authenticated users cannot directly mutate inventory events');
select ok(not has_table_privilege('authenticated','public.room_inventory_verifications','INSERT,UPDATE,DELETE'),'authenticated users cannot directly mutate inventory verifications');

select ok(position('staff_member_covers_school_period' in pg_get_functiondef('app_private.is_current_room_inventory_custodian(uuid)'::regprocedure)) > 0,'custodian access uses governed staff placement coverage helper');
select ok(
  position('staff_school_assignments' in pg_get_functiondef('app_private.staff_member_covers_school_period(uuid,uuid,date,date)'::regprocedure)) > 0
  and position('school_memberships' in pg_get_functiondef('app_private.staff_member_covers_school_period(uuid,uuid,date,date)'::regprocedure)) > 0,
  'governed placement helper preserves authoritative assignment history with legacy membership fallback'
);
select ok(to_regprocedure('app_private.room_inventory_current_school_id()') is not null,'room inventory current-school resolver exists');
select ok(not has_function_privilege('authenticated','app_private.room_inventory_current_school_id()','EXECUTE'),'authenticated users cannot invoke the internal current-school resolver directly');
select ok(position('room_inventory_current_school_id' in pg_get_functiondef('app_private.can_manage_room_inventory(uuid)'::regprocedure)) > 0,'manager authorization binds to deterministic current school');
select ok(position('room_inventory_current_school_id' in pg_get_functiondef('app_private.is_current_room_inventory_custodian(uuid)'::regprocedure)) > 0,'custodian authorization binds to deterministic current school');

insert into auth.users(id,email,aud,role,created_at,updated_at)
values ('ca700000-0000-4000-8000-000000000001','inventory-current-school@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(
  id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from
) values (
  'ca710000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'ca700000-0000-4000-8000-000000000001',
  null,
  'school_admin',
  current_date - 10
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ca700000-0000-4000-8000-000000000001',true);

select ok(
  app_private.can_manage_room_inventory('22222222-2222-4222-8222-222222222222'),
  'single-school administrator retains room inventory authority in that school'
);

insert into public.schools(id,tenant_id,name,emis_number,status) values (
  'ca720000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Inventory Current School B',
  'TST-INV-CURRENT-B',
  'active'
);

insert into public.school_memberships(
  id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from
) values (
  'ca710000-0000-4000-8000-000000000002',
  '11111111-1111-4111-8111-111111111111',
  'ca720000-0000-4000-8000-000000000001',
  'ca700000-0000-4000-8000-000000000001',
  null,
  'school_admin',
  current_date
);

select ok(
  not app_private.can_manage_room_inventory('22222222-2222-4222-8222-222222222222'),
  'another active non-current school membership cannot retain room inventory management authority'
);

select ok(
  app_private.can_manage_room_inventory('ca720000-0000-4000-8000-000000000001'),
  'room inventory management follows the deterministic current school'
);

select * from finish();
rollback;
