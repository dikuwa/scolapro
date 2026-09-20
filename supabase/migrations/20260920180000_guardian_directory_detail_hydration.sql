-- Guardian directory hydration currently performs three authenticated table
-- reads after the governed directory RPC. Those reads re-evaluate guardian RLS
-- per row. Hydrate only already-authorized/current-school guardian IDs through
-- one bounded SECURITY DEFINER RPC.

create or replace function public.get_guardian_directory_details(
  p_school_id uuid,
  p_guardian_ids uuid[]
)
returns table(
  guardian_id uuid,
  preferred_name text,
  identity_number text,
  status text,
  contacts jsonb,
  addresses jsonb
)
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  with actor_scope as materialized (
    select
      app_private.is_guardian_current_school(p_school_id) as school_ok,
      (
        app_private.has_platform_role(array['platform_admin'])
        or exists(
          select 1
          from public.school_memberships sm
          where sm.school_id=p_school_id
            and sm.user_id=(select auth.uid())
            and sm.role_key in ('school_admin','principal','deputy_principal','counsellor','hod')
            and sm.active_from<=current_date
            and (sm.active_to is null or sm.active_to>=current_date)
        )
      ) as schoolwide
  ),
  authorized_guardians as materialized (
    select distinct lg.guardian_id
    from public.learner_guardians lg
    join public.enrolments e on e.learner_id=lg.learner_id
    cross join actor_scope a
    where a.school_ok
      and lg.guardian_id=any(coalesce(p_guardian_ids,array[]::uuid[]))
      and e.school_id=p_school_id
      and e.status='current'
      and e.enrolled_from<=current_date
      and (e.enrolled_to is null or e.enrolled_to>=current_date)
      and lg.effective_from<=current_date
      and (lg.effective_to is null or lg.effective_to>=current_date)
      and (
        a.schoolwide
        or app_private.can_access_learner_observations(e.school_id,e.learner_id)
      )
  ),
  contact_rows as materialized (
    select
      gc.guardian_id,
      jsonb_agg(
        jsonb_build_object(
          'id',gc.id,
          'type',gc.contact_type,
          'value',gc.contact_value,
          'primary',gc.is_primary,
          'label',gc.label
        )
        order by gc.is_primary desc,gc.created_at desc
      ) contacts
    from public.guardian_contacts gc
    join authorized_guardians ag on ag.guardian_id=gc.guardian_id
    where gc.effective_from<=current_date
      and (gc.effective_to is null or gc.effective_to>=current_date)
    group by gc.guardian_id
  ),
  address_rows as materialized (
    select
      ga.guardian_id,
      jsonb_agg(
        jsonb_build_object(
          'id',ga.id,
          'type',ga.address_type,
          'label',ga.label,
          'line1',ga.address_line_1,
          'line2',ga.address_line_2,
          'locality',ga.suburb_or_locality,
          'town',ga.town_or_city,
          'region',ga.region,
          'postalCode',ga.postal_code,
          'country',ga.country
        )
        order by ga.is_primary desc,ga.created_at desc
      ) addresses
    from public.guardian_addresses ga
    join authorized_guardians ag on ag.guardian_id=ga.guardian_id
    where ga.effective_from<=current_date
      and (ga.effective_to is null or ga.effective_to>=current_date)
    group by ga.guardian_id
  )
  select
    gp.id,
    gp.preferred_name,
    gp.identity_number,
    gp.status,
    coalesce(cr.contacts,'[]'::jsonb),
    coalesce(ar.addresses,'[]'::jsonb)
  from authorized_guardians ag
  join public.guardian_profiles gp on gp.id=ag.guardian_id
  left join contact_rows cr on cr.guardian_id=ag.guardian_id
  left join address_rows ar on ar.guardian_id=ag.guardian_id;
$$;

revoke all on function public.get_guardian_directory_details(uuid,uuid[]) from public,anon;
grant execute on function public.get_guardian_directory_details(uuid,uuid[]) to authenticated;

comment on function public.get_guardian_directory_details(uuid,uuid[])
is 'Governed guardian-directory hydration for current-school authorized guardian IDs. Returns only directory profile fields plus effective contacts and addresses.';
