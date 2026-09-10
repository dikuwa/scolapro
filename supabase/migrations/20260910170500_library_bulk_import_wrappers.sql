-- Atomic confirmed-import wrappers. Rows are validated again inside the governed
-- title/copy functions so browser preview is never the authorization boundary.

create or replace function public.bulk_save_learning_resource_titles(
  p_school_id uuid,
  p_rows jsonb
)
returns uuid[]
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_item jsonb;
  v_count integer;
  v_id uuid;
  v_ids uuid[] := '{}';
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_ltsm(p_school_id) then raise exception 'Permission denied'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Import rows must be an array'; end if;
  v_count := jsonb_array_length(p_rows);
  if v_count < 1 or v_count > 500 then raise exception 'Title import must contain between 1 and 500 rows'; end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    v_id := public.save_learning_resource_title(
      p_school_id,
      coalesce(v_item->>'resource_type', 'textbook'),
      coalesce(v_item->>'title', ''),
      null,
      v_item->>'author',
      v_item->>'publisher',
      v_item->>'isbn',
      nullif(v_item->>'subject_id','')::uuid,
      nullif(v_item->>'grade_id','')::uuid,
      v_item->>'edition',
      v_item->>'category',
      coalesce(v_item->>'status','active')
    );
    v_ids := array_append(v_ids, v_id);
  end loop;

  return v_ids;
end;
$$;

revoke all on function public.bulk_save_learning_resource_titles(uuid,jsonb) from public, anon;
grant execute on function public.bulk_save_learning_resource_titles(uuid,jsonb) to authenticated;

create or replace function public.bulk_add_learning_resource_copies(
  p_school_id uuid,
  p_rows jsonb
)
returns uuid[]
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_item jsonb;
  v_count integer;
  v_title_id uuid;
  v_created uuid[];
  v_ids uuid[] := '{}';
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_ltsm(p_school_id) then raise exception 'Permission denied'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Import rows must be an array'; end if;
  v_count := jsonb_array_length(p_rows);
  if v_count < 1 or v_count > 1000 then raise exception 'Copy import must contain between 1 and 1000 rows'; end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    begin
      v_title_id := (v_item->>'title_id')::uuid;
    exception when others then
      raise exception 'Copy import contains an invalid title identifier';
    end;

    if not exists(
      select 1 from public.learning_resource_titles t
      where t.id = v_title_id and t.school_id = p_school_id
    ) then raise exception 'Copy import title does not belong to this school'; end if;

    v_created := public.add_learning_resource_copies(
      v_title_id,
      jsonb_build_array(v_item - 'title_id')
    );
    v_ids := v_ids || v_created;
  end loop;

  return v_ids;
end;
$$;

revoke all on function public.bulk_add_learning_resource_copies(uuid,jsonb) from public, anon;
grant execute on function public.bulk_add_learning_resource_copies(uuid,jsonb) to authenticated;

comment on function public.bulk_save_learning_resource_titles(uuid,jsonb) is
'Atomic confirmed title import; each row delegates to the governed canonical title save operation.';
comment on function public.bulk_add_learning_resource_copies(uuid,jsonb) is
'Atomic confirmed physical-copy import; each row delegates to the governed canonical stock-add operation.';
