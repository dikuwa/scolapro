-- Conduct Policy Slice 5: management Conduct view and derived policy usage analytics.

create or replace function app_private.can_view_conduct_management(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select (select auth.uid()) is not null
    and app_private.user_current_school_matches((select auth.uid()),p_school_id)
    and app_private.has_school_role(
      p_school_id,
      array['school_admin','principal','deputy_principal','hod']
    );
$$;

revoke all on function app_private.can_view_conduct_management(uuid)
from public,anon,authenticated;

create function public.get_conduct_management_view(
  p_school_id uuid,
  p_academic_year integer,
  p_query text default '',
  p_grade_id uuid default null,
  p_class_id uuid default null,
  p_attention_only boolean default false,
  p_repeated_only boolean default false,
  p_page integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_start date;
  v_end date;
  v_result jsonb;
begin
  if not app_private.can_view_conduct_management(p_school_id) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  select
    coalesce(ay.starts_on,make_date(p_academic_year,1,1)),
    coalesce(ay.ends_on,make_date(p_academic_year,12,31))
  into v_start,v_end
  from public.academic_years ay
  where ay.school_id=p_school_id and ay.year=p_academic_year
  limit 1;

  if v_start is null then
    v_start:=make_date(p_academic_year,1,1);
    v_end:=make_date(p_academic_year,12,31);
  end if;

  with current_roster as (
    select distinct on (e.learner_id)
      e.learner_id,
      l.first_names||' '||l.surname as learner_name,
      rc.id as class_id,
      rc.display_name as class_name,
      g.id as grade_id,
      g.display_name as grade_name
    from public.enrolments e
    join public.learners l on l.id=e.learner_id
    left join public.register_classes rc on rc.id=e.register_class_id
    left join public.grades g on g.id=rc.grade_id
    where e.school_id=p_school_id
      and e.status='current'
      and e.enrolled_from<=current_date
      and (e.enrolled_to is null or e.enrolled_to>=current_date)
    order by e.learner_id,e.enrolled_from desc,e.id
  ),
  scoped_events as (
    select
      e.id,
      e.learner_id,
      e.occurred_on,
      case when e.direction='positive' then 'recognition' else 'violation' end as type,
      coalesce(e.category_snapshot#>>'{group,display_name}','Ungrouped') as group_name,
      coalesce(e.category_snapshot->>'display_name',e.summary,e.category_code) as item_name,
      case
        when coalesce(e.category_snapshot->>'points','') ~ '^-?[0-9]+$'
          then (e.category_snapshot->>'points')::integer
        else 0
      end as points,
      coalesce((e.category_snapshot->>'requires_management_attention')::boolean,false) as management_attention
    from public.conduct_events e
    where e.school_id=p_school_id
      and e.occurred_on between v_start and v_end
  ),
  repeated_groups as (
    select learner_id,group_name,count(*)::integer as group_events
    from scoped_events
    where type='violation'
    group by learner_id,group_name
    having count(*)>=3
  ),
  learner_stats as (
    select
      r.learner_id,
      r.learner_name,
      r.grade_id,
      r.grade_name,
      r.class_id,
      r.class_name,
      count(se.id) filter(where se.type='recognition')::integer as recognition_count,
      count(se.id) filter(where se.type='violation')::integer as violation_count,
      coalesce(sum(se.points) filter(where se.type='recognition'),0)::integer as recognition_points,
      coalesce(sum(se.points) filter(where se.type='violation'),0)::integer as violation_points,
      coalesce(sum(se.points),0)::integer as net_points,
      count(se.id) filter(where se.management_attention)::integer as attention_event_count,
      coalesce((select count(*)::integer from repeated_groups rg where rg.learner_id=r.learner_id),0) as repeated_pattern_count,
      max(se.occurred_on) as last_event_on
    from current_roster r
    left join scoped_events se on se.learner_id=r.learner_id
    group by r.learner_id,r.learner_name,r.grade_id,r.grade_name,r.class_id,r.class_name
  ),
  filtered as (
    select *
    from learner_stats s
    where (p_grade_id is null or s.grade_id=p_grade_id)
      and (p_class_id is null or s.class_id=p_class_id)
      and (
        coalesce(btrim(p_query),'')=''
        or s.learner_name ilike '%'||btrim(p_query)||'%'
      )
      and (not p_attention_only or s.attention_event_count>0)
      and (not p_repeated_only or s.repeated_pattern_count>0)
  ),
  page_window as (
    select *
    from filtered
    order by
      case when attention_event_count>0 then 0 else 1 end,
      case when repeated_pattern_count>0 then 0 else 1 end,
      violation_count desc,
      learner_name
    limit 51
    offset greatest(0,least(coalesce(p_page,0),10000))*50
  ),
  page_rows as (
    select * from page_window limit 50
  ),
  policy_usage as (
    select
      type,
      group_name,
      item_name,
      count(*)::integer as event_count,
      count(distinct learner_id)::integer as learner_count,
      coalesce(sum(points),0)::integer as points
    from scoped_events
    group by type,group_name,item_name
    order by count(*) desc,item_name
    limit 20
  ),
  overall as (
    select
      (select count(*)::integer from current_roster) as active_learners,
      count(distinct se.learner_id)::integer as learners_with_records,
      count(*) filter(where se.type='recognition')::integer as recognition_count,
      count(*) filter(where se.type='violation')::integer as violation_count,
      count(*) filter(where se.management_attention)::integer as attention_event_count,
      (select count(distinct learner_id)::integer from repeated_groups) as learners_with_repeated_patterns
    from scoped_events se
  )
  select jsonb_build_object(
    'academicYear',p_academic_year,
    'summary',to_jsonb(overall),
    'learners',coalesce((select jsonb_agg(to_jsonb(r)) from page_rows r),'[]'::jsonb),
    'hasMore',(select count(*)>50 from page_window),
    'policyUsage',coalesce((select jsonb_agg(to_jsonb(u)) from policy_usage u),'[]'::jsonb)
  )
  into v_result
  from overall;

  return v_result;
end;
$$;

revoke all on function public.get_conduct_management_view(uuid,integer,text,uuid,uuid,boolean,boolean,integer)
from public,anon;
grant execute on function public.get_conduct_management_view(uuid,integer,text,uuid,uuid,boolean,boolean,integer)
to authenticated;

comment on function public.get_conduct_management_view(uuid,integer,text,uuid,uuid,boolean,boolean,integer) is
'Current-school leadership Conduct dashboard with learner summaries, explicit attention/repeated-pattern indicators, policy usage analytics and pagination. Indicators support review and do not classify learners.';
