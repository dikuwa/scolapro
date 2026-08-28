-- Governed bulk-import staging. Source rows are preserved verbatim, normalized
-- separately, reconciled before commit, and never written directly into domain
-- tables from a raw spreadsheet upload.

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  import_type text not null check (import_type in ('learners','staff','guardians','academic_structure')),
  source_file_name text not null,
  source_file_sha256 text,
  status text not null default 'staging' check (status in ('staging','validating','review','ready','committing','completed','failed','cancelled')),
  total_rows integer not null default 0 check (total_rows >= 0),
  valid_rows integer not null default 0 check (valid_rows >= 0),
  warning_rows integer not null default 0 check (warning_rows >= 0),
  error_rows integer not null default 0 check (error_rows >= 0),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  committed_at timestamptz,
  cancelled_at timestamptz
);
create index import_batches_school_created_idx on public.import_batches(school_id, created_at desc);

create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  source_data jsonb not null,
  normalized_data jsonb not null default '{}'::jsonb,
  resolution text not null default 'review' check (resolution in ('create','update','link','skip','review','error')),
  matched_entity_type text,
  matched_entity_id uuid,
  issues jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(batch_id, row_number),
  check (jsonb_typeof(source_data) = 'object'),
  check (jsonb_typeof(normalized_data) = 'object'),
  check (jsonb_typeof(issues) = 'array')
);
create index import_rows_batch_resolution_idx on public.import_rows(batch_id, resolution, row_number);

create table public.import_commit_results (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  import_row_id uuid not null references public.import_rows(id) on delete cascade,
  entity_type text,
  entity_id uuid,
  outcome text not null check (outcome in ('created','updated','linked','skipped','failed')),
  message text,
  created_at timestamptz not null default now(),
  unique(import_row_id)
);

alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;
alter table public.import_commit_results enable row level security;

create or replace function app_private.can_manage_school_imports(p_school_id uuid)
returns boolean language sql stable security definer set search_path=public,app_private as $$
  select app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal']);
$$;

create policy "authorized staff read import batches" on public.import_batches
for select to authenticated using (app_private.can_manage_school_imports(school_id));
create policy "authorized staff manage import batches" on public.import_batches
for all to authenticated using (app_private.can_manage_school_imports(school_id))
with check (app_private.can_manage_school_imports(school_id));
create policy "authorized staff read import rows" on public.import_rows
for select to authenticated using (app_private.can_manage_school_imports(school_id));
create policy "authorized staff manage import rows" on public.import_rows
for all to authenticated using (app_private.can_manage_school_imports(school_id))
with check (app_private.can_manage_school_imports(school_id));
create policy "authorized staff read import results" on public.import_commit_results
for select to authenticated using (exists(select 1 from public.import_batches b where b.id=batch_id and app_private.can_manage_school_imports(b.school_id)));

create or replace function public.create_import_batch(
  p_school_id uuid,
  p_import_type text,
  p_source_file_name text,
  p_source_file_sha256 text default null
)
returns uuid
language plpgsql security definer set search_path=public,app_private as $$
declare v_school public.schools%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_school from public.schools where id=p_school_id;
  if not found then raise exception 'School not found'; end if;
  if not app_private.can_manage_school_imports(p_school_id) then raise exception 'Permission denied'; end if;
  if p_import_type not in ('learners','staff','guardians','academic_structure') then raise exception 'Unsupported import type'; end if;
  if btrim(coalesce(p_source_file_name,''))='' then raise exception 'Source file name is required'; end if;
  insert into public.import_batches(tenant_id,school_id,import_type,source_file_name,source_file_sha256,created_by_user_id)
  values(v_school.tenant_id,v_school.id,p_import_type,btrim(p_source_file_name),nullif(btrim(coalesce(p_source_file_sha256,'')),''),auth.uid()) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.stage_import_rows(p_batch_id uuid,p_rows jsonb)
returns integer
language plpgsql security definer set search_path=public,app_private as $$
declare v_batch public.import_batches%rowtype; v_item jsonb; v_count integer:=0; v_row_number integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_batch from public.import_batches where id=p_batch_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if not app_private.can_manage_school_imports(v_batch.school_id) then raise exception 'Permission denied'; end if;
  if v_batch.status not in ('staging','validating','review') then raise exception 'Import batch is not editable'; end if;
  if jsonb_typeof(p_rows)<>'array' then raise exception 'Rows must be an array'; end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(v_item)<>'object' then raise exception 'Each import row must be an object'; end if;
    v_row_number := coalesce(nullif(v_item->>'row_number','')::integer, v_count+1);
    insert into public.import_rows(batch_id,tenant_id,school_id,row_number,source_data,normalized_data,resolution,issues)
    values(v_batch.id,v_batch.tenant_id,v_batch.school_id,v_row_number,coalesce(v_item->'source','{}'::jsonb),coalesce(v_item->'normalized','{}'::jsonb),coalesce(nullif(v_item->>'resolution',''),'review'),coalesce(v_item->'issues','[]'::jsonb))
    on conflict(batch_id,row_number) do update set source_data=excluded.source_data,normalized_data=excluded.normalized_data,resolution=excluded.resolution,issues=excluded.issues,updated_at=now();
    v_count:=v_count+1;
  end loop;

  update public.import_batches b set
    total_rows=(select count(*) from public.import_rows r where r.batch_id=b.id),
    valid_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and r.resolution in ('create','update','link','skip')),
    warning_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and jsonb_array_length(r.issues)>0 and r.resolution<>'error'),
    error_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and r.resolution='error'),
    status='review', updated_at=now()
  where b.id=v_batch.id;
  return v_count;
end; $$;

create or replace function public.resolve_import_row(
  p_import_row_id uuid,
  p_resolution text,
  p_matched_entity_type text default null,
  p_matched_entity_id uuid default null,
  p_normalized_data jsonb default null
)
returns boolean language plpgsql security definer set search_path=public,app_private as $$
declare v_row public.import_rows%rowtype;
begin
  if p_resolution not in ('create','update','link','skip','review','error') then raise exception 'Invalid resolution'; end if;
  select * into v_row from public.import_rows where id=p_import_row_id;
  if not found then raise exception 'Import row not found'; end if;
  if not app_private.can_manage_school_imports(v_row.school_id) then raise exception 'Permission denied'; end if;
  update public.import_rows set resolution=p_resolution,matched_entity_type=p_matched_entity_type,matched_entity_id=p_matched_entity_id,normalized_data=coalesce(p_normalized_data,normalized_data),updated_at=now() where id=v_row.id;
  return true;
end; $$;

create or replace function public.mark_import_batch_ready(p_batch_id uuid)
returns boolean language plpgsql security definer set search_path=public,app_private as $$
declare v_batch public.import_batches%rowtype;
begin
  select * into v_batch from public.import_batches where id=p_batch_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if not app_private.can_manage_school_imports(v_batch.school_id) then raise exception 'Permission denied'; end if;
  if exists(select 1 from public.import_rows where batch_id=v_batch.id and resolution in ('review','error')) then raise exception 'Resolve review/error rows before committing'; end if;
  update public.import_batches set status='ready',updated_at=now() where id=v_batch.id;
  return true;
end; $$;

revoke all on public.import_batches,public.import_rows,public.import_commit_results from anon;
grant select,insert,update,delete on public.import_batches,public.import_rows to authenticated;
grant select on public.import_commit_results to authenticated;
revoke all on function public.create_import_batch(uuid,text,text,text) from public,anon; grant execute on function public.create_import_batch(uuid,text,text,text) to authenticated;
revoke all on function public.stage_import_rows(uuid,jsonb) from public,anon; grant execute on function public.stage_import_rows(uuid,jsonb) to authenticated;
revoke all on function public.resolve_import_row(uuid,text,text,uuid,jsonb) from public,anon; grant execute on function public.resolve_import_row(uuid,text,text,uuid,jsonb) to authenticated;
revoke all on function public.mark_import_batch_ready(uuid) from public,anon; grant execute on function public.mark_import_batch_ready(uuid) to authenticated;
