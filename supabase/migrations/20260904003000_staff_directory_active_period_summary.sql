-- Staff directory active counts must be evaluated against the requested date,
-- not inferred from the assignment with the latest start date. A later scheduled
-- placement must not hide a currently active placement, and gaps between periods
-- must remain inactive.

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
set search_path=public,app_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_school_access(p_school_id) then raise exception 'Permission denied'; end if;

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
      case when la.effective_from is null then mr.first_active_from when mr.first_active_from is null then la.effective_from else least(la.effective_from,mr.first_active_from) end as active_from,
      case when la.staff_member_id is not null and la.effective_to is null then null when mr.staff_member_id is not null and mr.last_active_to is null then null else greatest(la.effective_to,mr.last_active_to) end as active_to,
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
    count(*) filter(
      where (
        d.staff_member_id is not null
        and (
          exists(
            select 1
            from public.staff_school_assignments ssa
            where ssa.school_id=p_school_id
              and ssa.staff_member_id=d.staff_member_id
              and ssa.effective_from<=p_on_date
              and (ssa.effective_to is null or ssa.effective_to>=p_on_date)
          )
          or exists(
            select 1
            from public.school_memberships sm
            where sm.school_id=p_school_id
              and sm.staff_member_id=d.staff_member_id
              and sm.active_from<=p_on_date
              and (sm.active_to is null or sm.active_to>=p_on_date)
          )
        )
      )
      or (
        d.staff_member_id is null
        and d.active_from<=p_on_date
        and (d.active_to is null or d.active_to>=p_on_date)
      )
    )::bigint,
    count(*) filter(where d.has_account)::bigint,
    'EMP-' || lpad((coalesce((select highest from employee_numbers),0)+1)::text,3,'0')
  from directory d;
end;
$$;

revoke all on function public.get_staff_directory_summary(uuid,date) from public,anon;
grant execute on function public.get_staff_directory_summary(uuid,date) to authenticated;

comment on function public.get_staff_directory_summary(uuid,date) is
'Returns staff directory totals with active staff evaluated from any assignment or membership whose effective period contains the requested date.';