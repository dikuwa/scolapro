-- Replace the late-arrival workspace's full-year event fan-out with one aggregated
-- roster read. The UI still receives the current roster for quick morning entry, but
-- PostgreSQL now computes yearly counters, weekly dates and latest-event metadata.

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
  if not app_private.has_school_access(p_school_id) then
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
  order by lower(l.surname),lower(l.first_names),e.id;
end;
$$;

revoke all on function public.list_late_arrival_roster_summary(uuid,integer,date,date) from public,anon;
grant execute on function public.list_late_arrival_roster_summary(uuid,integer,date,date) to authenticated;

comment on function public.list_late_arrival_roster_summary(uuid,integer,date,date) is
'Aggregated current learner roster for late-arrival entry. Yearly event counts, current-week late dates and latest event are calculated in PostgreSQL rather than loading all event rows into the application.';