begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fdb00000-0000-4000-8000-000000000001','batch-export-requester@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fdb00000-0000-4000-8000-000000000001',
  'school_admin',
  current_date-1
);

insert into public.report_card_batches(
  id,tenant_id,school_id,academic_year,term_number,scope_type,scope_label,operation,status,
  total_items,processed_items,completed_items,created_by_user_id,export_status
) values
(
  'fdb10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  2026,1,'school','System audit completion','pdf','completed',1,1,1,'fdb00000-0000-4000-8000-000000000001','processing'
),
(
  'fdb10000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  2026,1,'school','System audit failure','pdf','completed',1,1,1,'fdb00000-0000-4000-8000-000000000001','processing'
);

set local role service_role;
select ok(
  public.complete_report_card_batch_export(
    'fdb10000-0000-4000-8000-000000000001','report-card-artifacts','combined/final.pdf',repeat('a',64),3
  ),
  'service worker can complete a processing combined export'
);
select ok(
  public.fail_report_card_batch_export(
    'fdb10000-0000-4000-8000-000000000002','renderer unavailable'
  ),
  'service worker can record a combined export failure'
);
reset role;

select is(
  (select actor_user_id from public.audit_events
   where event_type='report_card.batch.export.ready'
     and entity_id='fdb10000-0000-4000-8000-000000000001'),
  null::uuid,
  'worker completion audit does not impersonate the requesting administrator'
);

select is(
  (select metadata->>'requested_by_user_id' from public.audit_events
   where event_type='report_card.batch.export.ready'
     and entity_id='fdb10000-0000-4000-8000-000000000001'),
  'fdb00000-0000-4000-8000-000000000001',
  'worker completion audit preserves requester identity as metadata'
);

select is(
  (select actor_user_id from public.audit_events
   where event_type='report_card.batch.export.failed'
     and entity_id='fdb10000-0000-4000-8000-000000000002'),
  null::uuid,
  'worker failure audit does not impersonate the requesting administrator'
);

select is(
  (select metadata->>'requested_by_user_id' from public.audit_events
   where event_type='report_card.batch.export.failed'
     and entity_id='fdb10000-0000-4000-8000-000000000002'),
  'fdb00000-0000-4000-8000-000000000001',
  'worker failure audit preserves requester identity as metadata'
);

select is(
  (select export_status from public.report_card_batches where id='fdb10000-0000-4000-8000-000000000002'),
  'failed',
  'failure provenance change preserves canonical export lifecycle state'
);

select * from finish();
rollback;
