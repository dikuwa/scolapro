begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('f9000000-0000-4000-8000-000000000001','staff-import-idempotency@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9000000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values('f9100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','EMP-IDEMP-001','Ada','Teacher','active');

select set_config('request.jwt.claim.sub','f9000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$select public.assign_staff_to_school('22222222-2222-4222-8222-222222222222','f9100000-0000-4000-8000-000000000001','teacher','Mathematics Teacher',current_date,null)$$,
  'fixture staff identity can be assigned to the school'
);

insert into public.import_batches(id,tenant_id,school_id,import_type,source_file_name,status,created_by_user_id)
values('f9200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','staff','staff-idempotent.csv','review','f9000000-0000-4000-8000-000000000001');

insert into public.import_rows(id,batch_id,tenant_id,school_id,row_number,source_data,normalized_data,resolution,issues)
values(
  'f9300000-0000-4000-8000-000000000001',
  'f9200000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2,
  '{}',
  jsonb_build_object('employee_number','EMP-IDEMP-001','first_name','Ada','last_name','Teacher','assignment_type','teacher','position_title','Mathematics Teacher','effective_from',current_date::text),
  'review',
  '[]'
);

select public.reconcile_staff_import_batch('f9200000-0000-4000-8000-000000000001');

select is(
  (select resolution from public.import_rows where id='f9300000-0000-4000-8000-000000000001'),
  'skip',
  'repeat import of an already assigned exact staff identity resolves to skip'
);

select is(public.mark_import_batch_ready('f9200000-0000-4000-8000-000000000001'),true,'idempotent skip-only staff batch can be marked ready');

select lives_ok(
  $$select public.commit_staff_import_batch('f9200000-0000-4000-8000-000000000001')$$,
  'idempotent skip-only staff batch commits successfully'
);

select is(
  (select count(*)::integer from public.staff_members where tenant_id='11111111-1111-4111-8111-111111111111' and upper(employee_number)='EMP-IDEMP-001'),
  1,
  'repeat import does not create a duplicate staff identity'
);

select is(
  (select count(*)::integer from public.staff_school_assignments where school_id='22222222-2222-4222-8222-222222222222' and staff_member_id='f9100000-0000-4000-8000-000000000001'),
  1,
  'repeat import does not create a duplicate school assignment'
);

select is(
  (select outcome from public.import_commit_results where import_row_id='f9300000-0000-4000-8000-000000000001'),
  'skipped',
  'idempotent repeat is recorded explicitly as a skipped import result'
);

select * from finish();
rollback;
