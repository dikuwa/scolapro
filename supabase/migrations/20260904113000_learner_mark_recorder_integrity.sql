create or replace function app_private.user_can_access_assessment_instance(
  p_user_id uuid,
  p_assessment_instance_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists(
    select 1
    from public.assessment_instances ai
    where ai.id = p_assessment_instance_id
      and app_private.user_can_manage_assessment_instance_scope(
        p_user_id,
        ai.school_id,
        ai.academic_year,
        ai.subject_offering_id,
        ai.register_class_id,
        ai.teacher_allocation_id
      )
  );
$$;

revoke all on function app_private.user_can_access_assessment_instance(uuid,uuid)
  from public, anon, authenticated;

comment on function app_private.user_can_access_assessment_instance(uuid,uuid) is
'Arbitrary-user mirror of assessment-instance access authority for physical learner-mark recorder validation.';

create or replace function app_private.enforce_learner_mark_recorder_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if auth.uid() is not null
     and new.recorded_by_user_id is distinct from auth.uid() then
    raise exception 'Learner mark recorder must match authenticated actor';
  end if;

  if not app_private.user_can_access_assessment_instance(
    new.recorded_by_user_id,
    new.assessment_instance_id
  ) then
    raise exception 'Learner mark recorder is not authorized for assessment instance';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_learner_mark_recorder_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_learner_mark_recorder_integrity() is
'Prevents trusted or authenticated learner-mark inserts from crediting an account that lacks access to the assessment instance. Existing learner-mark scope integrity keeps recorder provenance immutable after creation.';

drop trigger if exists learner_mark_recorder_integrity_trg on public.learner_marks;
create trigger learner_mark_recorder_integrity_trg
before insert on public.learner_marks
for each row execute function app_private.enforce_learner_mark_recorder_integrity();
