begin;

select plan(6);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('f9400000-0000-4000-8000-000000000001','report-hod@example.test','authenticated','authenticated',now(),now()),
('f9400000-0000-4000-8000-000000000002','report-teacher@example.test','authenticated','authenticated',now(),now());
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9400000-0000-4000-8000-000000000001','hod',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9400000-0000-4000-8000-000000000002','teacher',current_date);

select ok(not has_function_privilege('authenticated','public.build_report_card_snapshot_management_internal(uuid,smallint,text)','EXECUTE'),'internal report builder is not directly executable by authenticated clients');
select ok(not has_function_privilege('authenticated','public.build_report_card_snapshots_bulk_management_internal(uuid[],smallint,text)','EXECUTE'),'internal bulk builder is not directly executable by authenticated clients');
select ok(not has_function_privilege('anon','public.build_report_card_snapshot(uuid,smallint,text)','EXECUTE'),'anonymous users cannot generate report cards');

select set_config('request.jwt.claim.sub','f9400000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select throws_ok(
  $$select public.build_report_card_snapshot('60000000-0000-4000-8000-000000000001',1::smallint,'TEST')$$,
  'Report-card generation is restricted to school administration and management',
  'HOD report access is read-only and cannot generate a replacement snapshot'
);

select set_config('request.jwt.claim.sub','f9400000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select public.build_report_card_snapshot('60000000-0000-4000-8000-000000000001',1::smallint,'TEST')$$,
  'Report-card generation is restricted to school administration and management',
  'teacher report access is read-only and cannot generate a replacement snapshot'
);
select throws_ok(
  $$select public.build_report_card_snapshots_bulk(array['60000000-0000-4000-8000-000000000001']::uuid[],1::smallint,'TEST')$$,
  'Bulk report-card generation is restricted to school administration and management',
  'teacher cannot bypass the read-only boundary through bulk generation'
);

select * from finish();
rollback;
