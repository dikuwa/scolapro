begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fe000000-0000-4000-8000-000000000001','platform-support-identity@example.test','authenticated','authenticated',now(),now()),
  ('fe000000-0000-4000-8000-000000000002','platform-admin-identity@example.test','authenticated','authenticated',now(),now()),
  ('fe000000-0000-4000-8000-000000000003','school-staff-identity@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key,active_from)
values
  ('fe000000-0000-4000-8000-000000000001','platform_support',current_date),
  ('fe000000-0000-4000-8000-000000000002','platform_admin',current_date);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name)
values('fe100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fe000000-0000-4000-8000-000000000003','SUPPORT-SCOPE-STAFF','Scoped','Staff');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,position_title,effective_from,created_by_user_id
) values(
  'fe200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fe100000-0000-4000-8000-000000000001','staff','Boundary fixture',current_date,'fe000000-0000-4000-8000-000000000002'
);

insert into public.school_memberships(
  id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from
) values(
  'fe300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fe000000-0000-4000-8000-000000000003','fe100000-0000-4000-8000-000000000001','teacher',current_date
);

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000001',true);
select is(app_private.has_school_access('22222222-2222-4222-8222-222222222222'),true,'platform support retains support-safe school metadata scope');
select is(app_private.can_view_audit('22222222-2222-4222-8222-222222222222'),true,'platform support retains audit troubleshooting read scope');
select is(app_private.has_school_membership_scope('22222222-2222-4222-8222-222222222222'),false,'platform support does not receive school identity/authoring scope');

set local role authenticated;
select is((select count(*)::integer from public.school_memberships where id='fe300000-0000-4000-8000-000000000001'),0,'platform support cannot enumerate school memberships');
select is((select count(*)::integer from public.staff_school_assignments where id='fe200000-0000-4000-8000-000000000001'),0,'platform support cannot enumerate staff-school assignment relationships');
select is((select count(*)::integer from public.staff_members where id='fe100000-0000-4000-8000-000000000001'),0,'platform support cannot enumerate raw staff identities through support-safe school access');
select throws_ok(
  $$insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe000000-0000-4000-8000-000000000001','support.test','school','22222222-2222-4222-8222-222222222222','{}'::jsonb)$$,
  '42501',null,'platform support cannot author arbitrary school audit rows'
);
reset role;

select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000002',true);
select is(app_private.has_school_membership_scope('22222222-2222-4222-8222-222222222222'),true,'platform admin retains cross-school identity/authoring scope');
set local role authenticated;
select is((select count(*)::integer from public.school_memberships where id='fe300000-0000-4000-8000-000000000001'),1,'platform admin can still inspect school membership relationships');
select is((select count(*)::integer from public.staff_members where id='fe100000-0000-4000-8000-000000000001'),1,'platform admin can still inspect governed raw staff identities');
reset role;

select * from finish();
rollback;
