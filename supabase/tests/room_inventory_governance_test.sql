begin;

select plan(26);

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

select ok(position('staff_school_assignments' in pg_get_functiondef('app_private.is_current_room_inventory_custodian(uuid)'::regprocedure)) > 0,'custodian access checks current staff-school assignment');
select ok(position('school_memberships' in pg_get_functiondef('app_private.is_current_room_inventory_custodian(uuid)'::regprocedure)) > 0,'custodian access checks current school membership fallback');

select * from finish();
rollback;
