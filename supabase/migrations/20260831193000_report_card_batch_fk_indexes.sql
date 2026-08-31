-- Cover foreign-key columns introduced by the durable report-card batch tables.
-- These tables were created after the earlier generic FK-index sweeps, so the
-- referenced columns need their own covering indexes for joins, deletes and
-- operational batch lookups at school scale.

create index if not exists report_card_batches_tenant_idx
  on public.report_card_batches(tenant_id);

create index if not exists report_card_batches_created_by_idx
  on public.report_card_batches(created_by_user_id);

create index if not exists report_card_batch_items_tenant_idx
  on public.report_card_batch_items(tenant_id);

create index if not exists report_card_batch_items_school_idx
  on public.report_card_batch_items(school_id);

create index if not exists report_card_batch_items_enrolment_idx
  on public.report_card_batch_items(enrolment_id);

create index if not exists report_card_batch_items_learner_idx
  on public.report_card_batch_items(learner_id);

create index if not exists report_card_batch_items_snapshot_idx
  on public.report_card_batch_items(snapshot_id)
  where snapshot_id is not null;
