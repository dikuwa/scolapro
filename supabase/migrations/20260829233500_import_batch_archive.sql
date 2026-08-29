-- Import history is audit evidence, so "clear" must not mean delete. School admins can
-- archive terminal batches to remove clutter from the active workspace while keeping rows,
-- commit results and audit events intact. Open batches must be cancelled before archiving.

alter table public.import_batches
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_user_id uuid references auth.users(id) on delete set null;

create index if not exists import_batches_school_unarchived_created_idx
  on public.import_batches(school_id,created_at desc)
  where archived_at is null;

create or replace function public.archive_import_batch(p_batch_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_batch public.import_batches%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_batch
  from public.import_batches
  where id=p_batch_id
  for update;

  if not found then raise exception 'Import batch not found'; end if;
  if not app_private.can_manage_school_imports(v_batch.school_id) then raise exception 'Permission denied'; end if;
  if v_batch.status not in ('completed','cancelled','failed') then
    raise exception 'Only completed, cancelled or failed imports can be archived';
  end if;
  if v_batch.archived_at is not null then return true; end if;

  update public.import_batches
  set archived_at=now(),archived_by_user_id=auth.uid(),updated_at=now()
  where id=v_batch.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_batch.tenant_id,v_batch.school_id,auth.uid(),'import_batch.archived','import_batch',v_batch.id,
    jsonb_build_object('status',v_batch.status,'import_type',v_batch.import_type,'source_file_name',v_batch.source_file_name));

  return true;
end;
$$;

create or replace function public.restore_import_batch_from_archive(p_batch_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_batch public.import_batches%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_batch from public.import_batches where id=p_batch_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if not app_private.can_manage_school_imports(v_batch.school_id) then raise exception 'Permission denied'; end if;
  if v_batch.archived_at is null then return true; end if;

  update public.import_batches
  set archived_at=null,archived_by_user_id=null,updated_at=now()
  where id=v_batch.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_batch.tenant_id,v_batch.school_id,auth.uid(),'import_batch.archive_restored','import_batch',v_batch.id,
    jsonb_build_object('status',v_batch.status,'import_type',v_batch.import_type,'source_file_name',v_batch.source_file_name));
  return true;
end;
$$;

revoke all on function public.archive_import_batch(uuid) from public,anon;
grant execute on function public.archive_import_batch(uuid) to authenticated;
revoke all on function public.restore_import_batch_from_archive(uuid) from public,anon;
grant execute on function public.restore_import_batch_from_archive(uuid) to authenticated;

comment on column public.import_batches.archived_at is 'Hides terminal import history from the default workspace without deleting audit/history data.';
