begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fd000000-0000-4000-8000-000000000001','tt-read-multi@example.test','authenticated','authenticated',now(),now()),
  ('fd000000-0000-4000-8000-000000000002','tt-read-support@example.test','authenticated','authenticated',now(),now()),
  ('fd000000-0000-4000-8000-000000000003','tt-read-admin@example.test','authenticated','authenticated',now(),now());

set local session_replication_role = replica;

insert into public.schools(id,tenant_id,name,emis_number,region,town,status) values
  ('fd100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Timetable Read Old School','TT-READ-OLD','Erongo','Swakopmund','active'),
  ('fd100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Timetable Read Current School','TT-READ-CUR','Erongo','Swakopmund','active');

insert into public.school_memberships(id,tenant_id,school_id,user_id,role_key,active_from,active_to) values
  ('fd110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd100000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','school_admin',current_date-30,null),
  ('fd110000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fd100000-0000-4000-8000-000000000002','fd000000-0000-4000-8000-000000000001','school_admin',current_date-5,null);

insert into public.platform_memberships(user_id,role_key,active_from) values
  ('fd000000-0000-4000-8000-000000000002','platform_support',current_date-10),
  ('fd000000-0000-4000-8000-000000000003','platform_admin',current_date-10);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('fd120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',null,'TT-READ-1','Old','Teacher','active'),
  ('fd120000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',null,'TT-READ-2','Current','Teacher','active');

insert into public.teacher_allocations(id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from,active_to) values
  ('fd130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd100000-0000-4000-8000-000000000001',2026,'fd131000-0000-4000-8000-000000000001','fd132000-0000-4000-8000-000000000001','fd120000-0000-4000-8000-000000000001',current_date-20,null),
  ('fd130000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fd100000-0000-4000-8000-000000000002',2026,'fd131000-0000-4000-8000-000000000002','fd132000-0000-4000-8000-000000000002','fd120000-0000-4000-8000-000000000002',current_date-20,null);

insert into public.timetable_periods(id,tenant_id,school_id,academic_year,period_number,display_name,starts_at,ends_at,is_teaching_period) values
  ('fd140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd100000-0000-4000-8000-000000000001',2026,1,'Old Period','08:00','08:45',true),
  ('fd140000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fd100000-0000-4000-8000-000000000002',2026,1,'Current Period','08:00','08:45',true);

insert into public.school_rooms(id,tenant_id,school_id,room_code,display_name,status) values
  ('fd150000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd100000-0000-4000-8000-000000000001','OLD-R','Old Room','active'),
  ('fd150000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fd100000-0000-4000-8000-000000000002','CUR-R','Current Room','active');

insert into public.timetable_slots(id,tenant_id,school_id,academic_year,cycle_code,weekday,period_id,register_class_id,teacher_allocation_id,room_id,status) values
  ('fd160000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd100000-0000-4000-8000-000000000001',2026,'A',1,'fd140000-0000-4000-8000-000000000001','fd132000-0000-4000-8000-000000000001','fd130000-0000-4000-8000-000000000001','fd150000-0000-4000-8000-000000000001','active'),
  ('fd160000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fd100000-0000-4000-8000-000000000002',2026,'A',1,'fd140000-0000-4000-8000-000000000002','fd132000-0000-4000-8000-000000000002','fd130000-0000-4000-8000-000000000002','fd150000-0000-4000-8000-000000000002','active');

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);

select is((select count(*) from public.teacher_allocations where id in ('fd130000-0000-4000-8000-000000000001','fd130000-0000-4000-8000-000000000002')),1::bigint,'multi-school user reads teacher allocation only in deterministic current school');
select is((select count(*) from public.timetable_periods where id in ('fd140000-0000-4000-8000-000000000001','fd140000-0000-4000-8000-000000000002')),1::bigint,'multi-school user reads timetable period only in deterministic current school');
select is((select count(*) from public.timetable_slots where id in ('fd160000-0000-4000-8000-000000000001','fd160000-0000-4000-8000-000000000002')),1::bigint,'multi-school user reads timetable slot only in deterministic current school');
select is((select count(*) from public.school_rooms where id in ('fd150000-0000-4000-8000-000000000001','fd150000-0000-4000-8000-000000000002')),1::bigint,'multi-school user reads room only in deterministic current school');

select is((select school_id from public.teacher_allocations where id in ('fd130000-0000-4000-8000-000000000001','fd130000-0000-4000-8000-000000000002') limit 1),'fd100000-0000-4000-8000-000000000002'::uuid,'visible teacher allocation belongs to current school');
select is((select school_id from public.timetable_slots where id in ('fd160000-0000-4000-8000-000000000001','fd160000-0000-4000-8000-000000000002') limit 1),'fd100000-0000-4000-8000-000000000002'::uuid,'visible timetable slot belongs to current school');

select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.teacher_allocations where id in ('fd130000-0000-4000-8000-000000000001','fd130000-0000-4000-8000-000000000002')),0::bigint,'Platform Support cannot read teacher allocations');
select is((select count(*) from public.timetable_slots where id in ('fd160000-0000-4000-8000-000000000001','fd160000-0000-4000-8000-000000000002')),0::bigint,'Platform Support cannot read timetable slots');
select is((select count(*) from public.school_rooms where id in ('fd150000-0000-4000-8000-000000000001','fd150000-0000-4000-8000-000000000002')),0::bigint,'Platform Support cannot read timetable rooms');

select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.school_rooms where id in ('fd150000-0000-4000-8000-000000000001','fd150000-0000-4000-8000-000000000002')),2::bigint,'existing Platform Admin room-read semantics remain preserved');

reset role;
select * from finish();
rollback;
