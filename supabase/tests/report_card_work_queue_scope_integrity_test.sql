begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('f1900000-0000-4000-8000-000000000001','report-card-queue@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug)
values('f1910000-0000-4000-8000-000000000001','Report Queue Tenant B','report-queue-tenant-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('f1920000-0000-4000-8000-000000000001','f1910000-0000-4000-8000-000000000001','Report Queue School B','REPORT-QUEUE-B','Khomas','Windhoek');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f1900000-0000-4000-8000-000000000001','school_admin',current_date-1);

select throws_ok(
  $$insert into public.report_card_batches(tenant_id,school_id,academic_year,term_number,scope_type,scope_label,operation,created_by_user_id)
    values('f1910000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',2026,1,'school','Bad batch','generate','f1900000-0000-4000-8000-000000000001')$$,
  'Report-card batch scope mismatch: school does not belong to tenant',
  'report-card batch tenant must match school tenant'
);

select lives_ok(
  $$insert into public.report_card_batches(id,tenant_id,school_id,academic_year,term_number,scope_type,scope_label,operation,created_by_user_id)
    values('f1930000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,1,'school','Valid batch','generate','f1900000-0000-4000-8000-000000000001')$$,
  'valid report-card batch remains allowed'
);

select throws_ok(
  $$insert into public.report_card_batch_items(batch_id,tenant_id,school_id,enrolment_id,learner_id)
    values('f1930000-0000-4000-8000-000000000001','f1910000-0000-4000-8000-000000000001','f1920000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001')$$,
  'Report-card batch item scope mismatch: batch does not match item scope',
  'batch item must inherit batch tenant and school'
);

select lives_ok(
  $$insert into public.report_card_batch_items(id,batch_id,tenant_id,school_id,enrolment_id,learner_id)
    values('f1940000-0000-4000-8000-000000000001','f1930000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001')$$,
  'valid batch item remains allowed'
);

select throws_ok(
  $$update public.report_card_batches set school_id='f1920000-0000-4000-8000-000000000001', tenant_id='f1910000-0000-4000-8000-000000000001' where id='f1930000-0000-4000-8000-000000000001'$$,
  'Report-card batch scope and creation provenance are immutable',
  'batch scope cannot be rewritten after creation'
);

select throws_ok(
  $$update public.report_card_batch_items set learner_id='50000000-0000-4000-8000-000000000002' where id='f1940000-0000-4000-8000-000000000001'$$,
  'Report-card batch item batch, scope, learner, and enrolment are immutable',
  'batch item learner identity cannot be rewritten'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_report_card_batch_scope_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_report_card_batch_item_scope_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_report_card_render_job_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_report_card_batch_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_report_card_batch_item_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_report_card_render_job_scope_integrity()','EXECUTE'),
  'report-card work queue integrity helpers are private from client roles'
);

select is(
  (select count(*)::integer from pg_trigger where tgname in ('report_card_batch_scope_integrity_trg','report_card_batch_item_scope_integrity_trg','report_card_render_job_scope_integrity_trg') and not tgisinternal),
  3,
  'report-card work queue has all three integrity triggers'
);

select * from finish();
rollback;