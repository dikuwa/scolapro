-- Expose detention history using cumulative-obligation semantics while retaining
-- legacy fields for older records that pre-date the cumulative model.
-- The existing view has a different column order, so recreate it explicitly.

drop view if exists public.late_detention_history;

create view public.late_detention_history with (security_invoker=true) as
select
  d.id,
  d.tenant_id,
  d.school_id,
  d.learner_id,
  d.academic_year,
  d.triggered_on,
  d.original_due_on,
  d.due_on,
  d.rollover_count,
  d.assigned_staff_member_id,
  supervisor.first_name as supervisor_first_name,
  supervisor.last_name as supervisor_last_name,
  d.status,
  d.completed_at,
  d.completed_by_user_id,
  d.resolution_note,
  d.created_at,
  d.updated_at,
  d.qualifying_week_start,
  d.qualifying_late_count,
  learner.first_names,
  learner.surname,
  current_enrolment.admission_number,
  grade.display_name as grade_name,
  register_class.display_name as class_name,
  count(distinct session_item.id) as detention_session_count,
  max(session.session_date) filter (where session_item.id is not null) as latest_session_date,
  max(session_item.attendance_status) filter (where session_item.id is not null) as latest_recorded_outcome
from public.late_detention_obligations d
join public.learners learner on learner.id=d.learner_id
left join public.staff_members supervisor on supervisor.id=d.assigned_staff_member_id
left join lateral (
  select enrolment.*
  from public.enrolments enrolment
  where enrolment.learner_id=d.learner_id
    and enrolment.school_id=d.school_id
  order by (enrolment.status='current') desc,
           (enrolment.academic_year=d.academic_year) desc,
           enrolment.academic_year desc,
           enrolment.created_at desc
  limit 1
) current_enrolment on true
left join public.grades grade on grade.id=current_enrolment.grade_id
left join public.register_classes register_class on register_class.id=current_enrolment.register_class_id
left join public.detention_session_items session_item on session_item.obligation_id=d.id
left join public.detention_sessions session on session.id=session_item.detention_session_id
group by
  d.id,
  learner.first_names,
  learner.surname,
  supervisor.first_name,
  supervisor.last_name,
  current_enrolment.admission_number,
  grade.display_name,
  register_class.display_name;

grant select on public.late_detention_history to authenticated;

comment on view public.late_detention_history is
'Learner detention history with cumulative trigger dates, original/current due dates, rollover state, supervision and linked session outcomes.';
