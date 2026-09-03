-- Day-to-day operational learner selectors must represent learners whose current-status
-- enrolment is actually effective today. Administrative/planning/reporting surfaces may
-- intentionally include future or historical enrolments and are not changed here.

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
  ) and not app_private.has_platform_role(array['platform_admin']) then
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

revoke all on function public.search_operational_learner_directory(uuid,text,integer)
from public,anon;
grant execute on function public.search_operational_learner_directory(uuid,text,integer)
to authenticated;

create or replace function public.list_late_arrival_roster_summary(
  p_school_id uuid,
  p_academic_year integer,
  p_week_start date,
  p_week_end date
)
returns table(
  enrolment_id uuid,
  learner_id uuid,
  learner_name text,
  admission_number text,
  class_name text,
  trigger_progress integer,
  trigger_threshold integer,
  total_late_count integer,
  week_late_dates date[],
  last_late_date date
)
language plpgsql
stable
security definer
set search_path=public,app_private
as $$
declare
  v_threshold integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not (
    app_private.can_view_operational_learners(p_school_id)
    or app_private.has_school_duty(p_school_id,'late_arrival_recorder')
  ) then
    raise exception 'Permission denied';
  end if;
  if p_week_end<p_week_start then
    raise exception 'Invalid week range';
  end if;

  select greatest(1,coalesce(p.cumulative_threshold,3))
    into v_threshold
  from public.school_late_arrival_policies p
  where p.school_id=p_school_id
    and p.active=true
  order by p.updated_at desc
  limit 1;
  v_threshold:=coalesce(v_threshold,3);

  return query
  with event_summary as (
    select
      ev.learner_id,
      count(*)::integer as total_late_count,
      coalesce(
        array_agg(ev.arrival_date order by ev.arrival_date)
          filter (where ev.arrival_date between p_week_start and p_week_end),
        array[]::date[]
      ) as week_late_dates,
      max(ev.arrival_date) as last_late_date
    from public.school_late_arrival_events ev
    where ev.school_id=p_school_id
      and ev.arrival_date>=make_date(p_academic_year,1,1)
      and ev.arrival_date<make_date(p_academic_year+1,1,1)
    group by ev.learner_id
  )
  select
    e.id,
    e.learner_id,
    trim(concat(l.first_names,' ',l.surname)),
    e.admission_number,
    coalesce(rc.display_name,'Class'),
    mod(coalesce(es.total_late_count,0),v_threshold),
    v_threshold,
    coalesce(es.total_late_count,0),
    coalesce(es.week_late_dates,array[]::date[]),
    es.last_late_date
  from public.enrolments e
  join public.learners l on l.id=e.learner_id
  left join public.register_classes rc on rc.id=e.register_class_id
  left join event_summary es on es.learner_id=e.learner_id
  where e.school_id=p_school_id
    and e.academic_year=p_academic_year
    and e.status='current'
    and e.enrolled_from<=current_date
    and (e.enrolled_to is null or e.enrolled_to>=current_date)
  order by lower(l.surname),lower(l.first_names),e.id;
end;
$$;

revoke all on function public.list_late_arrival_roster_summary(uuid,integer,date,date)
from public,anon;
grant execute on function public.list_late_arrival_roster_summary(uuid,integer,date,date)
to authenticated;

comment on function public.search_operational_learner_directory(uuid,text,integer) is
'Operational learner selector limited to current-status school enrolments whose effective period includes today.';
comment on function public.list_late_arrival_roster_summary(uuid,integer,date,date) is
'Late-arrival operational roster limited to current-status school enrolments whose effective period includes today.';
