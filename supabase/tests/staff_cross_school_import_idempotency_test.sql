begin;

select plan(11);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('ff000000-0000-4000-8000-000000000001','staff-cross-school-admin@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status)
values('ff100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Second Import School','TST-CROSS-STAFF-001','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ff000000-0000-4000-8000-000000000001','school_admin',current_date),
  ('11111111-1111-4111-8111-111111111111','ff100000-0000-4000-8000-000000000001','ff000000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values('ff200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','EMP-CROSS-001','Cross','Teacher','active');

select set_config('request.jwt.claim.sub','ff000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$select public.assign_staff_to_school('22222222-2222-4222-8222-222222222222','ff200000-0000-4000-8000-000000000001','teacher','Science Teacher','2026-01-01',null)$$,
  'fixture staff identity can be actively assigned to the first school'
);

insert into public.import_batches(id,tenant_id,school_id,import_type,source_file_name,status,created_by_user_id)
values('ff300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ff100000-0000-4000-8000-000000000001','staff','staff-cross-school.csv','review','ff000000-0000-4000-8000-000000000001');

insert into public.import_rows(id,batch_id,tenant_id,school_id,row_number,source_data,normalized_data,resolution,issues)
values(
  'ff400000-0000-4000-8000-000000000001',
  'ff300000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'ff100000-0000-4000-8000-000000000001',
  2,
  '{}',
  jsonb_build_object('employee_number','emp-cross-001','first_name','Cross','last_name','Teacher','assignment_type','teacher','position_title','Science Teacher','effective_from','2026-01-01'),
  'review',
  '[]'
);

select public.reconcile_staff_import_batch('ff300000-0000-4000-8000-000000000001');

select is(
  (select resolution from public.import_rows where id='ff400000-0000-4000-8000-000000000001'),
  'link',
  'same tenant employee number at another managed school resolves to the existing staff identity plus a new school link'
);

select is(public.mark_import_batch_ready('ff300000-0000-4000-8000-000000000001'),true,'cross-school link batch can be marked ready');

select lives_ok(
  $$select public.commit_staff_import_batch('ff300000-0000-4000-8000-000000000001')$$,
  'cross-school staff link commits successfully'
);

select is(
  (select count(*)::integer from public.staff_members where tenant_id='11111111-1111-4111-8111-111111111111' and upper(employee_number)='EMP-CROSS-001'),
  1,
  'cross-school import reuses the tenant-wide staff identity instead of duplicating it'
);

select is(
  (select count(*)::integer from public.staff_school_assignments where staff_member_id='ff200000-0000-4000-8000-000000000001'),
  2,
  'staff identity retains distinct assignments at both schools'
);

select is(
  (select count(*)::integer from public.staff_school_assignments where staff_member_id='ff200000-0000-4000-8000-000000000001' and school_id='22222222-2222-4222-8222-222222222222'),
  1,
  'original school assignment is preserved unchanged'
);

select is(
  (select count(*)::integer from public.staff_school_assignments where staff_member_id='ff200000-0000-4000-8000-000000000001' and school_id='ff100000-0000-4000-8000-000000000001'),
  1,
  'second school receives exactly one assignment'
);

insert into public.import_batches(id,tenant_id,school_id,import_type,source_file_name,status,created_by_user_id)
values('ff300000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ff100000-0000-4000-8000-000000000001','staff','staff-cross-school-repeat.csv','review','ff000000-0000-4000-8000-000000000001');

insert into public.import_rows(id,batch_id,tenant_id,school_id,row_number,source_data,normalized_data,resolution,issues)
values(
  'ff400000-0000-4000-8000-000000000002',
  'ff300000-0000-4000-8000-000000000002',
  '11111111-1111-4111-8111-111111111111',
  'ff100000-0000-4000-8000-000000000001',
  2,
  '{}',
  jsonb_build_object('employee_number','EMP-CROSS-001','first_name','Cross','last_name','Teacher','assignment_type','teacher','position_title','Science Teacher','effective_from','2026-01-01'),
  'review',
  '[]'
);

select public.reconcile_staff_import_batch('ff300000-0000-4000-8000-000000000002');

select is(
  (select resolution from public.import_rows where id='ff400000-0000-4000-8000-000000000002'),
  'skip',
  'repeating the import at the second school becomes an idempotent skip'
);

select is(public.mark_import_batch_ready('ff300000-0000-4000-8000-000000000002'),true,'repeat cross-school batch can be marked ready');

select lives_ok(
  $$select public.commit_staff_import_batch('ff300000-0000-4000-8000-000000000002')$$,
  'repeat cross-school import commits as a no-duplicate operation'
);

select is(
  (select count(*)::integer from public.staff_school_assignments where staff_member_id='ff200000-0000-4000-8000-000000000001'),
  2,
  'repeat import does not add a third assignment'
);

select * from finish();
rollback;
