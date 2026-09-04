create or replace function app_private.user_can_access_learner_observations(
  p_user_id uuid,
  p_school_id uuid,
  p_learner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select exists(
      select 1
      from public.platform_memberships pm
      where pm.user_id=p_user_id
        and pm.role_key='platform_admin'
        and pm.active_from<=current_date
        and (pm.active_to is null or pm.active_to>=current_date)
    )
    or exists(
      select 1
      from public.school_memberships sm
      where sm.school_id=p_school_id
        and sm.user_id=p_user_id
        and sm.role_key in ('school_admin','principal','deputy_principal','counsellor')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    )
    or exists(
      select 1
      from public.enrolments e
      left join public.register_classes rc on rc.id=e.register_class_id
      left join public.staff_members register_staff on register_staff.id=rc.register_teacher_staff_id
      where e.school_id=p_school_id
        and e.learner_id=p_learner_id
        and e.status='current'
        and e.enrolled_from<=current_date
        and (e.enrolled_to is null or e.enrolled_to>=current_date)
        and (
          (
            register_staff.user_id=p_user_id
            and register_staff.status='active'
            and exists(
              select 1
              from public.school_memberships sm
              where sm.school_id=p_school_id
                and sm.user_id=p_user_id
                and sm.role_key='class_teacher'
                and sm.active_from<=current_date
                and (sm.active_to is null or sm.active_to>=current_date)
            )
          )
          or exists(
            select 1
            from public.teacher_allocations ta
            join public.staff_members teacher_staff on teacher_staff.id=ta.staff_member_id
            where ta.school_id=p_school_id
              and ta.register_class_id=e.register_class_id
              and ta.academic_year=e.academic_year
              and ta.active_from<=current_date
              and (ta.active_to is null or ta.active_to>=current_date)
              and teacher_staff.user_id=p_user_id
              and teacher_staff.status='active'
              and app_private.staff_member_has_school_assignment(
                teacher_staff.id,
                p_school_id,
                current_date
              )
          )
        )
    );
$$;

revoke all on function app_private.user_can_access_learner_observations(uuid,uuid,uuid)
  from public, anon, authenticated;

comment on function app_private.user_can_access_learner_observations(uuid,uuid,uuid) is
'Private arbitrary-actor equivalent of can_access_learner_observations, used only by physical provenance guards where auth.uid() cannot safely represent the recorded actor.';

create or replace function app_private.enforce_learner_observation_recorder_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if not app_private.user_can_access_learner_observations(
    new.recorded_by_user_id,
    new.school_id,
    new.learner_id
  ) then
    raise exception 'Learner observation recorder mismatch: user is not authorized for learner';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_learner_observation_recorder_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_learner_observation_recorder_integrity() is
'Prevents conduct and achievement rows from forging recorded_by_user_id through trusted/RLS-bypassing write paths while preserving the established learner-observation role and current-assignment semantics.';

drop trigger if exists conduct_event_recorder_integrity_trg on public.conduct_events;
create trigger conduct_event_recorder_integrity_trg
before insert on public.conduct_events
for each row execute function app_private.enforce_learner_observation_recorder_integrity();

drop trigger if exists achievement_event_recorder_integrity_trg on public.achievement_events;
create trigger achievement_event_recorder_integrity_trg
before insert on public.achievement_events
for each row execute function app_private.enforce_learner_observation_recorder_integrity();
