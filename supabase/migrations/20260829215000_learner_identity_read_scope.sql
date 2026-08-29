-- Raw learner/enrolment rows contain identity and placement data and should not be
-- a school-wide directory for every operational role. Leadership/counsellor keep
-- school-wide access; assigned teachers see learners they actually teach. HOD and
-- librarian workflows use a deliberately minimal lookup RPC instead of raw PII.

create or replace function app_private.can_read_learner_identity(
  p_school_id uuid,
  p_learner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or exists(
      select 1 from public.school_memberships sm
      where sm.school_id=p_school_id
        and sm.user_id=(select auth.uid())
        and sm.role_key in ('school_admin','principal','deputy_principal','counsellor')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    )
    or app_private.can_access_learner_observations(p_school_id,p_learner_id);
$$;

revoke all on function app_private.can_read_learner_identity(uuid,uuid) from public,anon;
grant execute on function app_private.can_read_learner_identity(uuid,uuid) to authenticated;

drop policy if exists "authorized staff can read enrolled learners" on public.learners;
drop policy if exists "members can read enrolled learners" on public.learners;
create policy "scoped staff read learner identities"
on public.learners for select to authenticated
using (
  exists(
    select 1 from public.enrolments e
    where e.learner_id=learners.id
      and app_private.can_read_learner_identity(e.school_id,learners.id)
  )
);

drop policy if exists "authorized staff can read school enrolments" on public.enrolments;
drop policy if exists "members can read school enrolments" on public.enrolments;
create policy "scoped staff read enrolments"
on public.enrolments for select to authenticated
using (app_private.can_read_learner_identity(school_id,learner_id));

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
set search_path=public,app_private
as $$
declare
  v_limit integer := greatest(1,least(coalesce(p_limit,30),100));
  v_query text := lower(btrim(coalesce(p_query,'')));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal','counsellor','hod','teacher','class_teacher','librarian'])
     and not app_private.has_platform_role(array['platform_admin']) then
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
    and (e.enrolled_to is null or e.enrolled_to>=current_date)
    and (
      app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal','counsellor','hod','librarian'])
      or app_private.can_access_learner_observations(p_school_id,l.id)
      or app_private.has_platform_role(array['platform_admin'])
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

revoke all on function public.search_operational_learner_directory(uuid,text,integer) from public,anon;
grant execute on function public.search_operational_learner_directory(uuid,text,integer) to authenticated;

comment on function app_private.can_read_learner_identity(uuid,uuid) is 'Raw learner identity scope: leadership/counsellor, platform admin, or staff actually assigned to the learner.';
comment on function public.search_operational_learner_directory(uuid,text,integer) is 'Minimal school learner lookup for operational workflows. It intentionally omits DOB, sex, national ID, birth certificate and guardian data.';