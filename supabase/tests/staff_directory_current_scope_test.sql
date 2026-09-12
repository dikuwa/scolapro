begin;

select plan(14);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('aa000000-0000-4000-8000-000000000001','staff-scope-viewer@example.test','authenticated','authenticated',now(),now()),
  ('aa000000-0000-4000-8000-000000000002','staff-scope-current@example.test','authenticated','authenticated',now(),now()),
  ('aa000000-0000-4000-8000-000000000003','staff-scope-stale@example.test','authenticated','authenticated',now(),now()),
  ('aa000000-0000-4000-8000-000000000004','staff-scope-fallback@example.test','authenticated','authenticated',now(),now()),
  ('aa000000-0000-4000-8000-000000000005','staff-scope-support@example.test','authenticated','authenticated',now(),now()),
  ('aa000000-0000-4000-8000-000000000006','staff-scope-old-target@example.test','authenticated','authenticated',now(),now());

set local session_replication_role = replica;

insert into public.schools(id,tenant_id,name,emis_number,region,town,status) values
  ('aa100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Staff Scope Old School','STAFF-OLD','Erongo','Swakopmund','active'),
  ('aa100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Staff Scope Current School','STAFF-CURRENT','Erongo','Swakopmund','active');

insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from,active_to) values
  ('aa110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','aa100000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001',null,'school_admin',current_date-30,null),
  ('aa110000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','aa100000-0000-4000-8000-000000000002','aa000000-0000-4000-8000-000000000001',null,'school_admin',current_date-5,null);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('aa120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','aa000000-0000-4000-8000-000000000002','STAFF-CUR-1','Current','Staff','active'),
  ('aa120000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','aa000000-0000-4000-8000-000000000003','STAFF-STALE-1','Stale','Staff','active'),
  ('aa120000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','aa000000-0000-4000-8000-000000000004','STAFF-FALLBACK-1','Fallback','Staff','active'),
  ('aa120000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','aa000000-0000-4000-8000-000000000006','STAFF-OLD-1','Old','School','active'),
  ('aa120000-0000-4000-8000-000000000005','33333333-3333-4333-8333-333333333333',null,'STAFF-XTENANT-1','Other','Tenant','active');

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id) values
  ('aa130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','aa100000-0000-4000-8000-000000000002','aa120000-0000-4000-8000-000000000001','teacher',current_date-20,null,'aa000000-0000-4000-8000-000000000001'),
  ('aa130000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','aa100000-0000-4000-8000-000000000002','aa120000-0000-4000-8000-000000000002','teacher',current_date-20,current_date-1,'aa000000-0000-4000-8000-000000000001'),
  ('aa130000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','aa100000-0000-4000-8000-000000000001','aa120000-0000-4000-8000-000000000004','teacher',current_date-20,null,'aa000000-0000-4000-8000-000000000001');

insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from,active_to) values
  ('aa140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','aa100000-0000-4000-8000-000000000002','aa000000-0000-4000-8000-000000000002','aa120000-0000-4000-8000-000000000001','teacher',current_date-20,null),
  ('aa140000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','aa100000-0000-4000-8000-000000000002','aa000000-0000-4000-8000-000000000003','aa120000-0000-4000-8000-000000000002','teacher',current_date-20,null),
  ('aa140000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','aa100000-0000-4000-8000-000000000002','aa000000-0000-4000-8000-000000000004','aa120000-0000-4000-8000-000000000003','teacher',current_date-20,null),
  ('aa140000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','aa100000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000006','aa120000-0000-4000-8000-000000000004','teacher',current_date-20,null);

insert into public.platform_memberships(user_id,role_key,active_from)
values('aa000000-0000-4000-8000-000000000005','platform_support',current_date-10);

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000001',true);

select throws_ok(
  $$select * from public.list_staff_directory_page('aa100000-0000-4000-8000-000000000001',null,1,50)$$,
  'Permission denied',
  'older active non-current school cannot expose staff directory'
);

select lives_ok(
  $$select * from public.list_staff_directory_page('aa100000-0000-4000-8000-000000000002',null,1,50)$$,
  'current school staff directory remains available'
);

select is(
  (select count(*)::integer from public.staff_members where id='aa120000-0000-4000-8000-000000000004'),
  0,
  'older active non-current school cannot expose raw staff identity'
);

select is(
  (select count(*)::integer from public.staff_members where id='aa120000-0000-4000-8000-000000000001'),
  1,
  'current governed placement exposes raw staff identity in current school'
);

select is(
  (select count(*)::integer from public.staff_members where id='aa120000-0000-4000-8000-000000000002'),
  0,
  'ended authoritative placement defeats stale linked membership for raw identity'
);

select is(
  (select active_to from public.list_staff_directory_page('aa100000-0000-4000-8000-000000000002','STAFF-STALE-1',1,50)),
  current_date-1,
  'directory preserves historical staff row but authoritative placement end controls operational period'
);

select is(
  (select active_staff::integer from public.get_staff_directory_summary('aa100000-0000-4000-8000-000000000002',current_date)),
  3,
  'directory summary does not keep ended authoritative placement active through stale membership'
);

select is(
  (select count(*)::integer from public.staff_members where id='aa120000-0000-4000-8000-000000000003'),
  1,
  'legacy membership fallback remains valid when no staff assignment history exists'
);

select is(
  (select count(*)::integer from public.staff_school_assignments where school_id='aa100000-0000-4000-8000-000000000001'),
  0,
  'non-current school assignment ledger is not readable through older active membership'
);

select is(
  (select count(*)::integer from public.staff_school_assignments where id='aa130000-0000-4000-8000-000000000002'),
  1,
  'historical placement provenance remains readable in current school'
);

select is(
  (select count(*)::integer from public.school_memberships where id='aa140000-0000-4000-8000-000000000004'),
  0,
  'non-current school membership roster cannot expose another staff identity relationship'
);

select is(
  (select count(*)::integer from public.school_memberships where id in ('aa110000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000002')),
  2,
  'caller can still read own membership history for deterministic current-school context'
);

select is(
  (select count(*)::integer from public.staff_members where id='aa120000-0000-4000-8000-000000000005'),
  0,
  'cross-tenant staff identity remains denied'
);

select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000005',true);
select throws_ok(
  $$select * from public.list_staff_directory_page('aa100000-0000-4000-8000-000000000002',null,1,50)$$,
  'Permission denied',
  'Platform Support cannot enumerate school staff directory identities'
);

reset role;
select * from finish();
rollback;
