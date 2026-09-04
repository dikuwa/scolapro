begin;
select plan(6);

-- Contract-level guards for the report-card template enrichment migration. These
-- checks intentionally focus on durable schema/function presence; detailed seeded
-- lifecycle coverage belongs in the existing report-card integration fixtures.

select has_function(
  'app_private',
  'enrich_report_card_snapshot_template_profile',
  array[]::text[],
  'report-card template profile enrichment function exists'
);

select has_trigger(
  'public',
  'report_card_snapshots',
  'report_card_snapshot_template_profile_enrichment_trg',
  'report-card snapshot template enrichment trigger exists'
);

select isnt_empty(
  $$select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname='enrich_report_card_snapshot_template_profile'$$,
  'template enrichment function is installed in app_private'
);

select ok(
  exists(select 1 from information_schema.tables where table_schema='public' and table_name='school_settings'),
  'school settings table exists for document/report configuration'
);

select ok(
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='report_card_snapshots' and column_name='data_snapshot'),
  'report-card snapshots retain immutable JSON document data'
);

select ok(
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='register_classes' and column_name='register_teacher_staff_id'),
  'register-class teacher assignment exists for report sign-off identity'
);

select * from finish();
rollback;
