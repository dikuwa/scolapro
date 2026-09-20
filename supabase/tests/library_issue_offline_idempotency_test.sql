begin;

select plan(7);

insert into public.schools(id,tenant_id,name)
values(
  'fb810000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Library Offline Idempotency School'
);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values(
  'fb820000-0000-4000-8000-000000000001',
  'library-offline-idempotency@example.test',
  'authenticated','authenticated',now(),now()
);

insert into public.school_memberships(
  tenant_id,school_id,user_id,role_key,active_from
) values(
  '11111111-1111-4111-8111-111111111111',
  'fb810000-0000-4000-8000-000000000001',
  'fb820000-0000-4000-8000-000000000001',
  'librarian',
  current_date-1
);

insert into public.learners(id,tenant_id,first_names,surname)
values(
  'fb830000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Offline','Borrower'
);

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,status
) values(
  'fb840000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'fb810000-0000-4000-8000-000000000001',
  'fb830000-0000-4000-8000-000000000001',
  2026,
  'LIB-OFF-001',
  current_date-30,
  'current'
);

insert into public.learning_resource_titles(
  id,tenant_id,school_id,resource_type,title,status
) values(
  'fb850000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'fb810000-0000-4000-8000-000000000001',
  'library_book',
  'Offline Idempotency Book',
  'active'
);

insert into public.learning_resource_copies(
  id,tenant_id,school_id,title_id,barcode,condition,availability
) values(
  'fb860000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'fb810000-0000-4000-8000-000000000001',
  'fb850000-0000-4000-8000-000000000001',
  'LIB-OFF-IDEMP-001',
  'good',
  'available'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb820000-0000-4000-8000-000000000001',true);

select lives_ok(
  $sql$select public.issue_learning_resource_idempotent(
    'fb870000-0000-4000-8000-000000000001',
    'fb860000-0000-4000-8000-000000000001',
    'fb830000-0000-4000-8000-000000000001',
    null,
    current_date+14,
    'offline issue'
  )$sql$,
  'first offline library issue succeeds'
);

select is(
  (select count(*)::integer from public.learning_resource_loans where copy_id='fb860000-0000-4000-8000-000000000001'),
  1,
  'first issue creates exactly one loan'
);

select is(
  public.issue_learning_resource_idempotent(
    'fb870000-0000-4000-8000-000000000001',
    'fb860000-0000-4000-8000-000000000001',
    'fb830000-0000-4000-8000-000000000001',
    null,
    current_date+14,
    'offline issue'
  ),
  (select id from public.learning_resource_loans where copy_id='fb860000-0000-4000-8000-000000000001'),
  'same client operation returns the original loan id'
);

select is(
  (select count(*)::integer from public.learning_resource_loans where copy_id='fb860000-0000-4000-8000-000000000001'),
  1,
  'replay does not duplicate the loan'
);

reset role;
select is(
  (select count(*)::integer from public.audit_events
   where event_type='ltsm.resource.issued'
     and entity_id=(select id from public.learning_resource_loans where copy_id='fb860000-0000-4000-8000-000000000001')),
  1,
  'replay does not duplicate the durable issue audit event'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb820000-0000-4000-8000-000000000001',true);

select throws_ok(
  $sql$select public.issue_learning_resource_idempotent(
    'fb870000-0000-4000-8000-000000000001',
    'fb860000-0000-4000-8000-000000000001',
    'fb830000-0000-4000-8000-000000000001',
    null,
    current_date+21,
    'changed offline issue'
  )$sql$,
  'Client operation ID was already used with different library issue data',
  'changed payload cannot reuse an existing client operation id'
);

reset role;
update public.school_memberships
set active_to=current_date-1
where user_id='fb820000-0000-4000-8000-000000000001'
  and school_id='fb810000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb820000-0000-4000-8000-000000000001',true);

select throws_ok(
  $sql$select public.issue_learning_resource_idempotent(
    'fb870000-0000-4000-8000-000000000001',
    'fb860000-0000-4000-8000-000000000001',
    'fb830000-0000-4000-8000-000000000001',
    null,
    current_date+14,
    'offline issue'
  )$sql$,
  'Permission denied',
  'replay revalidates current library authority before returning the receipt'
);

select * from finish();
rollback;
