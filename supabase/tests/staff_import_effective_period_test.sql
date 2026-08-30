begin;

select plan(13);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fa000000-0000-4000-8000-000000000001','staff-period-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa000000-0000-4000-8000-000000000001','school_admin','2026-01-01');

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values
  ('fa100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','PERIOD-RENEW-001','Renew','Teacher','active'),
  ('fa100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','PERIOD-FUTURE-001','Future','Teacher','active'),
  ('fa100000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','PERIOD-COVERED-001','Covered','Teacher','active'),
  ('fa100000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','PERIOD-BADDATE-001','BadDate','Teacher','active');

select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$select public.assign_staff_to_school('22222222-2222-4222-8222-222222222222','fa100000-0000-4000-8000-000000000001','teacher','Science Teacher','2026-01-01','2026-06-30')$$,
  'fixture may create a closed historical assignment'
);
select lives_ok(
  $$select public.assign_staff_to_school('22222222-2222-4222-8222-222222222222','fa100000-0000-4000-8000-000000000002','teacher','Future Teacher','2026-10-01',null)$$,
  'fixture may create a later future assignment'
);
select lives_ok(
  $$select public.assign_staff_to_school('22222222-2222-4222-8222-222222222222','fa100000-0000-4000-8000-000000000003','teacher','Covered Teacher','2026-01-01','2026-12-31')$$,
  'fixture may create an assignment covering the imported start date'
);

-- A closed historical placement must not make a later import look like an
-- idempotent current assignment.
insert into public.import_batches(id,tenant_id,school_id,import_type,source_file_name,status,created_by_user_id)
values('fa200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','staff','staff-renewal.csv','review','fa000000-0000-4000-8000-000000000001');

insert into public.import_rows(id,batch_id,tenant_id,school_id,row_number,source_data,normalized_data,resolution,issues)
values(
  'fa300000-0000-4000-8000-000000000001',
  'fa200000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2,
  '{}',
  jsonb_build_object('employee_number','period-renew-001','first_name','Renew','last_name','Teacher','assignment_type','teacher','position_title','Senior Science Teacher','effective_from','2026-07-01'),
  'review',
  '[]'
);

select public.reconcile_staff_import_batch('fa200000-0000-4000-8000-000000000001');

select is(
  (select resolution from public.import_rows where id='fa300000-0000-4000-8000-000000000001'),
  'link',
  'staff import after a closed historical placement resolves to a new non-overlapping school link'
);
select is(public.mark_import_batch_ready('fa200000-0000-4000-8000-000000000001'),true,'non-overlapping renewal batch can be marked ready');
select lives_ok(
  $$select public.commit_staff_import_batch('fa200000-0000-4000-8000-000000000001')$$,
  'non-overlapping renewal commits without an assignment-overlap trigger failure'
);
select is(
  (select count(*)::integer from public.staff_school_assignments where school_id='22222222-2222-4222-8222-222222222222' and staff_member_id='fa100000-0000-4000-8000-000000000001'),
  2,
  'renewal preserves historical placement and creates the later assignment'
);

-- Mixed review batch proves reconciliation uses each imported effective date.
insert into public.import_batches(id,tenant_id,school_id,import_type,source_file_name,status,created_by_user_id)
values('fa200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','staff','staff-period-review.csv','review','fa000000-0000-4000-8000-000000000001');

insert into public.import_rows(id,batch_id,tenant_id,school_id,row_number,source_data,normalized_data,resolution,issues)
values
  ('fa300000-0000-4000-8000-000000000002','fa200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2,'{}',jsonb_build_object('employee_number','PERIOD-FUTURE-001','first_name','Future','last_name','Teacher','assignment_type','teacher','position_title','Future Teacher','effective_from','2026-09-01'),'review','[]'),
  ('fa300000-0000-4000-8000-000000000003','fa200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',3,'{}',jsonb_build_object('employee_number','PERIOD-COVERED-001','first_name','Covered','last_name','Teacher','assignment_type','teacher','position_title','Covered Teacher','effective_from','2026-08-01'),'review','[]'),
  ('fa300000-0000-4000-8000-000000000004','fa200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',4,'{}',jsonb_build_object('employee_number','PERIOD-BADDATE-001','first_name','BadDate','last_name','Teacher','assignment_type','teacher','position_title','Bad Date Teacher','effective_from','not-a-date'),'review','[]');

select public.reconcile_staff_import_batch('fa200000-0000-4000-8000-000000000002');

select is(
  (select resolution from public.import_rows where id='fa300000-0000-4000-8000-000000000002'),
  'review',
  'open-ended import that would collide with a later school assignment requires human review'
);
select ok(
  exists(
    select 1 from public.import_rows r, jsonb_array_elements(r.issues) issue
    where r.id='fa300000-0000-4000-8000-000000000002'
      and issue->>'code'='assignment_period_conflict'
      and issue->>'field'='effective_from'
  ),
  'future assignment collision carries an explicit assignment-period conflict issue'
);
select is(
  (select resolution from public.import_rows where id='fa300000-0000-4000-8000-000000000003'),
  'skip',
  'existing assignment covering the imported effective date is treated as idempotent school membership'
);
select is(
  (select resolution from public.import_rows where id='fa300000-0000-4000-8000-000000000004'),
  'error',
  'invalid imported effective date is rejected during reconciliation instead of failing late during commit'
);
select ok(
  exists(
    select 1 from public.import_rows r, jsonb_array_elements(r.issues) issue
    where r.id='fa300000-0000-4000-8000-000000000004'
      and issue->>'code'='invalid_effective_from'
  ),
  'invalid effective date records a structured reconciliation error'
);
select throws_ok(
  $$select public.mark_import_batch_ready('fa200000-0000-4000-8000-000000000002')$$,
  'Resolve review/error rows before committing',
  'period-conflict and invalid-date rows block staff batch readiness'
);

select * from finish();
rollback;
