create or replace function public.list_my_detention_supervision(
  p_include_resolved boolean default false,
  p_page integer default 1,
  p_page_size integer default 25
)
returns table(
  obligation_id uuid,
  school_id uuid,
  learner_id uuid,
  learner_first_names text,
  learner_surname text,
  academic_year integer,
  triggered_on date,
  original_due_on date,
  due_on date,
  qualifying_late_count smallint,
  rollover_count integer,
  status text,
  completed_at timestamptz,
  resolution_note text,
  can_complete boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_user_id uuid := auth.uid();
  v_page integer := greatest(coalesce(p_page,1),1);
  v_page_size integer := least(greatest(coalesce(p_page_size,25),1),50);
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  return query
  with caller_staff as (
    select sm.id
    from public.staff_members sm
    where sm.user_id=v_user_id
      and sm.status='active'
  ), scoped as (
    select
      o.id as obligation_id,
      o.school_id,
      o.learner_id,
      l.first_names,
      l.surname,
      o.academic_year,
      o.triggered_on,
      o.original_due_on,
      o.due_on,
      o.qualifying_late_count,
      coalesce(o.rollover_count,0) as rollover_count,
      o.status,
      o.completed_at,
      o.resolution_note,
      (
        o.status in ('pending','carried_forward')
        and app_private.staff_member_has_school_assignment(o.assigned_staff_member_id,o.school_id,o.due_on)
      ) as can_complete,
      count(*) over() as total_count
    from public.late_detention_obligations o
    join caller_staff cs on cs.id=o.assigned_staff_member_id
    join public.learners l on l.id=o.learner_id
    where (coalesce(p_include_resolved,false) or o.status in ('pending','carried_forward'))
  )
  select
    s.obligation_id,
    s.school_id,
    s.learner_id,
    s.first_names,
    s.surname,
    s.academic_year,
    s.triggered_on,
    s.original_due_on,
    s.due_on,
    s.qualifying_late_count,
    s.rollover_count,
    s.status,
    s.completed_at,
    s.resolution_note,
    s.can_complete,
    s.total_count
  from scoped s
  order by
    case when s.status in ('pending','carried_forward') then 0 else 1 end,
    s.due_on asc,
    lower(trim(concat(s.first_names,' ',s.surname))),
    s.obligation_id
  offset ((v_page-1)*v_page_size)
  limit v_page_size;
end;
$$;

revoke all on function public.list_my_detention_supervision(boolean,integer,integer) from public,anon;
grant execute on function public.list_my_detention_supervision(boolean,integer,integer) to authenticated;

comment on function public.list_my_detention_supervision(boolean,integer,integer) is
'Self-scoped detention-supervision read model. Returns only obligations assigned to the signed-in active staff identity, with bounded paging and due-date-valid completion readiness, without granting school-wide detention or learner access.';
