begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fc000000-0000-4000-8000-000000000001','offline-coverage-teacher@example.test','authenticated','authenticated',now(),now());

set local session_replication_role = replica;
insert into public.staff_members(id,tenant_id,user_id,first_name,last_name,status)
values('fc100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc000000-0000-4000-8000-000000000001','Offline','Coverage','active');
insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values('fc200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001','teacher',current_date-30);
insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id)
values('fc300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc100000-0000-4000-8000-000000000001','teacher',current_date-30,'fc000000-0000-4000-8000-000000000001');
insert into public.teacher_allocations(id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from)
values('fc400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fc410000-0000-4000-8000-000000000001','fc420000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001',current_date-30);
insert into public.teaching_schedule_items(id,tenant_id,school_id,academic_year,pacing_plan_item_id,register_class_id,teacher_allocation_id,planned_on,planned_period_count,status)
values('fc500000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fc510000-0000-4000-8000-000000000001','fc420000-0000-4000-8000-000000000001','fc400000-0000-4000-8000-000000000001',current_date,2,'planned');
set local session_replication_role = origin;

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$select public.record_teaching_actual_idempotent('fc600000-0000-4000-8000-000000000001','fc500000-0000-4000-8000-000000000001',current_date,2::smallint,'taught','Reflection','Compensatory')$$,
  'first offline teaching actual replay operation records an append-only actual'
);

select is((select count(*)::integer from public.teaching_actuals where teaching_schedule_item_id='fc500000-0000-4000-8000-000000000001'),1,'first operation creates one teaching actual');
select is((select count(*)::integer from public.client_operation_receipts where actor_user_id='fc000000-0000-4000-8000-000000000001' and operation_type='teaching_actual.record'),1,'first operation creates one idempotency receipt');

select is(
  public.record_teaching_actual_idempotent('fc600000-0000-4000-8000-000000000001','fc500000-0000-4000-8000-000000000001',current_date,2::smallint,'taught','Reflection','Compensatory'),
  (select id from public.teaching_actuals where teaching_schedule_item_id='fc500000-0000-4000-8000-000000000001'),
  'replaying the same operation returns the original actual'
);

select is((select count(*)::integer from public.teaching_actuals where teaching_schedule_item_id='fc500000-0000-4000-8000-000000000001'),1,'replay does not duplicate the append-only actual');

select throws_ok(
  $$select public.record_teaching_actual_idempotent('fc600000-0000-4000-8000-000000000001','fc500000-0000-4000-8000-000000000001',current_date,1::smallint,'taught','Changed','Compensatory')$$,
  'Client operation ID was already used with different teaching actual data',
  'reusing an operation key with changed teaching data is rejected'
);

set local session_replication_role = replica;
update public.staff_school_assignments set effective_to=current_date-1 where id='fc300000-0000-4000-8000-000000000001';
update public.school_memberships set active_to=current_date-1 where id='fc200000-0000-4000-8000-000000000001';
set local session_replication_role = origin;

select throws_ok(
  $$select public.record_teaching_actual_idempotent('fc600000-0000-4000-8000-000000000002','fc500000-0000-4000-8000-000000000001',current_date,2::smallint,'taught','Other','Other')$$,
  'Teaching actual recorder mismatch: user is not authorized for teaching allocation',
  'a different offline operation cannot bypass current recorder authority'
);

select ok(not exists(select 1 from public.teaching_schedule_items where id='fc500000-0000-4000-8000-000000000001' and planned_period_count<>2),'offline recording never rewrites planned schedule items');

select * from finish();
rollback;
