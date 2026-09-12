-- Guardian school operations must follow the deterministic current-school boundary introduced
-- by #411. A second still-active school membership must not remain an operational authority.
-- Platform Admin retains governed cross-school oversight; Platform Support does not inherit
-- guardian contact/address access. Historical guardian/contact/relationship rows are untouched.

create or replace function app_private.is_guardian_current_school(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select case
    when app_private.has_platform_role(array['platform_admin']) then true
    when app_private.has_platform_role(array['platform_support']) then false
    else p_school_id = (
      select sm.school_id
      from public.school_memberships sm
      where sm.user_id = (select auth.uid())
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
      order by sm.active_from desc, sm.id asc
      limit 1
    )
  end;
$$;

revoke all on function app_private.is_guardian_current_school(uuid) from public, anon, authenticated;

create or replace function app_private.can_manage_guardians_for_learner(p_learner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or (
      not app_private.has_platform_role(array['platform_support'])
      and exists(
        select 1
        from public.enrolments e
        join public.school_memberships sm on sm.school_id = e.school_id
        where e.learner_id = p_learner_id
          and e.status = 'current'
          and e.enrolled_from <= current_date
          and (e.enrolled_to is null or e.enrolled_to >= current_date)
          and app_private.is_guardian_current_school(e.school_id)
          and sm.user_id = (select auth.uid())
          and sm.role_key in ('school_admin','principal','deputy_principal','counsellor')
          and sm.active_from <= current_date
          and (sm.active_to is null or sm.active_to >= current_date)
      )
    );
$$;

revoke all on function app_private.can_manage_guardians_for_learner(uuid) from public, anon;
grant execute on function app_private.can_manage_guardians_for_learner(uuid) to authenticated;

create or replace function app_private.can_read_guardian(p_guardian_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or exists(
      select 1
      from public.guardian_user_links gul
      where gul.guardian_id = p_guardian_id
        and gul.user_id = (select auth.uid())
    )
    or (
      not app_private.has_platform_role(array['platform_support'])
      and exists(
        select 1
        from public.learner_guardians lg
        join public.enrolments e on e.learner_id = lg.learner_id
        where lg.guardian_id = p_guardian_id
          and lg.effective_from <= current_date
          and (lg.effective_to is null or lg.effective_to >= current_date)
          and e.status = 'current'
          and e.enrolled_from <= current_date
          and (e.enrolled_to is null or e.enrolled_to >= current_date)
          and app_private.is_guardian_current_school(e.school_id)
          and (
            app_private.can_access_learner_observations(e.school_id,e.learner_id)
            or exists(
              select 1
              from public.school_memberships sm
              where sm.school_id = e.school_id
                and sm.user_id = (select auth.uid())
                and sm.role_key = 'hod'
                and sm.active_from <= current_date
                and (sm.active_to is null or sm.active_to >= current_date)
            )
          )
      )
    );
$$;

revoke all on function app_private.can_read_guardian(uuid) from public, anon;
grant execute on function app_private.can_read_guardian(uuid) to authenticated;

-- Preserve the verified #211 directory implementation behind a non-client-executable name,
-- then expose the same signature through a deterministic current-school guard. This avoids
-- duplicating or weakening its effective enrolment/relationship/contact filtering.
alter function public.search_guardian_directory(uuid,text,integer)
  rename to search_guardian_directory_current_enrolment_impl;
revoke all on function public.search_guardian_directory_current_enrolment_impl(uuid,text,integer)
  from public, anon, authenticated;

create function public.search_guardian_directory(
  p_school_id uuid,
  p_query text default null,
  p_limit integer default 50
)
returns table(
  guardian_id uuid,
  guardian_name text,
  primary_mobile text,
  primary_email text,
  linked_learners jsonb
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
  if not app_private.is_guardian_current_school(p_school_id) then
    raise exception 'Permission denied';
  end if;

  return query
  select *
  from public.search_guardian_directory_current_enrolment_impl(p_school_id,p_query,p_limit);
end;
$$;

revoke all on function public.search_guardian_directory(uuid,text,integer) from public, anon;
grant execute on function public.search_guardian_directory(uuid,text,integer) to authenticated;

alter function public.search_guardian_directory_page(uuid,text,integer,integer)
  rename to search_guardian_directory_page_current_enrolment_impl;
revoke all on function public.search_guardian_directory_page_current_enrolment_impl(uuid,text,integer,integer)
  from public, anon, authenticated;

create function public.search_guardian_directory_page(
  p_school_id uuid,
  p_query text default null,
  p_page integer default 1,
  p_page_size integer default 50
)
returns table(
  guardian_id uuid,
  guardian_name text,
  primary_mobile text,
  primary_email text,
  linked_learners jsonb,
  total_count bigint
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
  if not app_private.is_guardian_current_school(p_school_id) then
    raise exception 'Permission denied';
  end if;

  return query
  select *
  from public.search_guardian_directory_page_current_enrolment_impl(
    p_school_id,p_query,p_page,p_page_size
  );
end;
$$;

revoke all on function public.search_guardian_directory_page(uuid,text,integer,integer) from public, anon;
grant execute on function public.search_guardian_directory_page(uuid,text,integer,integer) to authenticated;

comment on function app_private.is_guardian_current_school(uuid) is
'Deterministic current-school predicate for guardian operations. Platform Admin retains governed oversight; Platform Support receives no operational override.';
comment on function public.search_guardian_directory(uuid,text,integer) is
'Guardian directory search guarded to deterministic current school while preserving #211 effective enrolment, relationship and contact filtering.';
comment on function public.search_guardian_directory_page(uuid,text,integer,integer) is
'Paged guardian directory search guarded to deterministic current school while preserving #211 effective enrolment, relationship and contact filtering.';
