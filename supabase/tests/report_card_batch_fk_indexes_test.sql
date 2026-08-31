begin;

select plan(7);

select ok(to_regclass('public.report_card_batches_tenant_idx') is not null,'report-card batch tenant FK is indexed');
select ok(to_regclass('public.report_card_batches_created_by_idx') is not null,'report-card batch creator FK is indexed');
select ok(to_regclass('public.report_card_batch_items_tenant_idx') is not null,'report-card batch item tenant FK is indexed');
select ok(to_regclass('public.report_card_batch_items_school_idx') is not null,'report-card batch item school FK is indexed');
select ok(to_regclass('public.report_card_batch_items_enrolment_idx') is not null,'report-card batch item enrolment FK is indexed');
select ok(to_regclass('public.report_card_batch_items_learner_idx') is not null,'report-card batch item learner FK is indexed');
select ok(to_regclass('public.report_card_batch_items_snapshot_idx') is not null,'report-card batch item snapshot FK is indexed');

select * from finish();
rollback;
