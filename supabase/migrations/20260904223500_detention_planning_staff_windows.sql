-- Preserve every distinct school-placement window in the detention planning read model.
-- The UI needs the real date windows so future duty rosters never offer a staff member
-- for a detention date on which that person is not assigned to the school.

create or replace function public.list_detention_planning_staff(
  p_school_id uuid,
  p_from_date date,
  p_to_date date
)
returns table(
  staff_member_id uuid,
  employee_number text,
  first_name text,
  last_name text,
  eligible boolean,
  effective_from date,
  effective_to date
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_from_date is null or p_to_date is null or p_to_date<p_from_date then
    raise exception 'Invalid detention planning date range';
  end if;
  if p_to_date>p_from_date+interval '120 days' then
    raise exception 'Detention planning range is too large';
  end if;

  if not (
    app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
    or exists (
      select 1
      from public.school_duty_assignments d
      join public.staff_members sm on sm.id=d.staff_member_id
      where d.school_id=p_school_id
        and d.duty_key='late_arrival_recorder'
        and sm.user_id=auth.uid()
        and sm.status='active'
        and d.active_from<=p_to_date
        and (d.active_to is null or d.active_to>=p_from_date)
        and app_private.staff_member_has_school_assignment(sm.id,p_school_id,greatest(d.active_from,p_from_date))
    )
  ) then raise exception 'Permission denied'; end if;

  return query
  with placements as (
    select
      sm.id,
      sm.employee_number,
      sm.first_name,
      sm.last_name,
      coalesce(dsp.eligible,true) as eligible,
      ssa.effective_from,
      ssa.effective_to
    from public.staff_school_assignments ssa
    join public.staff_members sm
      on sm.id=ssa.staff_member_id
     and sm.tenant_id=ssa.tenant_id
     and sm.status='active'
    left join public.detention_supervision_preferences dsp
      on dsp.school_id=p_school_id and dsp.staff_member_id=sm.id
    where ssa.school_id=p_school_id
      and ssa.effective_from<=p_to_date
      and (ssa.effective_to is null or ssa.effective_to>=p_from_date)

    union all

    select
      sm.id,
      sm.employee_number,
      sm.first_name,
      sm.last_name,
      coalesce(dsp.eligible,true) as eligible,
      m.active_from,
      m.active_to
    from public.school_memberships m
    join public.staff_members sm
      on sm.id=m.staff_member_id
     and sm.tenant_id=m.tenant_id
     and sm.status='active'
    left join public.detention_supervision_preferences dsp
      on dsp.school_id=p_school_id and dsp.staff_member_id=sm.id
    where m.school_id=p_school_id
      and m.active_from<=p_to_date
      and (m.active_to is null or m.active_to>=p_from_date)
  )
  select distinct
    p.id,p.employee_number,p.first_name,p.last_name,p.eligible,p.effective_from,p.effective_to
  from placements p
  order by p.id,p.effective_from,p.effective_to nulls last;
end;
$$;

revoke all on function public.list_detention_planning_staff(uuid,date,date) from public,anon;
grant execute on function public.list_detention_planning_staff(uuid,date,date) to authenticated;

comment on function public.list_detention_planning_staff(uuid,date,date) is
'Bounded planning read model exposing active staff identities plus every distinct school-placement window overlapping the requested horizon. Consumers must evaluate the selected detention date against these windows; write RPCs remain authoritative.';
