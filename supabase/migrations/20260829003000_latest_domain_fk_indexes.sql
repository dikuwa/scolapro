-- Cover foreign keys introduced after the full FK-index sweep.
create index if not exists communication_provider_routes_school_idx
  on public.communication_provider_routes(school_id) where school_id is not null;
create index if not exists communication_provider_routes_updated_by_idx
  on public.communication_provider_routes(updated_by_user_id);
create index if not exists communication_delivery_attempts_tenant_idx
  on public.communication_delivery_attempts(tenant_id);
create index if not exists statutory_mapping_runs_tenant_idx
  on public.statutory_mapping_runs(tenant_id);
create index if not exists statutory_mapping_runs_school_idx
  on public.statutory_mapping_runs(school_id);
create index if not exists statutory_mapping_runs_form_version_idx
  on public.statutory_mapping_runs(form_version_id);
create index if not exists statutory_mapping_runs_compiled_by_idx
  on public.statutory_mapping_runs(compiled_by_user_id);
create index if not exists report_card_render_jobs_tenant_idx
  on public.report_card_render_jobs(tenant_id);
create index if not exists report_card_render_jobs_requested_by_idx
  on public.report_card_render_jobs(requested_by_user_id);
create index if not exists report_card_render_jobs_output_document_idx
  on public.report_card_render_jobs(output_document_id) where output_document_id is not null;
