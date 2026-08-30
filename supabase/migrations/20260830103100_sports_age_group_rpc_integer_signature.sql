-- PostgREST/JavaScript clients naturally send ordinary integers. Keep smallint storage
-- constraints internally, but expose an integer RPC signature so callers do not need
-- PostgreSQL-specific casts.

drop function if exists public.upsert_sports_age_group(uuid,text,smallint,smallint,integer,uuid);

create or replace function public.upsert_sports_age_group(
  p_school_id uuid,
  p_label text,
  p_min_age integer default null,
  p_max_age integer default null,
  p_sort_order integer default 0,
  p_group_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_tenant uuid;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_sports(p_school_id) then raise exception 'Permission denied'; end if;
  select tenant_id into v_tenant from public.schools where id=p_school_id and status='active';
  if v_tenant is null then raise exception 'School not found or inactive'; end if;
  if btrim(coalesce(p_label,''))='' then raise exception 'Age group label is required'; end if;
  if p_min_age is not null and (p_min_age<3 or p_min_age>30) then raise exception 'Minimum age must be between 3 and 30'; end if;
  if p_max_age is not null and (p_max_age<3 or p_max_age>30) then raise exception 'Maximum age must be between 3 and 30'; end if;
  if p_min_age is not null and p_max_age is not null and p_min_age>p_max_age then raise exception 'Minimum age cannot exceed maximum age'; end if;

  if p_group_id is null then
    insert into public.sports_age_groups(tenant_id,school_id,label,min_age,max_age,sort_order,created_by_user_id)
    values(v_tenant,p_school_id,btrim(p_label),p_min_age::smallint,p_max_age::smallint,coalesce(p_sort_order,0),auth.uid())
    returning id into v_id;
  else
    update public.sports_age_groups
    set label=btrim(p_label),min_age=p_min_age::smallint,max_age=p_max_age::smallint,
        sort_order=coalesce(p_sort_order,0),updated_at=now()
    where id=p_group_id and school_id=p_school_id
    returning id into v_id;
    if v_id is null then raise exception 'Age group not found in this school'; end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.upsert_sports_age_group(uuid,text,integer,integer,integer,uuid) from public,anon;
grant execute on function public.upsert_sports_age_group(uuid,text,integer,integer,integer,uuid) to authenticated;

comment on function public.upsert_sports_age_group(uuid,text,integer,integer,integer,uuid) is
'Creates or updates a school sports age band through a client-friendly integer API while smallint storage constraints and active-band non-overlap remain enforced.';
