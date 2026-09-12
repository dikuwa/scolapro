-- Keep staffing filled/vacant reads bound to the authoritative staff placement.
-- A staffing_post_occupancy can legitimately preserve historical linkage after the
-- underlying staff_school_assignment is later ended. Such a stale occupancy must not
-- continue to count as filled after that authoritative placement ends.

create or replace function public.staffing_establishment_as_of(
  p_school_id uuid,
  p_as_of date default current_date
)
returns table(
  post_id uuid,
  title text,
  effective_from date,
  effective_to date,
  external_identifier text,
  external_identifier_source text,
  vacancy_state text
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_as_of is null then raise exception 'As-of date is required'; end if;
  if not exists(
    select 1 from public.school_memberships sm
    where sm.school_id=p_school_id and sm.user_id=auth.uid()
      and sm.role_key in ('school_admin','principal','deputy_principal','hod')
      and sm.active_from<=current_date and (sm.active_to is null or sm.active_to>=current_date)
  ) then raise exception 'Permission denied'; end if;

  return query
  select p.id,p.title,p.effective_from,p.effective_to,p.external_identifier,p.external_identifier_source,
    case when exists(
      select 1
      from public.staffing_post_occupancies o
      join public.staff_school_assignments a
        on a.id=o.staff_school_assignment_id
       and a.school_id=o.school_id
       and a.tenant_id=o.tenant_id
      where o.post_id=p.id
        and o.effective_from<=p_as_of
        and (o.effective_to is null or o.effective_to>=p_as_of)
        and a.effective_from<=p_as_of
        and (a.effective_to is null or a.effective_to>=p_as_of)
    ) then 'filled'::text else 'vacant'::text end
  from public.staffing_establishment_posts p
  where p.school_id=p_school_id
    and p.effective_from<=p_as_of
    and (p.effective_to is null or p.effective_to>=p_as_of)
  order by p.title,p.id;
end;
$$;

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
  active_placements as (
    select a.id
    from public.staff_school_assignments a
    where a.school_id=p_school_id
      and a.effective_from<=p_as_of
      and (a.effective_to is null or a.effective_to>=p_as_of)
  ),
  active_occupancies as (
    select distinct o.post_id,o.staff_school_assignment_id
    from public.staffing_post_occupancies o
    join active_posts p on p.id=o.post_id
    join active_placements ap on ap.id=o.staff_school_assignment_id
    where o.school_id=p_school_id
      and o.effective_from<=p_as_of
      and (o.effective_to is null or o.effective_to>=p_as_of)
  ),
  counts as (
    select
      (select count(*)::integer from active_posts) as establishment_posts,
      (select count(distinct post_id)::integer from active_occupancies) as occupied_posts,
      (select count(*)::integer from active_placements) as active_staff_placements,
      (select count(distinct staff_school_assignment_id)::integer from active_occupancies) as linked_staff_placements
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

create or replace function public.network_operational_summary_as_of(
  p_as_of date default current_date
)
returns table (
  as_of_date date,
  scoped_school_count bigint,
  establishment_posts bigint,
  occupied_posts bigint,
  vacant_posts bigint,
  active_staff_placements bigint,
  unlinked_staff_placements bigint,
  active_hostel_capacity bigint,
  current_hostel_residents bigint,
  feeding_service_days_to_date bigint,
  feeding_beneficiary_servings_to_date bigint,
  feeding_meals_to_date bigint,
  feeding_interruption_days_to_date bigint,
  feeding_stock_alert_days_to_date bigint,
  support_cases bigint,
  learners_with_support bigint,
  support_interventions_to_date bigint,
  examination_registration_submissions_to_date bigint,
  examination_result_import_batches_to_date bigint,
  examination_result_promotions_to_date bigint,
  approved_official_results_to_date bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_as_of is null then
    raise exception 'As-of date is required';
  end if;

  if not exists (
    select 1
    from public.education_network_memberships m
    where m.user_id = auth.uid()
      and m.role_key in ('circuit_officer','regional_officer')
      and m.active_from <= current_date
      and (m.active_to is null or m.active_to >= current_date)
  ) then
    raise exception 'Permission denied';
  end if;

  return query
  with current_memberships as (
    select m.role_key, m.region_id, m.circuit_id
    from public.education_network_memberships m
    where m.user_id = auth.uid()
      and m.role_key in ('circuit_officer','regional_officer')
      and m.active_from <= current_date
      and (m.active_to is null or m.active_to >= current_date)
  ),
  scoped_schools as (
    select distinct a.school_id
    from public.school_network_assignments a
    join current_memberships m
      on (
        (m.role_key = 'circuit_officer' and m.circuit_id = a.circuit_id)
        or
        (m.role_key = 'regional_officer' and m.region_id = a.region_id)
      )
    where a.effective_from <= p_as_of
      and (a.effective_to is null or a.effective_to >= p_as_of)
  ),
  active_posts as (
    select p.id
    from public.staffing_establishment_posts p
    join scoped_schools ss on ss.school_id = p.school_id
    where p.effective_from <= p_as_of
      and (p.effective_to is null or p.effective_to >= p_as_of)
  ),
  active_placements as (
    select a.id
    from public.staff_school_assignments a
    join scoped_schools ss on ss.school_id = a.school_id
    where a.effective_from <= p_as_of
      and (a.effective_to is null or a.effective_to >= p_as_of)
  ),
  active_occupancies as (
    select distinct o.post_id, o.staff_school_assignment_id
    from public.staffing_post_occupancies o
    join active_posts p on p.id = o.post_id
    join active_placements ap on ap.id = o.staff_school_assignment_id
    where o.effective_from <= p_as_of
      and (o.effective_to is null or o.effective_to >= p_as_of)
  ),
  staffing as (
    select
      (select count(*)::bigint from active_posts) as establishment_posts,
      (select count(distinct post_id)::bigint from active_occupancies) as occupied_posts,
      (select count(*)::bigint from active_placements) as active_staff_placements,
      (select count(distinct staff_school_assignment_id)::bigint from active_occupancies) as linked_staff_placements
  ),
  hostel as (
    select
      coalesce(sum(h.capacity),0)::bigint as active_hostel_capacity,
      count(distinct r.id)::bigint as current_hostel_residents
    from public.school_hostels h
    join scoped_schools ss on ss.school_id = h.school_id
    left join public.hostel_residencies r
      on r.hostel_id = h.id
     and r.resident_from <= p_as_of
     and (r.resident_to is null or r.resident_to >= p_as_of)
    where h.active_from <= p_as_of
      and (h.active_to is null or h.active_to >= p_as_of)
  ),
  feeding as (
    select
      count(distinct d.id)::bigint as service_days,
      coalesce(sum(d.beneficiary_count),0)::bigint as beneficiary_servings,
      coalesce(sum(d.meal_count),0)::bigint as meals,
      count(distinct d.id) filter (where d.interruption_reason is not null)::bigint as interruption_days,
      count(distinct d.id) filter (where d.stock_alert is not null)::bigint as stock_alert_days
    from public.feeding_service_days d
    join scoped_schools ss on ss.school_id = d.school_id
    where d.service_date <= p_as_of
  ),
  inclusion as (
    select n.support_cases, n.learners_with_support, n.interventions_to_date
    from public.network_inclusion_support_summary_as_of(p_as_of) n
  ),
  examination as (
    select
      (select count(*)::bigint
       from public.examination_registration_submissions s
       join scoped_schools ss on ss.school_id = s.school_id
       where s.frozen_at::date <= p_as_of) as registration_submissions,
      (select count(*)::bigint
       from public.examination_result_import_batches b
       join scoped_schools ss on ss.school_id = b.school_id
       where b.created_at::date <= p_as_of) as result_import_batches,
      (select count(*)::bigint
       from public.examination_result_import_promotions p
       join scoped_schools ss on ss.school_id = p.school_id
       where p.promoted_at::date <= p_as_of) as result_promotions,
      (select count(*)::bigint
       from public.official_results r
       join scoped_schools ss on ss.school_id = r.school_id
       where r.approved_at is not null
         and r.approved_at::date <= p_as_of) as approved_results
  )
  select
    p_as_of,
    (select count(*)::bigint from scoped_schools),
    st.establishment_posts,
    st.occupied_posts,
    greatest(st.establishment_posts - st.occupied_posts, 0)::bigint,
    st.active_staff_placements,
    greatest(st.active_staff_placements - st.linked_staff_placements, 0)::bigint,
    h.active_hostel_capacity,
    h.current_hostel_residents,
    f.service_days,
    f.beneficiary_servings,
    f.meals,
    f.interruption_days,
    f.stock_alert_days,
    i.support_cases,
    i.learners_with_support,
    i.interventions_to_date,
    e.registration_submissions,
    e.result_import_batches,
    e.result_promotions,
    e.approved_results
  from staffing st
  cross join hostel h
  cross join feeding f
  cross join inclusion i
  cross join examination e;
end;
$$;

revoke all on function public.staffing_establishment_as_of(uuid,date) from public,anon;
revoke all on function public.staffing_establishment_summary_as_of(uuid,date) from public,anon;
revoke all on function public.network_operational_summary_as_of(date) from public,anon;
grant execute on function public.staffing_establishment_as_of(uuid,date) to authenticated;
grant execute on function public.staffing_establishment_summary_as_of(uuid,date) to authenticated;
grant execute on function public.network_operational_summary_as_of(date) to authenticated;

comment on function public.staffing_establishment_as_of(uuid,date) is
'School-leadership read model deriving filled/vacant state at an as-of date from both effective occupancy and its authoritative effective staff-school placement, without exposing occupant identity.';
comment on function public.staffing_establishment_summary_as_of(uuid,date) is
'School-leadership aggregate staffing reconciliation as of a date: establishment, occupied/vacant posts, and authoritative staff placements linked/unlinked to effective establishment occupancy. Returns counts only and never occupant identity.';
comment on function public.network_operational_summary_as_of(date) is
'Coarse operational counts across the caller current circuit/regional authority with effective school placement evaluated as-of the requested date. Staffing occupancy is counted only while its authoritative staff-school placement is effective; no per-school, learner, staff, support-case or examination-access detail is returned.';
