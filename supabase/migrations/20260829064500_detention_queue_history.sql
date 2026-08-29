-- Keep operational detention queue concise while retaining a complete historical
-- view for learner discipline review. Completed/waived obligations never remain in
-- the open queue.

create or replace view public.late_detention_open_queue with (security_invoker=true) as
select
  d.id,
  d.tenant_id,
  d.school_id,
  d.learner_id,
  d.qualifying_week_start,
  d.qualifying_late_count,
  d.due_on,
  d.status,
  d.resolution_note,
  d.created_at,
  d.updated_at,
  l.first_names,
  l.surname,
  e.admission_number,
  g.display_name as grade_name,
  rc.display_name as class_name
from public.late_detention_obligations d
join public.learners l on l.id=d.learner_id
left join lateral (
  select enrol.* from public.enrolments enrol
  where enrol.learner_id=d.learner_id and enrol.school_id=d.school_id
  order by (enrol.status='current') desc,enrol.academic_year desc,enrol.created_at desc
  limit 1
) e on true
left join public.grades g on g.id=e.grade_id
left join public.register_classes rc on rc.id=e.register_class_id
where d.status in ('pending','carried_forward');

grant select on public.late_detention_open_queue to authenticated;

create or replace view public.late_detention_history with (security_invoker=true) as
select
  d.id,
  d.tenant_id,
  d.school_id,
  d.learner_id,
  d.qualifying_week_start,
  d.qualifying_late_count,
  d.due_on,
  d.status,
  d.completed_at,
  d.completed_by_user_id,
  d.resolution_note,
  d.created_at,
  d.updated_at,
  count(distinct si.id) as detention_session_count,
  max(ds.session_date) filter (where si.id is not null) as latest_session_date,
  max(si.attendance_status) filter (where si.id is not null) as latest_recorded_outcome
from public.late_detention_obligations d
left join public.detention_session_items si on si.obligation_id=d.id
left join public.detention_sessions ds on ds.id=si.detention_session_id
group by d.id;

grant select on public.late_detention_history to authenticated;

comment on view public.late_detention_open_queue is
'Operational detention work only: pending and carried-forward obligations. Resolved obligations are intentionally excluded.';
comment on view public.late_detention_history is
'Historical detention obligations including completed/waived outcomes and linked detention sessions.';
