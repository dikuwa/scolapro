-- N14 staffing establishment operational reporting / reconciliation follow-up.
-- This read model reuses N13 establishment/occupancy facts and authoritative
-- effective-dated staff_school_assignments. It exposes school-level counts only;
-- named occupancy remains governed by the stricter N13 occupancy boundary.

create or replace function public.staffing_establishment_summary_as_of(
  p_school_id uuid,
  p_as_of date default current_date
)
returns table(
  school_id uuid,
  as_of_date date,
  establishment_posts integer,
  occupied_posts integer,
  vacant_posts integer,
  active_staff_placements integer,
  linked_staff_placements integer,
  unlinked_staff_placements integer
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_as_of is null then
    raise exception 'As-of date is required';
  end if;
  if not exists(
    select 1
    from public.school_memberships sm
    where sm.school_id=p_school_id
      and sm.user_id=auth.uid()
      and sm.role_key in ('school_admin','principal','deputy_principal','hod')
      and sm.active_from<=current_date
      and (sm.active_to is null or sm.active_to>=current_date)
  ) then
    raise exception 'Permission denied';
  end if;

  return query
  with active_posts as (
    select p.id
    from public.staffing_establishment_posts p
    where p.school_id=p_school_id
      and p.effective_from<=p_as_of
      and (p.effective_to is null or p.effective_to>=p_as_of)
  ),
  active_occupancies as (
    select distinct o.post_id,o.staff_school_assignment_id
    from public.staffing_post_occupancies o
    join active_posts p on p.id=o.post_id
    where o.school_id=p_school_id
      and o.effective_from<=p_as_of
      and (o.effective_to is null or o.effective_to>=p_as_of)
  ),
  active_placements as (
    select a.id
    from public.staff_school_assignments a
    where a.school_id=p_school_id
      and a.effective_from<=p_as_of
      and (a.effective_to is null or a.effective_to>=p_as_of)
  ),
  counts as (
    select
      (select count(*)::integer from active_posts) as establishment_posts,
      (select count(distinct post_id)::integer from active_occupancies) as occupied_posts,
      (select count(*)::integer from active_placements) as active_staff_placements,
      (select count(distinct ao.staff_school_assignment_id)::integer
       from active_occupancies ao
       join active_placements ap on ap.id=ao.staff_school_assignment_id) as linked_staff_placements
  )
  select
    p_school_id,
    p_as_of,
    c.establishment_posts,
    c.occupied_posts,
    greatest(c.establishment_posts-c.occupied_posts,0)::integer,
    c.active_staff_placements,
    c.linked_staff_placements,
    greatest(c.active_staff_placements-c.linked_staff_placements,0)::integer
  from counts c;
end;
$$;

revoke all on function public.staffing_establishment_summary_as_of(uuid,date) from public,anon;
grant execute on function public.staffing_establishment_summary_as_of(uuid,date) to authenticated;

comment on function public.staffing_establishment_summary_as_of(uuid,date) is
'School-leadership aggregate staffing reconciliation as of a date: establishment, occupied/vacant posts, and authoritative staff placements linked/unlinked to establishment occupancy. Returns counts only and never occupant identity.';
