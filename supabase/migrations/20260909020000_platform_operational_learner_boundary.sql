-- Platform administration authority is not, by itself, learner-operational authority.
-- Keep tenant/school provisioning powers separate from school-scoped learner visibility.

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
  v_limit integer:=greatest(1,least(coalesce(p_limit,30),100));
  v_query text:=lower(btrim(coalesce(p_query,'')));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  if not app_private.has_school_role(
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
    and e.enrolled_from<=current_date
    and (e.enrolled_to is null or e.enrolled_to>=current_date)
    and (
      app_private.has_school_role(
        p_school_id,
        array['school_admin','principal','deputy_principal','counsellor','hod','librarian']
      )
      or app_private.can_access_learner_observations(p_school_id,l.id)
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

revoke all on function public.search_operational_learner_directory(uuid,text,integer)
from public,anon;
grant execute on function public.search_operational_learner_directory(uuid,text,integer)
to authenticated;

comment on function public.search_operational_learner_directory(uuid,text,integer) is
'Operational learner selector for authorized school roles only. Platform administration authority alone does not grant learner-operational visibility.';
