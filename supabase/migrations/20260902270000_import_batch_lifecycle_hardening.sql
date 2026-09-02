-- Import staging is source-preserving, but client-supplied reconciliation outcomes must
-- never be trusted as commit-ready truth. Only structural errors may enter staging as
-- terminal row errors; all other rows must pass through the server-side reconciler.
-- Reviewed batches are the only batches that may advance to ready, and historical
-- batches must not be reopened or edited through generic import RPCs.

create or replace function public.stage_import_rows(
  p_batch_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_batch public.import_batches%rowtype;
  v_item jsonb;
  v_count integer:=0;
  v_row_number integer;
  v_requested_resolution text;
  v_staged_resolution text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_batch
  from public.import_batches
  where id=p_batch_id
  for update;

  if not found then raise exception 'Import batch not found'; end if;
  if not app_private.can_manage_school_imports(v_batch.school_id) then raise exception 'Permission denied'; end if;
  if v_batch.archived_at is not null then raise exception 'Archived import batches are read-only'; end if;
  if v_batch.status not in ('staging','validating','review') then raise exception 'Import batch is not editable'; end if;
  if jsonb_typeof(p_rows)<>'array' then raise exception 'Rows must be an array'; end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(v_item)<>'object' then raise exception 'Each import row must be an object'; end if;

    v_row_number:=coalesce(nullif(v_item->>'row_number','')::integer,v_count+1);
    v_requested_resolution:=lower(btrim(coalesce(v_item->>'resolution','review')));

    -- Structural parser failures may be preserved as errors. Every other incoming
    -- resolution is deliberately downgraded to review so only a reconciliation RPC
    -- can establish create/update/link/skip outcomes.
    v_staged_resolution:=case when v_requested_resolution='error' then 'error' else 'review' end;

    insert into public.import_rows(
      batch_id,tenant_id,school_id,row_number,source_data,normalized_data,resolution,issues
    ) values(
      v_batch.id,v_batch.tenant_id,v_batch.school_id,v_row_number,
      coalesce(v_item->'source','{}'::jsonb),
      coalesce(v_item->'normalized','{}'::jsonb),
      v_staged_resolution,
      coalesce(v_item->'issues','[]'::jsonb)
    )
    on conflict(batch_id,row_number) do update set
      source_data=excluded.source_data,
      normalized_data=excluded.normalized_data,
      resolution=excluded.resolution,
      matched_entity_type=null,
      matched_entity_id=null,
      issues=excluded.issues,
      updated_at=now();

    v_count:=v_count+1;
  end loop;

  update public.import_batches b set
    total_rows=(select count(*) from public.import_rows r where r.batch_id=b.id),
    valid_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and r.resolution in ('create','update','link','skip')),
    warning_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and jsonb_array_length(r.issues)>0 and r.resolution<>'error'),
    error_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and r.resolution='error'),
    status='review',
    updated_at=now()
  where b.id=v_batch.id;

  return v_count;
end;
$$;

create or replace function public.resolve_import_row(
  p_import_row_id uuid,
  p_resolution text,
  p_matched_entity_type text default null,
  p_matched_entity_id uuid default null,
  p_normalized_data jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_row public.import_rows%rowtype;
  v_batch public.import_batches%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_resolution not in ('create','update','link','skip','review','error') then raise exception 'Invalid resolution'; end if;

  select * into v_row
  from public.import_rows
  where id=p_import_row_id;

  if not found then raise exception 'Import row not found'; end if;

  select * into v_batch
  from public.import_batches
  where id=v_row.batch_id
  for update;

  if not found then raise exception 'Import batch not found'; end if;
  if not app_private.can_manage_school_imports(v_batch.school_id) then raise exception 'Permission denied'; end if;
  if v_batch.archived_at is not null then raise exception 'Archived import batches are read-only'; end if;
  if v_batch.status not in ('staging','validating','review') then raise exception 'Import batch is not editable'; end if;

  update public.import_rows set
    resolution=p_resolution,
    matched_entity_type=p_matched_entity_type,
    matched_entity_id=p_matched_entity_id,
    normalized_data=coalesce(p_normalized_data,normalized_data),
    updated_at=now()
  where id=v_row.id;

  update public.import_batches b set
    total_rows=(select count(*) from public.import_rows r where r.batch_id=b.id),
    valid_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and r.resolution in ('create','update','link','skip')),
    warning_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and jsonb_array_length(r.issues)>0 and r.resolution<>'error'),
    error_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and r.resolution='error'),
    status='review',
    updated_at=now()
  where b.id=v_batch.id;

  return true;
end;
$$;

create or replace function public.mark_import_batch_ready(p_batch_id uuid)
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
  if v_batch.archived_at is not null then raise exception 'Archived import batches are read-only'; end if;

  if v_batch.status='ready' then return true; end if;
  if v_batch.status<>'review' then raise exception 'Only reviewed import batches can be marked ready'; end if;

  if not exists(select 1 from public.import_rows where batch_id=v_batch.id) then
    raise exception 'Import batch must contain at least one staged row';
  end if;

  if exists(select 1 from public.import_rows where batch_id=v_batch.id and resolution in ('review','error')) then
    raise exception 'Resolve review/error rows before committing';
  end if;

  update public.import_batches
  set status='ready',updated_at=now()
  where id=v_batch.id;

  return true;
end;
$$;

comment on function public.stage_import_rows(uuid,jsonb) is
'Stages source rows for governed import reconciliation. Client-provided create/update/link/skip outcomes are not trusted; non-error rows always re-enter review.';

comment on function public.resolve_import_row(uuid,text,text,uuid,jsonb) is
'Applies a governed human resolution only while the owning import batch remains editable and unarchived.';

comment on function public.mark_import_batch_ready(uuid) is
'Advances a non-empty reviewed import batch to ready only after all rows have resolved outcomes; terminal and archived history cannot be reopened.';
