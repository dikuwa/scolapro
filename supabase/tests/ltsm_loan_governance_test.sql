begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fe300000-0000-4000-8000-000000000001','library-governance@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe300000-0000-4000-8000-000000000001','librarian',current_date);

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values
  ('fe310000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','LIB-STAFF-001','Placed','Borrower','active'),
  ('fe310000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','LIB-STAFF-002','Unplaced','Borrower','active');

insert into public.staff_school_assignments(
  tenant_id,school_id,staff_member_id,assignment_type,position_title,effective_from,created_by_user_id
) values(
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe310000-0000-4000-8000-000000000001','teacher','Teacher',current_date,'fe300000-0000-4000-8000-000000000001'
);

insert into public.learning_resource_titles(
  id,tenant_id,school_id,resource_type,title,status
) values(
  'fe320000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','library_book','Governance Test Book','active'
);

insert into public.learning_resource_copies(
  id,tenant_id,school_id,title_id,barcode,condition,availability
) values
  ('fe330000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe320000-0000-4000-8000-000000000001','LIB-GOV-001','good','available'),
  ('fe330000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe320000-0000-4000-8000-000000000001','LIB-GOV-002','good','available');

select set_config('request.jwt.claim.sub','fe300000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$select public.issue_learning_resource('fe330000-0000-4000-8000-000000000001',null,'fe310000-0000-4000-8000-000000000001',current_date+14,'Staff placement borrower')$$,
  'librarian can issue a resource to active school staff before that staff member has a login account'
);

select is(
  (select availability from public.learning_resource_copies where id='fe330000-0000-4000-8000-000000000001'),
  'on_loan',
  'issuing through governed workflow synchronizes copy availability'
);

select is(
  (select staff_member_id from public.learning_resource_loans where copy_id='fe330000-0000-4000-8000-000000000001' and status='open'),
  'fe310000-0000-4000-8000-000000000001'::uuid,
  'loan preserves staff borrower identity independently of Auth account'
);

select throws_ok(
  $$select public.issue_learning_resource('fe330000-0000-4000-8000-000000000002',null,'fe310000-0000-4000-8000-000000000002',current_date+14,null)$$,
  'Staff member is not active at this school',
  'unplaced tenant staff cannot borrow from a school inventory'
);

select throws_ok(
  $$select public.issue_learning_resource('fe330000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001',null,current_date-1,null)$$,
  'Due date cannot be before issue date',
  'issue workflow rejects a due date before the issue date'
);

select ok(
  not has_table_privilege('authenticated','public.learning_resource_loans','INSERT')
  and not has_table_privilege('authenticated','public.learning_resource_loans','UPDATE')
  and not has_table_privilege('authenticated','public.learning_resource_loans','DELETE'),
  'authenticated clients cannot bypass issue/return workflows with direct loan DML'
);

select is(
  public.return_learning_resource(
    (select id from public.learning_resource_loans where copy_id='fe330000-0000-4000-8000-000000000001' and status='open'),
    'good','Returned in good condition'
  ),
  true,
  'librarian can return an open governed loan'
);

select is(
  (select availability from public.learning_resource_copies where id='fe330000-0000-4000-8000-000000000001'),
  'available',
  'return workflow restores copy availability'
);

select is(
  (select count(*)::integer from public.audit_events where event_type in ('ltsm.resource.issued','ltsm.resource.returned') and entity_type='learning_resource_loan'),
  2,
  'issue and return operations preserve durable audit events'
);

select * from finish();
rollback;