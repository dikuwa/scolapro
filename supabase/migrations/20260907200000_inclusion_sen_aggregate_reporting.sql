-- N16: privacy-preserving inclusion/SEN/support aggregate reporting.
--
-- The authoritative support facts remain learner_support_cases and
-- learner_support_interventions. This migration adds read-only aggregate RPCs;
-- it does not create a parallel SEN/disability/support fact store and deliberately
-- does not expose free-text case_type/intervention_type values as classifications.
-- No repository-wide small-cell suppression policy exists at this point, so the
-- network surface is intentionally coarse (one aggregate across the caller's
-- currently-authorized network scope) rather than inventing a new threshold.

create or replace function public.school_inclusion_support_summary_as_of(
  p_school_id uuid,
  p_as_of date default current_date
)
returns table (
  school_id uuid,
  as_of_date date,
  support_cases bigint,
  learners_with_support bigint,
  interventions_to_date bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if p_school_id is null or p_as_of is null then
    raise exception 'School and as-of date are required';
  end if;

  if not exists (select 1 from public.schools s where s.id = p_school_id) then
    raise exception 'School not found';
  end if;

  -- School leadership may consume the aggregate without receiving direct access
  -- to highly-restricted case rows. Generic school administration remains denied
  -- by the existing learner-support authority helper.
  if not app_private.can_manage_learner_support(p_school_id) then
    raise exception 'Permission denied';
  end if;

  return query
  with effective_cases as (
    select c.id, c.learner_id
    from public.learner_support_cases c
    where c.school_id = p_school_id
      and c.opened_on <= p_as_of
      and (c.closed_on is null or c.closed_on >= p_as_of)
  )
  select
    p_school_id,
    p_as_of,
    count(distinct ec.id)::bigint,
    count(distinct ec.learner_id)::bigint,
    count(distinct i.id)::bigint
  from effective_cases ec
  left join public.learner_support_interventions i
    on i.support_case_id = ec.id
   and i.school_id = p_school_id
   and i.intervention_date <= p_as_of;
end;
$$;

revoke all on function public.school_inclusion_support_summary_as_of(uuid, date)
  from public, anon;
grant execute on function public.school_inclusion_support_summary_as_of(uuid, date)
  to authenticated;

comment on function public.school_inclusion_support_summary_as_of(uuid, date) is
'Privacy-preserving N16 school aggregate derived from authoritative learner-support cases/interventions. Returns counts only; no learner identity, case type, notes, diagnosis, accommodation, counselling detail, or support-record identifiers.';

create or replace function public.network_inclusion_support_summary_as_of(
  p_as_of date default current_date
)
returns table (
  as_of_date date,
  scoped_school_count bigint,
  support_cases bigint,
  learners_with_support bigint,
  interventions_to_date bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if p_as_of is null then
    raise exception 'As-of date is required';
  end if;

  -- Authorization is deliberately based on a membership that is active now.
  -- An expired network role may not regain sensitive aggregate access merely by
  -- asking for a historical date. The requested date only determines historical
  -- school placement and support facts within the caller's current network scope.
  if not exists (
    select 1
    from public.education_network_memberships m
    where m.user_id = auth.uid()
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
  effective_cases as (
    select c.id, c.learner_id, c.school_id
    from public.learner_support_cases c
    join scoped_schools ss on ss.school_id = c.school_id
    where c.opened_on <= p_as_of
      and (c.closed_on is null or c.closed_on >= p_as_of)
  )
  select
    p_as_of,
    (select count(*)::bigint from scoped_schools),
    count(distinct ec.id)::bigint,
    count(distinct ec.learner_id)::bigint,
    count(distinct i.id)::bigint
  from effective_cases ec
  left join public.learner_support_interventions i
    on i.support_case_id = ec.id
   and i.school_id = ec.school_id
   and i.intervention_date <= p_as_of;
end;
$$;

revoke all on function public.network_inclusion_support_summary_as_of(date)
  from public, anon;
grant execute on function public.network_inclusion_support_summary_as_of(date)
  to authenticated;

comment on function public.network_inclusion_support_summary_as_of(date) is
'Privacy-preserving N16 aggregate across schools in the caller current circuit/regional membership, with school placement evaluated as-of the requested date. Network roles receive no direct learner-support relation access and no per-school or learner-level detail.';
