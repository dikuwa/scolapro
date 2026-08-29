begin;

select plan(6);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fa100000-0000-4000-8000-000000000001','staff-scope-school-a@example.test','authenticated','authenticated',now(),now()),
  ('fa100000-0000-4000-8000-000000000002','staff-scope-school-b@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values('fa200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Staff Scope Second School','SCOPE002','Erongo','Walvis Bay','active');

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values
  ('fa300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fa100000-0000-4000-8000-000000000001','SCOPE-A-001','School A','Teacher','active'),
  ('fa300000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fa100000-0000-4000-8000-000000000002','SCOPE-B-001','School B','Teacher','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa100000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000001','teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','fa200000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000000002','fa300000-0000-4000-8000-000000000002','teacher',current_date);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000001',true);

select is((select count(*)::integer from public.staff_members where id='fa300000-0000-4000-8000-000000000001'),1,'school A user can read staff identity linked to the same school');
select is((select count(*)::integer from public.staff_members where id='fa300000-0000-4000-8000-000000000002'),0,'school A user cannot read raw staff identity from another school in the same tenant');
select is((select count(*)::integer from public.staff_members where id in ('fa300000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000002')),1,'tenant membership no longer creates tenant-wide staff visibility');

select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.staff_members where id='fa300000-0000-4000-8000-000000000002'),1,'staff member can read their own identity in their school context');

select ok(not has_table_privilege('authenticated','public.staff_members','INSERT') and not has_table_privilege('authenticated','public.staff_members','UPDATE') and not has_table_privilege('authenticated','public.staff_members','DELETE'),'authenticated clients cannot mutate raw staff identities directly');
select ok(not has_table_privilege('anon','public.staff_members','SELECT') and not has_table_privilege('anon','public.staff_members','INSERT') and not has_table_privilege('anon','public.staff_members','UPDATE') and not has_table_privilege('anon','public.staff_members','DELETE'),'anonymous role has no direct staff identity table privileges');

select * from finish();
rollback;
