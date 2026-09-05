drop trigger if exists guardian_absence_notice_actor_integrity_trg
  on public.guardian_absence_notices;

drop trigger if exists guardian_absence_notice_submit_review_actor_integrity_trg
  on public.guardian_absence_notices;

create trigger guardian_absence_notice_submit_review_actor_integrity_trg
before insert or update of submitted_by_user_id, reviewed_by_user_id, reviewed_at,
  review_note, status, tenant_id, school_id, learner_id, enrolment_id, guardian_id
on public.guardian_absence_notices
for each row execute function app_private.enforce_guardian_absence_notice_actor_integrity();

comment on trigger guardian_absence_notice_submit_review_actor_integrity_trg
on public.guardian_absence_notices is
'Runs after the scope-integrity trigger by name so malformed scope is rejected first, then binds valid-scope submission/review actors.';
