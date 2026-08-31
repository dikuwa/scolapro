-- Page detention history by learner group so one learner's obligations are never split
-- across pages. Search executes before paging; all obligations for selected learners
-- are returned together for the existing expandable history UI.

create or replace function public.list_detention_history_page(
  p_school_id uuid,
  p_query text default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns table(
  id uuid,
  learner_id uuid,
  first_names text,
  surname text,
  admission_number text,
  grade_name text,
  class_name text,
  academic_year integer,
  triggered_on date,
  original_due_on date,
  due_on date,
  rollover_count integer,
  assigned_staff_member_id uuid,
  supervisor_first_name text,
  supervisor_last_name text,
  status text,
  completed_at timestamptz,
  resolution_note text,
  detention_session_count bigint,
  latest_session_date date,
  latest_recorded_outcome text,
  created_at timestamptz,
  total_learner_count bigint
)
language plpgsql
stable
security definer
set search_path=public,app_private
as $$
declare
  v_query text := nullif(btrim(coalesce(p_query,'')), '');
  v_page integer := greatest(coalesce(p_page,1),1);
  v_page_size integer := least(greatest(coalesce(p_page_size,25),1),50);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    app_private.can_view_operational_learners(p_school_id)
    or app_private.has_school_duty(p_school_id,'late_arrival_recorder')
  ) then raise exception 'Permission denied'; end if;

  return query
  with matching_learners as (
    select
      h.learner_id,
      min(lower(trim(concat(h.first_names,' ',h.surname)))) as sort_name
    from public.late_detention_history h
    where h.school_id=p_school_id
      and (
        v_query is null
        or concat_ws(' ',h.first_names,h.surname,h.admission_number,h.grade_name,h.class_name) ilike '%'||v_query||'%'
      )
    group by h.learner_id
  ), numbered as (
    select
      ml.learner_id,
      ml.sort_name,
      count(*) over() as total_learner_count,
      row_number() over(order by ml.sort_name,ml.learner_id) as row_num
    from matching_learners ml
  ), page_learners as (
    select n.learner_id,n.total_learner_count
    from numbered n
    where n.row_num>((v_page-1)*v_page_size)
      and n.row_num<=v_page*v_page_size
  )
  select
    h.id,
    h.learner_id,
    h.first_names,
    h.surname,
    h.admission_number,
    h.grade_name,
    h.class_name,
    h.academic_year,
    h.triggered_on,
    h.original_due_on,
    h.due_on,
    coalesce(h.rollover_count,0),
    h.assigned_staff_member_id,
    h.supervisor_first_name,
    h.supervisor_last_name,
    h.status,
    h.completed_at,
    h.resolution_note,
    h.detention_session_count,
    h.latest_session_date,
    h.latest_recorded_outcome,
    h.created_at,
    pl.total_learner_count
  from page_learners pl
  join public.late_detention_history h on h.learner_id=pl.learner_id and h.school_id=p_school_id
  order by lower(trim(concat(h.first_names,' ',h.surname))),h.learner_id,h.due_on desc,h.id;
end;
$$;

revoke all on function public.list_detention_history_page(uuid,text,integer,integer) from public,anon;
grant execute on function public.list_detention_history_page(uuid,text,integer,integer) to authenticated;

comment on function public.list_detention_history_page(uuid,text,integer,integer) is
'Permission-aware detention history paged by learner groups. Search happens in PostgreSQL before paging and all obligations for each selected learner remain together.';