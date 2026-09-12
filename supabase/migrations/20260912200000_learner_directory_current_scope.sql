-- Learner identity and directory reads are school-local operational surfaces.
-- Preserve Platform Admin's governed paged-directory/raw-identity oversight, while
-- preventing another still-active non-current school, stale staff placement, or
-- Platform Support from becoming a learner identity enumeration path.
-- Historical learner/enrolment rows remain stored; current operational reads are
-- evaluated against effective enrolment dates rather than rewriting provenance.

create or replace function app_private.can_access_current_school_learner_directory(
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or exists (
      select 1
      from (
        select sm.school_id, sm.staff_member_id
        from public.school_memberships sm
        where sm.user_id=(select auth.uid())
          and sm.active_from <= (now() at time zone 'Africa/Windhoek')::date
          and (sm.active_to is null or sm.active_to >= (now() at time zone 'Africa/Windhoek')::date)
        order by sm.active_from desc, sm.id asc
        limit 1
      ) current_membership
      where current_membership.school_id=p_school_id
        and (
          current_membership.staff_member_id is null
          or app_private.staff_member_has_school_assignment(
            current_membership.staff_member_id,
            p_school_id,
            (now() at time zone 'Africa/Windhoek')::date
          )
        )
    );
$$;

revoke all on function app_private.can_access_current_school_learner_directory(uuid)
from public,anon;
grant execute on function app_private.can_access_current_school_learner_directory(uuid)
to authenticated;

create or replace function app_private.can_read_learner_identity(
  p_school_id uuid,
  p_learner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or (
      app_private.can_access_current_school_learner_directory(p_school_id)
      and exists(
        select 1
        from public.enrolments e
        where e.school_id=p_school_id
          and e.learner_id=p_learner_id
          and e.status='current'
          and e.enrolled_from <= (now() at time zone 'Africa/Windhoek')::date
          and (e.enrolled_to is null or e.enrolled_to >= (now() at time zone 'Africa/Windhoek')::date)
      )
      and (
        app_private.has_school_local_role(
          p_school_id,
          array['school_admin','principal','deputy_principal','counsellor']
        )
        or app_private.can_access_learner_observations_school_scoped(p_school_id,p_learner_id)
      )
    );
$$;

revoke all on function app_private.can_read_learner_identity(uuid,uuid) from public,anon;
grant execute on function app_private.can_read_learner_identity(uuid,uuid) to authenticated;

create or replace function public.list_learner_directory_page(
  p_school_id uuid,
  p_academic_year integer,
  p_query text default null,
  p_status text default 'current',
  p_grade_name text default null,
  p_class_name text default null,
  p_sex text default null,
  p_sort_desc boolean default false,
  p_page integer default 1,
  p_page_size integer default 50
)
returns table(
  enrolment_id uuid,
  learner_id uuid,
  first_names text,
  surname text,
  preferred_name text,
  admission_number text,
  grade_name text,
  class_name text,
  enrolment_status text,
  sex text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_today date := (now() at time zone 'Africa/Windhoek')::date;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not app_private.can_access_current_school_learner_directory(p_school_id) then
    raise exception 'Permission denied';
  end if;

  return query
  select
    e.id,
    l.id,
    l.first_names,
    l.surname,
    l.preferred_name,
    e.admission_number,
    coalesce(g.display_name, 'Unassigned'),
    coalesce(rc.display_name, 'Unassigned'),
    e.status::text,
    coalesce(l.sex::text, 'unspecified'),
    count(*) over()
  from public.enrolments e
  join public.learners l on l.id=e.learner_id
  left join public.grades g on g.id=e.grade_id
  left join public.register_classes rc on rc.id=e.register_class_id
  where e.school_id=p_school_id
    and e.academic_year=p_academic_year
    and (
      p_status is null or p_status='' or p_status='all'
      or (
        p_status='current'
        and e.status='current'
        and e.enrolled_from<=v_today
        and (e.enrolled_to is null or e.enrolled_to>=v_today)
      )
      or (p_status<>'current' and e.status::text=p_status)
    )
    and (p_grade_name is null or p_grade_name='' or g.display_name=p_grade_name)
    and (p_class_name is null or p_class_name='' or rc.display_name=p_class_name)
    and (p_sex is null or p_sex='' or p_sex='all' or coalesce(l.sex::text,'unspecified')=p_sex)
    and (
      v_query is null
      or concat_ws(' ',l.first_names,l.surname,l.preferred_name,e.admission_number,g.display_name,rc.display_name) ilike '%' || v_query || '%'
    )
  order by
    case when not p_sort_desc then lower(l.surname) end asc nulls last,
    case when not p_sort_desc then lower(l.first_names) end asc nulls last,
    case when p_sort_desc then lower(l.surname) end desc nulls last,
    case when p_sort_desc then lower(l.first_names) end desc nulls last,
    e.id
  limit v_page_size
  offset (v_page-1)*v_page_size;
end;
$$;

create or replace function public.search_operational_learner_directory(
  p_school_id uuid,
  p_query text default null,
  p_limit integer default 30
)
returns table(
  learner_id uuid,
  enrolment_id uuid,
  display_name text,
  admission_number text,
  academic_year integer,
  grade_name text,
  class_name text
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_limit integer := greatest(1,least(coalesce(p_limit,30),100));
  v_query text := lower(btrim(coalesce(p_query,'')));
  v_today date := (now() at time zone 'Africa/Windhoek')::date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  -- Preserve the existing operational-role contract from #390, but bind that role
  -- to the deterministic current school and effective staff placement through #425.
  if not app_private.has_school_local_role(
    p_school_id,
    array['school_admin','principal','deputy_principal','counsellor','hod','teacher','class_teacher','librarian']
  ) then
    raise exception 'Permission denied';
  end if;

  return query
  select
    l.id,
    e.id,
    btrim(l.first_names||' '||l.surname),
    e.admission_number,
    e.academic_year,
    g.display_name,
    rc.display_name
  from public.enrolments e
  join public.learners l on l.id=e.learner_id
  left join public.grades g on g.id=e.grade_id
  left join public.register_classes rc on rc.id=e.register_class_id
  where e.school_id=p_school_id
    and e.status='current'
    and e.enrolled_from<=v_today
    and (e.enrolled_to is null or e.enrolled_to>=v_today)
    and (
      app_private.has_school_local_role(
        p_school_id,
        array['school_admin','principal','deputy_principal','counsellor','hod','librarian']
      )
      or app_private.can_access_learner_observations_school_scoped(p_school_id,l.id)
    )
    and (
      v_query=''
      or lower(l.first_names||' '||l.surname) like '%'||v_query||'%'
      or lower(coalesce(e.admission_number,'')) like '%'||v_query||'%'
      or lower(coalesce(g.display_name,'')) like '%'||v_query||'%'
      or lower(coalesce(rc.display_name,'')) like '%'||v_query||'%'
    )
  order by l.surname,l.first_names
  limit v_limit;
end;
$$;

revoke all on function public.list_learner_directory_page(uuid,integer,text,text,text,text,text,boolean,integer,integer)
from public,anon;
grant execute on function public.list_learner_directory_page(uuid,integer,text,text,text,text,text,boolean,integer,integer)
to authenticated;

revoke all on function public.search_operational_learner_directory(uuid,text,integer)
from public,anon;
grant execute on function public.search_operational_learner_directory(uuid,text,integer)
to authenticated;

comment on function app_private.can_access_current_school_learner_directory(uuid) is
'Learner identity-directory boundary: Platform Admin or the authenticated actor deterministic current school, with effective staff placement required for staff-linked membership. Platform Support has no override.';
comment on function app_private.can_read_learner_identity(uuid,uuid) is
'Raw learner identity scope: Platform Admin, or effective current-enrolment access in the actor deterministic current school under the existing role/assignment rules.';
comment on function public.list_learner_directory_page(uuid,integer,text,text,text,text,text,boolean,integer,integer) is
'Paged learner identity directory bound to deterministic current-school identity scope. Current status means an enrolment effective today; historical statuses remain queryable only within the authorized current school.';
comment on function public.search_operational_learner_directory(uuid,text,integer) is
'Operational learner selector bound to #425 deterministic current-school/effective-placement authority and effective current enrolments; Platform administration/support authority alone is insufficient.';
