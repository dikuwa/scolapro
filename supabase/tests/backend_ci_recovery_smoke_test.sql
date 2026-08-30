begin;

select plan(3);

select ok(to_regprocedure('app_private.can_read_communication_policy(uuid)') is not null,'communication RLS wrapper is installed');
select ok(to_regprocedure('public.build_report_card_snapshot(uuid,smallint,text)') is not null,'governed report-card snapshot signature is installed');
select ok(to_regprocedure('public.reconcile_guardian_import_batch(uuid)') is not null,'guardian reconciliation RPC remains installed');

select * from finish();
rollback;
