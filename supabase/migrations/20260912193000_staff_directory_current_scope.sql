-- Staff directory and raw staff identity reads are school-local identity surfaces.
-- Preserve Platform Admin/self-read semantics while preventing an older active
-- non-current school membership from exposing another school's staff identities.
-- Once staff_school_assignments history exists, it remains authoritative over
-- legacy school_memberships fallback for current staff visibility.

create or replace function app_private.can_access_current_school_staff_directory(
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or (
      app_private.user_targets_current_school((select auth.uid()),p_school_id)
      and app_private.has_school_membership_scope(p_school_id)
    );
$$;

revoke all on function app_private.can_access_current_school_staff_directory(uuid)
from public,anon,authenticated;

create or replace function app_private.can_read_staff_identity(p_staff_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select
    app_private.has_platform_role(array['platform_admin'])
    or exists(
      select 1
      from public.staff_members s
      where s.id=p_staff_member_id
        and s.user_id=(select auth.uid())
    )
    or exists(
      select 1
      from (
        select a.school_id
        from public.staff_school_assignments a
        where a.staff_member_id=p_staff_member_id
        union
        select sm.school_id
        from public.school_memberships sm
        where sm.staff_member_id=p_staff_member_id
      ) target_school
      where app_private.can_access_current_school_staff_directory(target_school.school_id)
        and app_private.staff_member_covers_school_period(
          p_staff_member_id,
          target_school.school_id,
          current_date,
          current_date
        )
    );
$$;

revoke all on function app_private.can_read_staff_identity(uuid) from public,anon;
grant execute on function app_private.can_read_staff_identity(uuid) to authenticated;

-- School membership/placement ledgers retain historical provenance in the current school,
-- but a second active non-current school must not become an identity-enumeration surface.
drop policy if exists "school members read staff assignments" on public.staff_school_assignments;
create policy "current school members read staff assignments"
on public.staff_school_assignments for select to authenticated
using (
  app_private.has_platform_role(array['platform_admin'])
  or app_private.can_access_current_school_staff_directory(school_id)
);

drop policy if exists "school members read scoped memberships" on public.school_memberships;
create policy "current school members read scoped memberships"
on public.school_memberships for select to authenticated
using (
  user_id=(select auth.uid())
  or app_private.has_platform_role(array['platform_admin'])
  or app_private.can_access_current_school_staff_directory(school_id)
);

create or replace function public.list_staff_directory_page(
  p_school_id uuid,
  p_query text default null,
  p_page integer default 1,
  p_page_size integer default 50
)
returns table(
  row_id uuid,
  staff_id uuid,
  staff_name text,
  employee_number text,
  staff_code text,
  default_room_name text,
  labels text[],
  active_from date,
  active_to date,
  has_account boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_page integer := greatest(coalesce(p_page,1),1);
  v_page_size integer := least(greatest(coalesce(p_page_size,50),1),100);
  v_query text := nullif(btrim(coalesce(p_query,'')),'');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_access_current_school_staff_directory(p_school_id) then
    raise exception 'Permission denied';
  end if;

  return query
  with latest_assignment as (
    select distinct on (ssa.staff_member_id)
      ssa.id,ssa.staff_member_id,ssa.assignment_type,ssa.position_title,
      ssa.effective_from,ssa.effective_to,ssa.staff_code,ssa.default_room_id
    from public.staff_school_assignments ssa
    where ssa.school_id=p_school_id
    order by ssa.staff_member_id,ssa.effective_from desc,ssa.created_at desc,ssa.id
  ),
  membership_rollup as (
    select
      sm.staff_member_id,
      (array_agg(sm.id order by sm.active_from,sm.id))[1] as first_membership_id,
      min(sm.active_from) as first_active_from,
      case when bool_or(sm.active_to is null) then null else max(sm.active_to) end as last_active_to,
      bool_or(sm.user_id is not null) as has_account,
      array_agg(distinct sm.role_key::text order by sm.role_key::text) as role_labels
    from public.school_memberships sm
    where sm.school_id=p_school_id and sm.staff_member_id is not null
    group by sm.staff_member_id
  ),
  linked_staff_ids as (
    select staff_member_id from latest_assignment
    union
    select staff_member_id from membership_rollup
  ),
  linked_rows as (
    select
      coalesce(la.id,mr.first_membership_id) as row_id,
      ids.staff_member_id as staff_id,
      concat_ws(' ',staff.first_name,staff.last_name) as staff_name,
      staff.employee_number,
      la.staff_code,
      room.display_name as default_room_name,
      array_remove(array_cat(
        case when la.id is null then array[]::text[] else array[coalesce(nullif(btrim(la.position_title),''),la.assignment_type::text)] end,
        coalesce(mr.role_labels,array[]::text[])
      ),null) as labels,
      case when la.id is not null then la.effective_from else mr.first_active_from end as active_from,
      case when la.id is not null then la.effective_to else mr.last_active_to end as active_to,
      coalesce(mr.has_account,false) as has_account
    from linked_staff_ids ids
    join public.staff_members staff on staff.id=ids.staff_member_id
    left join latest_assignment la on la.staff_member_id=ids.staff_member_id
    left join membership_rollup mr on mr.staff_member_id=ids.staff_member_id
    left join public.school_rooms room on room.id=la.default_room_id
  ),
  unlinked_memberships as (
    select
      sm.id as row_id,
      null::uuid as staff_id,
      'Linked school user'::text as staff_name,
      null::text as employee_number,
      null::text as staff_code,
      null::text as default_room_name,
      array[sm.role_key::text] as labels,
      sm.active_from,
      sm.active_to,
      (sm.user_id is not null) as has_account
    from public.school_memberships sm
    where sm.school_id=p_school_id and sm.staff_member_id is null
  ),
  directory as (
    select * from linked_rows
    union all
    select * from unlinked_memberships
  ),
  filtered as (
    select d.*
    from directory d
    where v_query is null
       or concat_ws(' ',d.staff_name,d.employee_number,d.staff_code,d.default_room_name,array_to_string(d.labels,' ')) ilike '%' || v_query || '%'
  )
  select
    d.row_id,d.staff_id,d.staff_name,d.employee_number,d.staff_code,d.default_room_name,
    d.labels,d.active_from,d.active_to,d.has_account,count(*) over()
  from filtered d
  order by lower(d.staff_name),coalesce(d.employee_number,''),d.row_id
  limit v_page_size offset (v_page-1)*v_page_size;
end;
$$;

create or replace function public.get_staff_directory_summary(
  p_school_id uuid,
  p_on_date date default current_date
)
returns table(
  total_staff bigint,
  active_staff bigint,
  account_count bigint,
  suggested_employee_number text
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_access_current_school_staff_directory(p_school_id) then
    raise exception 'Permission denied';
  end if;

  return query
  with latest_assignment as (
    select distinct on (ssa.staff_member_id)
      ssa.staff_member_id,ssa.effective_from,ssa.effective_to
    from public.staff_school_assignments ssa
    where ssa.school_id=p_school_id
    order by ssa.staff_member_id,ssa.effective_from desc,ssa.created_at desc,ssa.id
  ),
  membership_rollup as (
    select
      sm.staff_member_id,
      min(sm.active_from) as first_active_from,
      case when bool_or(sm.active_to is null) then null else max(sm.active_to) end as last_active_to,
      bool_or(sm.user_id is not null) as has_account
    from public.school_memberships sm
    where sm.school_id=p_school_id and sm.staff_member_id is not null
    group by sm.staff_member_id
  ),
  linked_staff_ids as (
    select staff_member_id from latest_assignment
    union
    select staff_member_id from membership_rollup
  ),
  linked as (
    select
      ids.staff_member_id,
      case when la.staff_member_id is not null then la.effective_from else mr.first_active_from end as active_from,
      case when la.staff_member_id is not null then la.effective_to else mr.last_active_to end as active_to,
      coalesce(mr.has_account,false) as has_account
    from linked_staff_ids ids
    left join latest_assignment la on la.staff_member_id=ids.staff_member_id
    left join membership_rollup mr on mr.staff_member_id=ids.staff_member_id
  ),
  unlinked as (
    select null::uuid as staff_member_id,sm.active_from,sm.active_to,(sm.user_id is not null) as has_account
    from public.school_memberships sm
    where sm.school_id=p_school_id and sm.staff_member_id is null
  ),
  directory as (
    select * from linked union all select * from unlinked
  ),
  employee_numbers as (
    select max((regexp_match(staff.employee_number,'^EMP-([0-9]+)$','i'))[1]::integer) as highest
    from public.staff_members staff
    where exists(
      select 1 from public.staff_school_assignments ssa where ssa.school_id=p_school_id and ssa.staff_member_id=staff.id
    ) or exists(
      select 1 from public.school_memberships sm where sm.school_id=p_school_id and sm.staff_member_id=staff.id
    )
  )
  select
    count(*)::bigint,
    count(*) filter(where d.active_from<=p_on_date and (d.active_to is null or d.active_to>=p_on_date))::bigint,
    count(*) filter(where d.has_account)::bigint,
    'EMP-' || lpad((coalesce((select highest from employee_numbers),0)+1)::text,3,'0')
  from directory d;
end;
$$;

revoke all on function public.list_staff_directory_page(uuid,text,integer,integer) from public,anon;
grant execute on function public.list_staff_directory_page(uuid,text,integer,integer) to authenticated;
revoke all on function public.get_staff_directory_summary(uuid,date) from public,anon;
grant execute on function public.get_staff_directory_summary(uuid,date) to authenticated;

comment on function app_private.can_access_current_school_staff_directory(uuid) is
'Internal staff identity/directory scope: Platform Admin or an authenticated member targeting the deterministic current school. Platform Support does not inherit school identity access.';
comment on function app_private.can_read_staff_identity(uuid) is
'Raw staff identity visibility: Platform Admin, self-read, or current-school visibility backed by governed current placement. Authoritative staff_school_assignments history takes precedence over legacy membership fallback.';
comment on function public.list_staff_directory_page(uuid,text,integer,integer) is
'Paged current-school staff directory. Historical rows remain represented, while authoritative assignment periods control operational active dates when placement history exists.';
