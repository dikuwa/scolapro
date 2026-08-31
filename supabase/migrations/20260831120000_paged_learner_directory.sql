-- Bound the learner directory at the database boundary so large schools do not
-- ship the full enrolment table to the browser before search/filtering.

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
set search_path=public,app_private
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not app_private.has_school_access(p_school_id) then
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
    and (p_status is null or p_status='' or p_status='all' or e.status::text=p_status)
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

revoke all on function public.list_learner_directory_page(uuid,integer,text,text,text,text,text,boolean,integer,integer) from public,anon;
grant execute on function public.list_learner_directory_page(uuid,integer,text,text,text,text,text,boolean,integer,integer) to authenticated;

comment on function public.list_learner_directory_page(uuid,integer,text,text,text,text,text,boolean,integer,integer) is
'Authenticated school-scoped paged learner directory. Search/filter/sort execute in PostgreSQL before at most 100 rows are returned.';
