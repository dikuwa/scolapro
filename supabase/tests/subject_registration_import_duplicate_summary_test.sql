begin;

select plan(6);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fcb00000-0000-4000-8000-000000000001','subject-import-dupe@example.test','authenticated','authenticated',now(),now());
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fcb00000-0000-4000-8000-000000000001','school_admin',current_date-5);
insert into public.school_learner_identifiers(tenant_id,school_id,learner_id,admission_number,source)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','DUP-001','imported');
insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values('fcb10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','DUPSUB','Duplicate Summary Subject','active');
insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
values('fcb20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fcb10000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fcb00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok($$select public.create_import_batch('22222222-2222-4222-8222-222222222222','subject_registrations','subject-dupe.csv',null)$$,'duplicate-check batch can be created');
select is(public.stage_import_rows(
  (select id from public.import_batches where source_file_name='subject-dupe.csv'),
  '[{"row_number":1,"normalized":{"admission_number":"DUP-001","academic_year":2026,"subject_code":"DUPSUB","action":"register"}},{"row_number":2,"normalized":{"admission_number":"DUP-001","academic_year":2026,"subject_code":"DUPSUB","action":"register"}}]'::jsonb
),2,'duplicate learner-subject rows can be staged for reconciliation review');

create temporary table dupe_summary on commit drop as
select public.reconcile_subject_registration_import_batch(
  (select id from public.import_batches where source_file_name='subject-dupe.csv')
) data;

select is((select (data->>'register')::integer from dupe_summary),0,'returned register count excludes rows converted to duplicate errors');
select is((select (data->>'error')::integer from dupe_summary),2,'returned error count includes both duplicate rows');
select is((select error_rows from public.import_batches where source_file_name='subject-dupe.csv'),2,'persisted batch error count matches returned duplicate error count');
select is((select count(*)::integer from public.import_rows r join public.import_batches b on b.id=r.batch_id where b.source_file_name='subject-dupe.csv' and r.resolution='error'),2,'both duplicate rows persist as errors');

reset role;
select * from finish();
rollback;
