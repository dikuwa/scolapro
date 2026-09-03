drop trigger if exists attendance_events_learner_temporal_scope_guard on public.attendance_events;
create trigger attendance_events_learner_temporal_scope_guard
before insert or update on public.attendance_events
for each row execute function app_private.enforce_learner_event_enrolment_period('attendance_date', 'enrolment_id');

comment on function app_private.enforce_learner_event_enrolment_period() is
'Ensures dated learner operational/history records, including attendance, conduct, achievement and support records, fall inside the learner school-enrolment period represented by the row.';
