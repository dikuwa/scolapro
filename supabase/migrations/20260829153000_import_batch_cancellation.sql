-- Allow School Admins to abandon an uncommitted staging/reconciliation attempt without
-- deleting its audit history. Cancelled batches remain historical but cannot be committed.

create or replace function public.cancel_import_batch(p_batch_id uuid)
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
  if v_batch.status in ('completed','committing') then raise exception 'Committed or committing imports cannot be cancelled'; end if;
  if v_batch.status='cancelled' then return true; end if;

  update public.import_batches
  set status='cancelled', cancelled_at=now(), updated_at=now()
  where id=v_batch.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_batch.tenant_id,v_batch.school_id,auth.uid(),'import_batch.cancelled','import_batch',v_batch.id,
    jsonb_build_object('import_type',v_batch.import_type,'source_file_name',v_batch.source_file_name,'total_rows',v_batch.total_rows));

  return true;
end;
$$;

revoke all on function public.cancel_import_batch(uuid) from public,anon;
grant execute on function public.cancel_import_batch(uuid) to authenticated;
