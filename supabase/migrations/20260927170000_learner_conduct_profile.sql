-- Conduct Policy Slice 4: authorized learner Conduct profile read model.

create function public.get_learner_conduct_profile(
  p_school_id uuid,
  p_learner_id uuid,
  p_academic_year integer,
  p_page integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_year_start date;
  v_year_end date;
  v_result jsonb;
begin
  if (select auth.uid()) is null
    or not app_private.can_access_learner_observations(p_school_id,p_learner_id) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  select coalesce(ay.starts_on,make_date(p_academic_year,1,1)),
         coalesce(ay.ends_on,make_date(p_academic_year,12,31))
  into v_year_start,v_year_end
  from public.academic_years ay
  where ay.school_id=p_school_id and ay.year=p_academic_year
  limit 1;

  if v_year_start is null then
    v_year_start:=make_date(p_academic_year,1,1);
    v_year_end:=make_date(p_academic_year,12,31);
  end if;

  with scoped as (
    select
      e.id,
      e.occurred_on as event_date,
      case when e.direction='positive' then 'recognition' else 'violation' end as type,
      coalesce(e.category_snapshot#>>'{group,display_name}','Ungrouped') as group_name,
      coalesce(e.category_snapshot->>'display_name',e.summary,e.category_code) as item_name,
      case
        when coalesce(e.category_snapshot->>'points','') ~ '^-?[0-9]+$'
          then (e.category_snapshot->>'points')::integer
        else 0
      end as points,
      e.severity,
      e.details as note,
      coalesce((
        select nullif(btrim(concat_ws(' ',s.first_name,s.last_name)),'')
        from public.staff_members s
        where s.tenant_id=e.tenant_id and s.user_id=e.recorded_by_user_id
        order by s.status='active' desc,s.id
        limit 1
      ),'Staff member') as recorded_by,
      e.created_at,
      (
        select at.term_number
        from public.academic_terms at
        join public.academic_years ay on ay.id=at.academic_year_id
        where at.school_id=p_school_id
          and ay.year=p_academic_year
          and at.starts_on is not null
          and at.ends_on is not null
          and e.occurred_on between at.starts_on and at.ends_on
        order by at.term_number
        limit 1
      ) as term_number
    from public.conduct_events e
    where e.school_id=p_school_id
      and e.learner_id=p_learner_id
      and e.occurred_on between v_year_start and v_year_end
  ),
  summary as (
    select
      count(*) filter(where type='recognition')::integer as recognition_count,
      count(*) filter(where type='violation')::integer as violation_count,
      coalesce(sum(points) filter(where type='recognition'),0)::integer as recognition_points,
      coalesce(sum(points) filter(where type='violation'),0)::integer as violation_points,
      coalesce(sum(points),0)::integer as net_points
    from scoped
  ),
  breakdown as (
    select type,group_name,count(*)::integer as event_count,coalesce(sum(points),0)::integer as points
    from scoped
    group by type,group_name
  ),
  configured_terms as (
    select at.term_number,at.display_name,at.starts_on,at.ends_on
    from public.academic_terms at
    join public.academic_years ay on ay.id=at.academic_year_id
    where at.school_id=p_school_id and ay.year=p_academic_year
    order by at.term_number
  ),
  term_summary as (
    select
      t.term_number,
      t.display_name,
      t.starts_on,
      t.ends_on,
      count(s.id) filter(where s.type='recognition')::integer as recognition_count,
      count(s.id) filter(where s.type='violation')::integer as violation_count,
      coalesce(sum(s.points) filter(where s.type='recognition'),0)::integer as recognition_points,
      coalesce(sum(s.points) filter(where s.type='violation'),0)::integer as violation_points,
      coalesce(sum(s.points),0)::integer as net_points
    from configured_terms t
    left join scoped s on s.term_number=t.term_number
    group by t.term_number,t.display_name,t.starts_on,t.ends_on
    order by t.term_number
  ),
  timeline_window as (
    select * from scoped
    order by event_date desc,created_at desc,id desc
    limit 26 offset greatest(0,least(coalesce(p_page,0),10000))*25
  ),
  timeline_page as (
    select * from timeline_window
    order by event_date desc,created_at desc,id desc
    limit 25
  )
  select jsonb_build_object(
    'academicYear',p_academic_year,
    'summary',to_jsonb(summary),
    'breakdown',coalesce((select jsonb_agg(to_jsonb(b) order by b.type,b.group_name) from breakdown b),'[]'::jsonb),
    'terms',coalesce((select jsonb_agg(to_jsonb(t) order by t.term_number) from term_summary t),'[]'::jsonb),
    'timeline',coalesce((select jsonb_agg(to_jsonb(x) order by x.event_date desc,x.created_at desc,x.id desc) from timeline_page x),'[]'::jsonb),
    'hasMore',(select count(*)>25 from timeline_window)
  )
  into v_result
  from summary;

  return coalesce(v_result,jsonb_build_object(
    'academicYear',p_academic_year,
    'summary',jsonb_build_object('recognition_count',0,'violation_count',0,'recognition_points',0,'violation_points',0,'net_points',0),
    'breakdown','[]'::jsonb,
    'terms','[]'::jsonb,
    'timeline','[]'::jsonb,
    'hasMore',false
  ));
end;
$$;

revoke all on function public.get_learner_conduct_profile(uuid,uuid,integer,integer) from public,anon;
grant execute on function public.get_learner_conduct_profile(uuid,uuid,integer,integer) to authenticated;

comment on function public.get_learner_conduct_profile(uuid,uuid,integer,integer) is
'Authorized balanced learner Conduct profile with Recognition/Violation counts and points, governed academic-term comparison, group breakdown and paginated auditable timeline.';
