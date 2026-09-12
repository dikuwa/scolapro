begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fe000000-0000-4000-8000-000000000001','inventory-manager@example.test','authenticated','authenticated',now(),now()),
  ('fe000000-0000-4000-8000-000000000002','inventory-stale@example.test','authenticated','authenticated',now(),now()),
  ('fe000000-0000-4000-8000-000000000003','inventory-active@example.test','authenticated','authenticated',now(),now());

set local session_replication_role = replica;

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('fe100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fe000000-0000-4000-8000-000000000002','INV-STALE','Stale','Custodian','active'),
  ('fe100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fe000000-0000-4000-8000-000000000003','INV-ACTIVE','Active','Custodian','active');

insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from,active_to) values
  ('fe110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe000000-0000-4000-8000-000000000001',null,'school_admin',current_date-30,null),
  ('fe110000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe000000-0000-4000-8000-000000000002','fe100000-0000-4000-8000-000000000001','teacher',current_date-30,null),
  ('fe110000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe000000-0000-4000-8000-000000000003','fe100000-0000-4000-8000-000000000002','teacher',current_date-30,null);

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id) values
  ('fe120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe100000-0000-4000-8000-000000000001','teacher',current_date-30,current_date-1,'fe000000-0000-4000-8000-000000000001'),
  ('fe120000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe100000-0000-4000-8000-000000000002','teacher',current_date-30,null,'fe000000-0000-4000-8000-000000000001');

insert into public.school_rooms(id,tenant_id,school_id,room_code,display_name,status)
values('fe130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','INV-AUDIT','Inventory Audit Room','active');

insert into public.room_inventory_custodians(id,tenant_id,school_id,room_id,staff_member_id,effective_from,effective_to,assigned_by_user_id)
values('fe140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe130000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000001',current_date-20,null,'fe000000-0000-4000-8000-000000000001');

insert into public.room_inventory_items(id,tenant_id,school_id,room_id,item_name,ownership,quantity,condition,status,version,created_by_user_id)
values('fe150000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe130000-0000-4000-8000-000000000001','Audit Desk','school',1,'good','active',1,'fe000000-0000-4000-8000-000000000001');

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000002',true);

select is(app_private.is_current_room_inventory_custodian('fe130000-0000-4000-8000-000000000001'),false,'ended authoritative placement defeats stale linked membership for custodian authority');
select is((select count(*) from public.room_inventory_items where id='fe150000-0000-4000-8000-000000000001'),0::bigint,'ended-placement custodian cannot read room inventory');
select throws_ok(
  $$select public.create_room_inventory_item('fe130000-0000-4000-8000-000000000001','Denied Chair','school',1,'good',null,null)$$,
  'Permission denied',
  'ended-placement custodian cannot mutate room inventory'
);

select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.assign_room_inventory_custodian('fe130000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000001',current_date)$$,
  'Staff member is not assigned to this school',
  'manager cannot assign custodian through stale membership after authoritative placement ended'
);

select lives_ok(
  $$select public.assign_room_inventory_custodian('fe130000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000002',current_date)$$,
  'manager can assign staff with current authoritative placement'
);

select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000003',true);
select ok(app_private.is_current_room_inventory_custodian('fe130000-0000-4000-8000-000000000001'),'active governed placement supplies custodian authority');
select is((select count(*) from public.room_inventory_items where id='fe150000-0000-4000-8000-000000000001'),1::bigint,'active custodian can read room inventory');

select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.room_inventory_custodians where room_id='fe130000-0000-4000-8000-000000000001'),2::bigint,'custodian reassignment preserves historical relationship row');

reset role;
select * from finish();
rollback;
