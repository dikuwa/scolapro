-- Issue #485: detention obligation lifecycle visibility.
-- Reuse the canonical late_detention_obligations ledger and immutable session outcomes.
-- This migration adds read models only: no parallel detention state and no punishment policy.

create or replace function public.get_detention_obligation_summary(
  p_school_id uuid,
  p_query text default null
)
returns table(
  outstanding_obligations bigint,
  overdue_obligations bigint,
  partial_learners bigint,
  completed_obligations bigint,
  missed_outstanding_obligations bigint,
  multiple_outstanding_learners bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if not app_private.can_read_current_detention_school(p_school_id, current_date) then
    raise exception 'Permission denied';
  end if;

  return query
  with base as (
    select
      h.id,
      h.learner_id,
      h.status,
      h.due_on,
      h.first_names,
      h.surname,
      h.admission_number,
      h.grade_name,
      h.class_name,
      (
        select count(*)::bigint
        from public.detention_session_items dsi
        where dsi.obligation_id = h.id
          and dsi.attendance_status = 'absent'
      ) as missed_session_count
    from public.late_detention_history h
    where h.school_id = p_school_id
  ),
  searched as (
    select b.*
    from base b
    where v_query is null
       or concat_ws(
            ' ',
            b.first_names,
            b.surname,
            b.admission_number,
            b.grade_name,
            b.class_name
          ) ilike '%' || v_query || '%'
  ),
  per_learner as (
    select
      s.learner_id,
      count(*) filter (
        where s.status in ('pending', 'carried_forward')
      )::bigint as outstanding_count,
      count(*) filter (
        where s.status = 'completed'
      )::bigint as completed_count
    from searched s
    group by s.learner_id
  )
  select
    count(*) filter (
      where s.status in ('pending', 'carried_forward')
    )::bigint,
    count(*) filter (
      where s.status in ('pending', 'carried_forward')
        and (
          s.status = 'carried_forward'
          or s.due_on < current_date
          or s.missed_session_count > 0
        )
    )::bigint,
    (
      select count(*)::bigint
      from per_learner pl
      where pl.outstanding_count > 0
        and pl.completed_count > 0
    ),
    count(*) filter (
      where s.status = 'completed'
    )::bigint,
    count(*) filter (
      where s.status in ('pending', 'carried_forward')
        and s.missed_session_count > 0
    )::bigint,
    (
      select count(*)::bigint
      from per_learner pl
      where pl.outstanding_count > 1
    )
  from searched s;
end;
$$;

revoke all on function public.get_detention_obligation_summary(uuid,text)
from public, anon;
grant execute on function public.get_detention_obligation_summary(uuid,text)
to authenticated;

comment on function public.get_detention_obligation_summary(uuid,text) is
'Current-school-authorized detention lifecycle summary derived from canonical obligations and immutable session outcomes. Partial means a learner has both completed and still-outstanding obligations; no punishment threshold is inferred.';

create or replace function public.list_detention_obligation_tracking(
  p_school_id uuid,
  p_query text default null,
  p_lifecycle text default 'all',
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
  currently_enrolled boolean,
  missed_session_count bigint,
  learner_outstanding_count bigint,
  learner_overdue_count bigint,
  learner_completed_count bigint,
  learner_missed_session_count bigint,
  total_learner_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_lifecycle text := lower(btrim(coalesce(p_lifecycle, 'all')));
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 50);
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if v_lifecycle not in ('all', 'outstanding', 'overdue', 'partial', 'completed') then
    raise exception 'Invalid detention lifecycle filter';
  end if;

  if not app_private.can_read_current_detention_school(p_school_id, current_date) then
    raise exception 'Permission denied';
  end if;

  return query
  with base as (
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
      coalesce(h.rollover_count, 0) as rollover_count,
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
      exists (
        select 1
        from public.enrolments enrolment
        where enrolment.school_id = p_school_id
          and enrolment.learner_id = h.learner_id
          and enrolment.status = 'current'
          and enrolment.enrolled_from <= current_date
          and (enrolment.enrolled_to is null or enrolment.enrolled_to >= current_date)
      ) as currently_enrolled,
      (
        select count(*)::bigint
        from public.detention_session_items dsi
        where dsi.obligation_id = h.id
          and dsi.attendance_status = 'absent'
      ) as missed_session_count
    from public.late_detention_history h
    where h.school_id = p_school_id
  ),
  searched as (
    select b.*
    from base b
    where v_query is null
       or concat_ws(
            ' ',
            b.first_names,
            b.surname,
            b.admission_number,
            b.grade_name,
            b.class_name
          ) ilike '%' || v_query || '%'
  ),
  per_learner as (
    select
      s.learner_id,
      min(lower(trim(concat(s.first_names, ' ', s.surname)))) as sort_name,
      count(*) filter (
        where s.status in ('pending', 'carried_forward')
      )::bigint as outstanding_count,
      count(*) filter (
        where s.status in ('pending', 'carried_forward')
          and (
            s.status = 'carried_forward'
            or s.due_on < current_date
            or s.missed_session_count > 0
          )
      )::bigint as overdue_count,
      count(*) filter (
        where s.status = 'completed'
      )::bigint as completed_count,
      coalesce(sum(s.missed_session_count), 0)::bigint as missed_session_count
    from searched s
    group by s.learner_id
  ),
  matching_learners as (
    select pl.*
    from per_learner pl
    where v_lifecycle = 'all'
       or (v_lifecycle = 'outstanding' and pl.outstanding_count > 0)
       or (v_lifecycle = 'overdue' and pl.overdue_count > 0)
       or (
         v_lifecycle = 'partial'
         and pl.outstanding_count > 0
         and pl.completed_count > 0
       )
       or (v_lifecycle = 'completed' and pl.completed_count > 0)
  ),
  numbered as (
    select
      ml.*,
      count(*) over() as total_learner_count,
      row_number() over(order by ml.sort_name, ml.learner_id) as row_num
    from matching_learners ml
  ),
  page_learners as (
    select n.*
    from numbered n
    where n.row_num > ((v_page - 1) * v_page_size)
      and n.row_num <= (v_page * v_page_size)
  )
  select
    s.id,
    s.learner_id,
    s.first_names,
    s.surname,
    s.admission_number,
    s.grade_name,
    s.class_name,
    s.academic_year,
    s.triggered_on,
    s.original_due_on,
    s.due_on,
    s.rollover_count,
    s.assigned_staff_member_id,
    s.supervisor_first_name,
    s.supervisor_last_name,
    s.status,
    s.completed_at,
    s.resolution_note,
    s.detention_session_count,
    s.latest_session_date,
    s.latest_recorded_outcome,
    s.created_at,
    s.currently_enrolled,
    s.missed_session_count,
    pl.outstanding_count,
    pl.overdue_count,
    pl.completed_count,
    pl.missed_session_count,
    pl.total_learner_count
  from page_learners pl
  join searched s on s.learner_id = pl.learner_id
  order by pl.sort_name, s.learner_id, s.due_on desc, s.id;
end;
$$;

revoke all on function public.list_detention_obligation_tracking(uuid,text,text,integer,integer)
from public, anon;
grant execute on function public.list_detention_obligation_tracking(uuid,text,text,integer,integer)
to authenticated;

comment on function public.list_detention_obligation_tracking(uuid,text,text,integer,integer) is
'Permission-aware detention obligation tracker over the canonical ledger. Lifecycle filters select learner groups while returned rows retain complete obligation provenance for each selected learner.';
