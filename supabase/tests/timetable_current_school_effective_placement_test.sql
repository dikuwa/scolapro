begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fc000000-0000-4000-8000-000000000001','timetable-current-admin@example.test','authenticated','authenticated',now(),now()),
('fc000000-0000-4000-8000-000000000002','timetable-support@example.test','authenticated','authenticated',now(),now()),
('fc000000-0000-4000-8000-000000000003','timetable-network@example.test','authenticated','authenticated',now(),now()),
('fc000000-0000-4000-8000-000000000004','timetable-stale-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values('fc100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Timetable New Current School','TT-CURRENT','Erongo','Swakopmund','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000001','school_admin','2026-01-01');

insert into public.platform_memberships(user_id,role_key,active_from)
values('fc000000-0000-4000-8000-000000000002','platform_support',current_date);

insert into public.education_circuits(id,name,external_code)
values('fc200000-0000-4000-8000-000000000001','Timetable Audit Circuit','TT-C');
insert into public.education_network_memberships(user_id,role_key,circuit_id,active_from)
values('fc000000-0000-4000-8000-000000000003','circuit_officer','fc200000-0000-4000-8000-000000000001',current_date);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.upsert_school_room('22222222-2222-4222-8222-222222222222',null,'TT-AUDIT','Timetable Audit Room',null,30,'active',null)$$,
  'current-school admin can create a room'
);

select lives_ok(
  $$select public.upsert_timetable_period('22222222-2222-4222-8222-222222222222',2197,19::smallint,'Audit Period','14:00','14:45',true)$$,
  'current-school admin can create a timetable period'
);

reset role;

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000001','school_admin','2026-02-01');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);

select throws_ok(
  $$select public.upsert_school_room('22222222-2222-4222-8222-222222222222',null,'TT-DENIED','Denied Room',null,20,'active',null)$$,
  'Timetable mutation must target the current school',
  'older active non-current school cannot be targeted through room RPC'
);

select throws_ok(
  $$select public.upsert_timetable_period('22222222-2222-4222-8222-222222222222',2197,20::smallint,'Denied Period','15:00','15:45',true)$$,
  'Timetable mutation must target the current school',
  'older active non-current school cannot be targeted through timetable-period RPC'
);

select lives_ok(
  $$select public.upsert_school_room('fc100000-0000-4000-8000-000000000001',null,'TT-CURRENT','Current Room',null,25,'active',null)$$,
  'school admin retains mutation authority in deterministic current school'
);

reset role;

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values('fc300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc000000-0000-4000-8000-000000000004','TT-STALE-001','Stale','Teacher','active');
insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000004','fc300000-0000-4000-8000-000000000001','teacher','2026-01-01');
insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id)
values('fc400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc300000-0000-4000-8000-000000000001','teacher','2026-01-01',current_date-1,'fc000000-0000-4000-8000-000000000001');

select is(
  app_private.staff_member_covers_school_period('fc300000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',current_date,current_date+10),
  false,
  'ended authoritative staff placement cannot be extended by stale school membership'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select public.upsert_school_room('fc100000-0000-4000-8000-000000000001',null,'TT-SUPPORT','Support Room',null,20,'active',null)$$,
  'Permission denied',
  'platform_support cannot mutate school timetable rooms'
);

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$select public.upsert_school_room('fc100000-0000-4000-8000-000000000001',null,'TT-NETWORK','Network Room',null,20,'active',null)$$,
  'Permission denied',
  'network officer cannot mutate school timetable rooms'
);

reset role;
select has_trigger('public','timetable_slots','timetable_slots_room_scope','room-school consistency trigger remains installed');
select has_trigger('public','timetable_slots','timetable_slot_integrity_guard','timetable conflict/scope guard remains installed');

select * from finish();
rollback;
