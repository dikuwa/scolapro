begin;

select plan(31);

select has_table('public','staff_leave_types','staff leave types table exists');
select has_table('public','staff_leave_requests','staff leave requests table exists');
select has_table('public','staff_leave_ledger_entries','staff leave ledger table exists');
select has_table('public','staff_absences','staff operational absences table exists');
select has_table('public','staff_leave_request_attachments','staff leave attachment registry exists');

select has_function(
  'public','configure_staff_leave_type',
  array['uuid','text','text','boolean','text','text','boolean'],
  'leave type governance RPC exists'
);
select has_function(
  'public','submit_staff_leave_request',
  array['uuid','uuid','date','date','numeric','text'],
  'staff leave submission RPC exists'
);
select has_function(
  'public','decide_staff_leave_request',
  array['uuid','text','numeric','text'],
  'staff leave decision RPC exists'
);
select has_function(
  'public','cancel_staff_leave_request',
  array['uuid','text'],
  'staff leave cancellation RPC exists'
);
select has_function(
  'public','post_staff_leave_ledger_entry',
  array['uuid','uuid','uuid','text','numeric','date','text','text'],
  'staff leave ledger RPC exists'
);
select has_function(
  'public','list_staff_leave_workspace',
  array['uuid','date'],
  'staff leave workspace read model exists'
);
select has_function(
  'public','register_staff_leave_attachment',
  array['uuid','text','text','text','bigint'],
  'private leave evidence registration RPC exists'
);

select is(
  has_function_privilege(
    'anon',
    'public.submit_staff_leave_request(uuid,uuid,date,date,numeric,text)',
    'EXECUTE'
  ),
  false,
  'anonymous callers cannot submit staff leave'
);

insert into public.tenants(id,name,slug)
values(
  'fd000000-0000-4000-8000-000000000001',
  'Staff Leave Test Tenant',
  'staff-leave-test'
);

insert into public.schools(
  id,tenant_id,name,emis_number,region,town,status
) values(
  'fd010000-0000-4000-8000-000000000001',
  'fd000000-0000-4000-8000-000000000001',
  'Staff Leave Test School',
  'LEAVE-001',
  'Erongo',
  'Swakopmund',
  'active'
);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fd020000-0000-4000-8000-000000000001','leave-manager@example.test','authenticated','authenticated',now(),now()),
  ('fd020000-0000-4000-8000-000000000002','leave-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(
  id,tenant_id,user_id,employee_number,first_name,last_name,status
) values
  (
    'fd030000-0000-4000-8000-000000000001',
    'fd000000-0000-4000-8000-000000000001',
    'fd020000-0000-4000-8000-000000000001',
    'LEAVE-MGR','Leave','Manager','active'
  ),
  (
    'fd030000-0000-4000-8000-000000000002',
    'fd000000-0000-4000-8000-000000000001',
    'fd020000-0000-4000-8000-000000000002',
    'LEAVE-TCH','Leave','Teacher','active'
  );

insert into public.school_memberships(
  id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from
) values
  (
    'fd040000-0000-4000-8000-000000000001',
    'fd000000-0000-4000-8000-000000000001',
    'fd010000-0000-4000-8000-000000000001',
    'fd020000-0000-4000-8000-000000000001',
    'fd030000-0000-4000-8000-000000000001',
    'school_admin',
    current_date-30
  ),
  (
    'fd040000-0000-4000-8000-000000000002',
    'fd000000-0000-4000-8000-000000000001',
    'fd010000-0000-4000-8000-000000000001',
    'fd020000-0000-4000-8000-000000000002',
    'fd030000-0000-4000-8000-000000000002',
    'teacher',
    current_date-30
  );

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,
  created_by_user_id
) values
  (
    'fd050000-0000-4000-8000-000000000001',
    'fd000000-0000-4000-8000-000000000001',
    'fd010000-0000-4000-8000-000000000001',
    'fd030000-0000-4000-8000-000000000001',
    'management',
    current_date-30,
    'fd020000-0000-4000-8000-000000000001'
  ),
  (
    'fd050000-0000-4000-8000-000000000002',
    'fd000000-0000-4000-8000-000000000001',
    'fd010000-0000-4000-8000-000000000001',
    'fd030000-0000-4000-8000-000000000002',
    'teacher',
    current_date-30,
    'fd020000-0000-4000-8000-000000000001'
  );

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd020000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.configure_staff_leave_type(
      'fd010000-0000-4000-8000-000000000001',
      'LOCAL-TRACKED',
      'Locally Configured Tracked Leave',
      true,
      'optional',
      'School-approved leave rule reference',
      true
  )$$,
  'school manager can configure an explicitly sourced leave type'
);

reset role;

select set_config('request.jwt.claim.sub','fd020000-0000-4000-8000-000000000002',true);
set local role authenticated;

select lives_ok(
  $$select public.submit_staff_leave_request(
      'fd010000-0000-4000-8000-000000000001',
      (select id from public.staff_leave_types
       where school_id='fd010000-0000-4000-8000-000000000001'
         and code='LOCAL-TRACKED'),
      current_date+10,
      current_date+14,
      5,
      'Planned leave'
  )$$,
  'staff-linked school member can submit own leave request'
);

select is(
  (
    select count(*)::integer
    from public.list_staff_leave_workspace(
      'fd010000-0000-4000-8000-000000000001',
      current_date
    )
  ),
  1,
  'ordinary staff workspace is limited to own leave'
);

select throws_ok(
  $$select public.configure_staff_leave_type(
      'fd010000-0000-4000-8000-000000000001',
      'TEACHER-TYPE',
      'Teacher-created type',
      false,
      'optional',
      null,
      true
  )$$,
  'Permission denied',
  'ordinary staff cannot configure school leave policy'
);

reset role;

select set_config('request.jwt.claim.sub','fd020000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.post_staff_leave_ledger_entry(
      'fd010000-0000-4000-8000-000000000001',
      'fd030000-0000-4000-8000-000000000002',
      (select id from public.staff_leave_types
       where school_id='fd010000-0000-4000-8000-000000000001'
         and code='LOCAL-TRACKED'),
      'opening',
      10,
      current_date,
      'Opening value established from verified school record',
      'Verified school leave record'
  )$$,
  'manager can post sourced opening ledger entry without writing a balance field'
);

select lives_ok(
  $$select public.decide_staff_leave_request(
      (select id from public.staff_leave_requests
       where staff_member_id='fd030000-0000-4000-8000-000000000002'),
      'approve',
      5,
      'Approved after review'
  )$$,
  'manager can approve another staff member leave request'
);

select is(
  (
    select count(*)::integer
    from public.staff_leave_ledger_entries
    where staff_member_id='fd030000-0000-4000-8000-000000000002'
  ),
  2,
  'approval adds a debit instead of mutating a stored balance'
);

select is(
  (
    select balance_units
    from public.list_staff_leave_workspace(
      'fd010000-0000-4000-8000-000000000001',
      current_date+20
    )
    where staff_member_id='fd030000-0000-4000-8000-000000000002'
  ),
  5::numeric,
  'current balance is ledger-derived'
);

select is(
  (
    select status
    from public.staff_absences
    where staff_member_id='fd030000-0000-4000-8000-000000000002'
  ),
  'active',
  'approved leave creates a separate operational staff absence'
);

select is(
  (
    select count(*)::integer
    from public.audit_events
    where event_type='staff.leave_request.approved'
      and entity_id=(
        select id from public.staff_leave_requests
        where staff_member_id='fd030000-0000-4000-8000-000000000002'
      )
  ),
  1,
  'approval is explicitly audited'
);

select lives_ok(
  $$select public.submit_staff_leave_request(
      'fd010000-0000-4000-8000-000000000001',
      (select id from public.staff_leave_types
       where school_id='fd010000-0000-4000-8000-000000000001'
         and code='LOCAL-TRACKED'),
      current_date+30,
      current_date+31,
      2,
      'Manager own request'
  )$$,
  'manager may submit leave for their own staff identity'
);

select throws_ok(
  $$select public.decide_staff_leave_request(
      (select id from public.staff_leave_requests
       where staff_member_id='fd030000-0000-4000-8000-000000000001'),
      'approve',
      2,
      'Self approval'
  )$$,
  'Staff cannot approve or reject their own leave request',
  'request authority and approval authority remain separated'
);

select lives_ok(
  $$select public.cancel_staff_leave_request(
      (select id from public.staff_leave_requests
       where staff_member_id='fd030000-0000-4000-8000-000000000002'),
      'Leave no longer required'
  )$$,
  'approved leave can be cancelled without erasing approval history'
);

select is(
  (
    select sum(units_delta)
    from public.staff_leave_ledger_entries
    where staff_member_id='fd030000-0000-4000-8000-000000000002'
      and leave_type_id=(
        select id from public.staff_leave_types
        where school_id='fd010000-0000-4000-8000-000000000001'
          and code='LOCAL-TRACKED'
      )
  ),
  10::numeric,
  'cancellation reverses the leave debit through a new immutable ledger entry'
);

select is(
  (
    select status
    from public.staff_absences
    where staff_member_id='fd030000-0000-4000-8000-000000000002'
  ),
  'cancelled',
  'cancellation ends operational absence without deleting it'
);

select throws_ok(
  $$update public.staff_leave_ledger_entries
    set units_delta=999
    where staff_member_id='fd030000-0000-4000-8000-000000000002'
      and entry_kind='opening'$$,
  'Staff leave ledger entries are immutable',
  'historical ledger entries cannot be rewritten'
);

select is(
  (
    select count(*)::integer
    from public.list_staff_leave_workspace(
      'fd010000-0000-4000-8000-000000000001',
      current_date
    )
  ),
  2,
  'school manager workspace includes school-wide requests'
);

select is(
  has_table_privilege(
    'authenticated',
    'public.staff_leave_requests',
    'INSERT'
  ),
  false,
  'authenticated clients cannot bypass request RPC with direct inserts'
);

select is(
  has_table_privilege(
    'authenticated',
    'public.staff_leave_ledger_entries',
    'UPDATE'
  ),
  false,
  'authenticated clients cannot mutate ledger rows directly'
);

select is(
  (
    select count(*)::integer
    from storage.buckets
    where id='staff-leave-evidence' and public=false
  ),
  1,
  'staff leave evidence bucket is private'
);

select * from finish();
rollback;
