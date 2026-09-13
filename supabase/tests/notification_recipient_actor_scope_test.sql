begin;

select plan(11);

insert into public.tenants(id,name,slug)
values('cb110000-0000-4000-8000-000000000001','Notification Actor Tenant','notification-actor-tenant');

insert into public.schools(id,tenant_id,name,emis_number,status)
values('cb120000-0000-4000-8000-000000000001','cb110000-0000-4000-8000-000000000001','Notification Actor School','NB-ACTOR','active');

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('cb100000-0000-4000-8000-000000000001','notify-current@example.test','authenticated','authenticated',now(),now()),
  ('cb100000-0000-4000-8000-000000000002','notify-stale@example.test','authenticated','authenticated',now(),now()),
  ('cb100000-0000-4000-8000-000000000003','notify-mixed-support@example.test','authenticated','authenticated',now(),now()),
  ('cb100000-0000-4000-8000-000000000004','notify-other@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('cb140000-0000-4000-8000-000000000001','cb110000-0000-4000-8000-000000000001','cb100000-0000-4000-8000-000000000001','NB-CURRENT','Current','Staff','active'),
  ('cb140000-0000-4000-8000-000000000002','cb110000-0000-4000-8000-000000000001','cb100000-0000-4000-8000-000000000002','NB-STALE','Stale','Staff','active');

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id) values
  ('cb150000-0000-4000-8000-000000000001','cb110000-0000-4000-8000-000000000001','cb120000-0000-4000-8000-000000000001','cb140000-0000-4000-8000-000000000001','staff',current_date-30,null,'cb100000-0000-4000-8000-000000000001'),
  ('cb150000-0000-4000-8000-000000000002','cb110000-0000-4000-8000-000000000001','cb120000-0000-4000-8000-000000000001','cb140000-0000-4000-8000-000000000002','staff',current_date-30,current_date,'cb100000-0000-4000-8000-000000000001');

insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
  ('cb130000-0000-4000-8000-000000000001','cb110000-0000-4000-8000-000000000001','cb120000-0000-4000-8000-000000000001','cb100000-0000-4000-8000-000000000001','cb140000-0000-4000-8000-000000000001','teacher',current_date-30),
  ('cb130000-0000-4000-8000-000000000002','cb110000-0000-4000-8000-000000000001','cb120000-0000-4000-8000-000000000001','cb100000-0000-4000-8000-000000000002','cb140000-0000-4000-8000-000000000002','teacher',current_date-30),
  ('cb130000-0000-4000-8000-000000000003','cb110000-0000-4000-8000-000000000001','cb120000-0000-4000-8000-000000000001','cb100000-0000-4000-8000-000000000003',null,'teacher',current_date-30),
  ('cb130000-0000-4000-8000-000000000004','cb110000-0000-4000-8000-000000000001','cb120000-0000-4000-8000-000000000001','cb100000-0000-4000-8000-000000000004',null,'teacher',current_date-30);

insert into public.platform_memberships(user_id,role_key,active_from)
values('cb100000-0000-4000-8000-000000000003','platform_support',current_date-30);

insert into public.notifications(id,recipient_user_id,tenant_id,school_id,title) values
  ('cb190000-0000-4000-8000-000000000001','cb100000-0000-4000-8000-000000000001','cb110000-0000-4000-8000-000000000001','cb120000-0000-4000-8000-000000000001','Current recipient notice'),
  ('cb190000-0000-4000-8000-000000000002','cb100000-0000-4000-8000-000000000002','cb110000-0000-4000-8000-000000000001','cb120000-0000-4000-8000-000000000001','Stale recipient notice'),
  ('cb190000-0000-4000-8000-000000000004','cb100000-0000-4000-8000-000000000004','cb110000-0000-4000-8000-000000000001','cb120000-0000-4000-8000-000000000001','Other recipient notice');

update public.staff_school_assignments
set effective_to=current_date-1
where id='cb150000-0000-4000-8000-000000000002';

select throws_ok(
  $$insert into public.notifications(recipient_user_id,tenant_id,school_id,title)
    values('cb100000-0000-4000-8000-000000000002','cb110000-0000-4000-8000-000000000001','cb120000-0000-4000-8000-000000000001','Stale membership creation')$$,
  'Notification scope mismatch: recipient is not related to school',
  'ended linked staff placement cannot qualify through an otherwise active school membership'
);

select throws_ok(
  $$insert into public.notifications(recipient_user_id,tenant_id,school_id,title)
    values('cb100000-0000-4000-8000-000000000003','cb110000-0000-4000-8000-000000000001','cb120000-0000-4000-8000-000000000001','Mixed support creation')$$,
  'Notification scope mismatch: recipient is not related to school',
  'Platform Support cannot qualify as a school-operational recipient through an active school membership'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','cb100000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*)::integer from public.notifications where id='cb190000-0000-4000-8000-000000000002'),0,'stale linked placement cannot enumerate its historical school notification');
select is(public.mark_all_notifications_read(),0,'stale linked placement cannot mark historical school notifications read');
select is(public.dismiss_all_notifications(),0,'stale linked placement cannot clear historical school notifications');
reset role;

select set_config('request.jwt.claim.sub','cb100000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select count(*)::integer from public.notifications where school_id='cb120000-0000-4000-8000-000000000001'),0,'Platform Support cannot enumerate school-operational notifications through generic school scope');
reset role;

select set_config('request.jwt.claim.sub','cb100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select count(*)::integer from public.notifications where id='cb190000-0000-4000-8000-000000000001'),1,'current effective recipient retains its school notification');
select is(public.mark_all_notifications_read(),1,'mark-all mutates only the authenticated recipient visible notification');
select is((select count(*)::integer from public.notifications where id='cb190000-0000-4000-8000-000000000004' and read_at is not null),0,'mark-all cannot mutate another recipient notification');
delete from public.notifications where id='cb190000-0000-4000-8000-000000000004';
select is((select count(*)::integer from public.notifications where id='cb190000-0000-4000-8000-000000000004'),0,'another recipient notification is not visible through delete targeting');
reset role;

select is((select count(*)::integer from public.notifications where id='cb190000-0000-4000-8000-000000000004'),1,'recipient-scoped delete did not remove another user notification or provenance');
select is((select count(*)::integer from public.notifications where id='cb190000-0000-4000-8000-000000000002'),1,'ended relationship leaves historical notification row durable');

select * from finish();
rollback;
