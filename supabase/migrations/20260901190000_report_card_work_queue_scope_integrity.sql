create or replace function app_private.enforce_report_card_batch_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.academic_year is distinct from old.academic_year
    or new.term_number is distinct from old.term_number
    or new.scope_type is distinct from old.scope_type
    or new.operation is distinct from old.operation
    or new.created_by_user_id is distinct from old.created_by_user_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Report-card batch scope and creation provenance are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Report-card batch scope mismatch: school does not belong to tenant';
  end if;

  return new;
end;
$$;

create or replace function app_private.enforce_report_card_batch_item_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_batch public.report_card_batches%rowtype;
  v_enrolment public.enrolments%rowtype;
  v_snapshot public.report_card_snapshots%rowtype;
begin
  if tg_op = 'UPDATE' and (
    new.batch_id is distinct from old.batch_id
    or new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.enrolment_id is distinct from old.enrolment_id
    or new.learner_id is distinct from old.learner_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Report-card batch item batch, scope, learner, and enrolment are immutable';
  end if;

  select * into v_batch from public.report_card_batches where id = new.batch_id;
  if not found or (v_batch.tenant_id,v_batch.school_id) is distinct from (new.tenant_id,new.school_id) then
    raise exception 'Report-card batch item scope mismatch: batch does not match item scope';
  end if;

  select * into v_enrolment from public.enrolments where id = new.enrolment_id;
  if not found or (v_enrolment.tenant_id,v_enrolment.school_id,v_enrolment.learner_id)
      is distinct from (new.tenant_id,new.school_id,new.learner_id) then
    raise exception 'Report-card batch item scope mismatch: enrolment does not match item scope';
  end if;

  if new.snapshot_id is not null then
    select * into v_snapshot from public.report_card_snapshots where id = new.snapshot_id;
    if not found or (v_snapshot.tenant_id,v_snapshot.school_id,v_snapshot.enrolment_id,v_snapshot.learner_id)
        is distinct from (new.tenant_id,new.school_id,new.enrolment_id,new.learner_id) then
      raise exception 'Report-card batch item scope mismatch: snapshot does not match item scope';
    end if;
  end if;

  return new;
end;
$$;

create or replace function app_private.enforce_report_card_render_job_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_snapshot_tenant uuid;
  v_snapshot_school uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.snapshot_id is distinct from old.snapshot_id
    or new.template_key is distinct from old.template_key
    or new.template_version is distinct from old.template_version
    or new.document_format is distinct from old.document_format
    or new.requested_by_user_id is distinct from old.requested_by_user_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Report-card render job scope and request provenance are immutable';
  end if;

  select s.tenant_id,s.school_id into v_snapshot_tenant,v_snapshot_school
  from public.report_card_snapshots s
  where s.id = new.snapshot_id;

  if v_snapshot_tenant is null or (v_snapshot_tenant,v_snapshot_school) is distinct from (new.tenant_id,new.school_id) then
    raise exception 'Report-card render job scope mismatch: snapshot does not match job scope';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_report_card_batch_scope_integrity() from public, anon, authenticated;
revoke all on function app_private.enforce_report_card_batch_item_scope_integrity() from public, anon, authenticated;
revoke all on function app_private.enforce_report_card_render_job_scope_integrity() from public, anon, authenticated;

drop trigger if exists report_card_batch_scope_integrity_trg on public.report_card_batches;
create trigger report_card_batch_scope_integrity_trg
before insert or update
on public.report_card_batches
for each row execute function app_private.enforce_report_card_batch_scope_integrity();

drop trigger if exists report_card_batch_item_scope_integrity_trg on public.report_card_batch_items;
create trigger report_card_batch_item_scope_integrity_trg
before insert or update
on public.report_card_batch_items
for each row execute function app_private.enforce_report_card_batch_item_scope_integrity();

drop trigger if exists report_card_render_job_scope_integrity_trg on public.report_card_render_jobs;
create trigger report_card_render_job_scope_integrity_trg
before insert or update
on public.report_card_render_jobs
for each row execute function app_private.enforce_report_card_render_job_scope_integrity();