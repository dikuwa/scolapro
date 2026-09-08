begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fd770000-0000-4000-8000-000000000001','ltsm-return-finality@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd770000-0000-4000-8000-000000000001','librarian',current_date);

insert into public.learning_resource_titles(id,tenant_id,school_id,resource_type,title,status)
values('fd780000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','library_book','Return Finality Book','active');

insert into public.learning_resource_copies(id,tenant_id,school_id,title_id,barcode,condition,availability)
values('fd790000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd780000-0000-4000-8000-000000000001','LTSM-FINAL-001','good','available');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd770000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.issue_learning_resource('fd790000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',null,current_date+14,'issue note')$$,
  'authorized librarian can create governed loan before return-finality checks'
);

select is(
  public.return_learning_resource(
    (select id from public.learning_resource_loans where copy_id='fd790000-0000-4000-8000-000000000001'),
    'good','return note'
  ),
  true,
  'first governed return succeeds'
);

select is(
  public.return_learning_resource(
    (select id from public.learning_resource_loans where copy_id='fd790000-0000-4000-8000-000000000001'),
    'good','return note'
  ),
  true,
  'repeating the same completed return is idempotent'
);

select is(
  (select count(*)::integer from public.audit_events
   where event_type='ltsm.resource.returned'
     and entity_id=(select id from public.learning_resource_loans where copy_id='fd790000-0000-4000-8000-000000000001')),
  1,
  'idempotent retry does not duplicate the durable return audit event'
);

select throws_ok(
  $$select public.return_learning_resource(
    (select id from public.learning_resource_loans where copy_id='fd790000-0000-4000-8000-000000000001'),
    'damaged','return note'
  )$$,
  'Loan is already completed with a different return condition',
  'conflicting repeat return condition is rejected'
);

select throws_ok(
  $$update public.learning_resource_loans
      set status='overdue'
    where copy_id='fd790000-0000-4000-8000-000000000001'$$,
  'Completed learning resource loan status is immutable',
  'completed returned loan cannot be reopened or rewritten to overdue'
);

select ok(
  (select l.status='returned'
          and l.returned_condition='good'
          and c.availability='available'
     from public.learning_resource_loans l
     join public.learning_resource_copies c on c.id=l.copy_id
    where l.copy_id='fd790000-0000-4000-8000-000000000001'),
  'completed loan and copy availability remain consistent after retries and rejected rewrites'
);

select * from finish();
rollback;
