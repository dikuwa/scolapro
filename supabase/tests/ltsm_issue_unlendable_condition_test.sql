begin;
select plan(13);

-- Fixed synthetic school only; pgtap rolls all changes back.
insert into auth.users(id,email,aud,role,created_at,updated_at)
values('f3200000-0000-4000-8000-000000000001','ltsm-issue-condition@example.test',
'authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111',
'22222222-2222-4222-8222-222222222222',
'f3200000-0000-4000-8000-000000000001','librarian',current_date);

insert into public.learning_resource_titles(id,tenant_id,school_id,resource_type,title,status)
values('f3210000-0000-4000-8000-000000000001',
'11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
'library_book','Synthetic Issue Integrity Book','active');

-- Simulates imported/stale availability flags; physical condition still governs.
insert into public.learning_resource_copies(
id,tenant_id,school_id,title_id,barcode,condition,availability
) values
('f3220000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
 'f3210000-0000-4000-8000-000000000001','ISSUE-1320-DAMAGED','damaged','available'),
('f3220000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
 'f3210000-0000-4000-8000-000000000001','ISSUE-1320-LOST','lost','available'),
('f3220000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
 'f3210000-0000-4000-8000-000000000001','ISSUE-1320-GOOD','good','available'),
('f3220000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
 'f3210000-0000-4000-8000-000000000001','ISSUE-1320-BULK-GOOD','good','available');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f3200000-0000-4000-8000-000000000001',true);

select throws_ok(
 $$select public.issue_learning_resource('f3220000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000001',null,current_date+14,null)$$,
 'Damaged or lost resource copy cannot be issued',
 'damaged copy with misleading available flag is not lendable'
);
select throws_ok(
 $$select public.issue_learning_resource('f3220000-0000-4000-8000-000000000002',
 '50000000-0000-4000-8000-000000000001',null,current_date+14,null)$$,
 'Damaged or lost resource copy cannot be issued',
 'lost copy with misleading available flag is not lendable'
);
select throws_ok(
 $$select public.bulk_issue_learning_resources(
 '[{"copy_id":"f3220000-0000-4000-8000-000000000004","learner_id":"50000000-0000-4000-8000-000000000002"},
 {"copy_id":"f3220000-0000-4000-8000-000000000001","learner_id":"50000000-0000-4000-8000-000000000001"}]'::jsonb,current_date+14,null)$,
 'Damaged or lost resource copy cannot be issued',
 'class bulk issue rolls back an earlier valid issue when a later damaged copy is rejected'
);
select is(
 (select count(*)::integer from public.learning_resource_loans
  where copy_id='f3220000-0000-4000-8000-000000000004'),0,
 'failed second bulk item rolls back the earlier good loan'
);
select is(
 (select availability from public.learning_resource_copies
  where id='f3220000-0000-4000-8000-000000000004'),'available',
 'failed bulk batch restores availability of the earlier good copy'
);
select is(
 (select count(*)::integer from public.audit_events
  where event_type='ltsm.resource.issued'
    and metadata->>'copy_id' in ('f3220000-0000-4000-8000-000000000004',
                                 'f3220000-0000-4000-8000-000000000001')),0,
 'failed bulk batch rolls back audit for earlier good and damaged copies'
);
select throws_ok(
 $$select public.issue_learning_resource_idempotent(
 'f3230000-0000-4000-8000-000000000001',
 'f3220000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000001',null,current_date+14,null)$$,
 'Damaged or lost resource copy cannot be issued',
 'offline idempotent issue delegates to canonical condition gate'
);
select is(
 (select count(*)::integer from public.learning_resource_loans
  where copy_id in ('f3220000-0000-4000-8000-000000000001','f3220000-0000-4000-8000-000000000002')),0,
 'rejected issues cannot create loans'
);
select is(
 (select count(*)::integer from public.audit_events
  where event_type='ltsm.resource.issued'
    and entity_id in (select id from public.learning_resource_loans
      where copy_id in ('f3220000-0000-4000-8000-000000000001','f3220000-0000-4000-8000-000000000002'))),0,
 'rejected issues cannot create durable issue audit'
);
select is(
 (select count(*)::integer from public.client_operation_receipts
  where client_operation_id='f3230000-0000-4000-8000-000000000001'),0,
 'failed offline issue rolls back operation receipt'
);
select lives_ok(
 $$select public.issue_learning_resource('f3220000-0000-4000-8000-000000000003',
 '50000000-0000-4000-8000-000000000001',null,current_date+14,null)$$,
 'good available copy remains lendable'
);
select is(
 (select availability from public.learning_resource_copies where id='f3220000-0000-4000-8000-000000000003'),
 'on_loan','successful issue updates good copy availability'
);
select is(
 (select count(*)::integer from public.learning_resource_loans
  where copy_id='f3220000-0000-4000-8000-000000000003'),1,
 'one good copy issue creates precisely one loan'
);

select * from finish();
rollback;
