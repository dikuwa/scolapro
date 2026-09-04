create or replace function app_private.user_can_manage_learner_support(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select app_private.user_has_explicit_support_role(p_user_id,p_school_id)
    or exists(
      select 1
      from public.school_memberships sm
      where sm.school_id=p_school_id
        and sm.user_id=p_user_id
        and sm.role_key in ('principal','deputy_principal')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    );
$$;

revoke all on function app_private.user_can_manage_learner_support(uuid,uuid)
  from public, anon, authenticated;

create or replace function app_private.user_can_access_sensitive_crc(
  p_user_id uuid,
  p_school_id uuid,
  p_sensitivity text
)
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select case
    when p_sensitivity='highly_restricted' then
      app_private.user_has_explicit_support_role(p_user_id,p_school_id)
    when p_sensitivity='restricted' then
      app_private.user_can_manage_learner_support(p_user_id,p_school_id)
    else false
  end;
$$;

revoke all on function app_private.user_can_access_sensitive_crc(uuid,uuid,text)
  from public, anon, authenticated;

create or replace function app_private.user_can_manage_enrolment_workflow(
  p_user_id uuid,
  p_school_id uuid
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
        and sm.role_key in ('school_admin','principal','deputy_principal')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    );
$$;

revoke all on function app_private.user_can_manage_enrolment_workflow(uuid,uuid)
  from public, anon, authenticated;

create or replace function app_private.enforce_cumulative_record_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_allowed boolean := false;
begin
  if tg_table_name='learner_development_observations' then
    v_allowed := app_private.user_can_access_learner_observations(
      new.recorded_by_user_id,
      new.school_id,
      new.learner_id
    );
  elsif tg_table_name='learner_cumulative_notes' then
    if new.sensitivity='routine' then
      v_allowed := app_private.user_can_access_learner_observations(
        new.recorded_by_user_id,
        new.school_id,
        new.learner_id
      );
    else
      v_allowed := app_private.user_can_manage_learner_support(
        new.recorded_by_user_id,
        new.school_id
      );
    end if;
  elsif tg_table_name in ('learner_health_history','learner_psychometric_records') then
    v_allowed := app_private.user_can_access_sensitive_crc(
      new.recorded_by_user_id,
      new.school_id,
      new.sensitivity
    );
  elsif tg_table_name='learner_prior_school_history' then
    v_allowed := app_private.user_can_manage_enrolment_workflow(
      new.recorded_by_user_id,
      new.school_id
    );
  end if;

  if not coalesce(v_allowed,false) then
    raise exception 'Cumulative learner record recorder mismatch: user is not authorized for record';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_cumulative_record_actor_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_cumulative_record_actor_integrity() is
'Prevents trusted or RLS-bypassing inserts from forging cumulative-record recorder identities while mirroring each table''s established RLS authority model.';

drop trigger if exists learner_development_observations_actor_integrity_trg on public.learner_development_observations;
create trigger learner_development_observations_actor_integrity_trg
before insert on public.learner_development_observations
for each row execute function app_private.enforce_cumulative_record_actor_integrity();

drop trigger if exists learner_cumulative_notes_actor_integrity_trg on public.learner_cumulative_notes;
create trigger learner_cumulative_notes_actor_integrity_trg
before insert on public.learner_cumulative_notes
for each row execute function app_private.enforce_cumulative_record_actor_integrity();

drop trigger if exists learner_health_history_actor_integrity_trg on public.learner_health_history;
create trigger learner_health_history_actor_integrity_trg
before insert on public.learner_health_history
for each row execute function app_private.enforce_cumulative_record_actor_integrity();

drop trigger if exists learner_psychometric_records_actor_integrity_trg on public.learner_psychometric_records;
create trigger learner_psychometric_records_actor_integrity_trg
before insert on public.learner_psychometric_records
for each row execute function app_private.enforce_cumulative_record_actor_integrity();

drop trigger if exists learner_prior_school_history_actor_integrity_trg on public.learner_prior_school_history;
create trigger learner_prior_school_history_actor_integrity_trg
before insert on public.learner_prior_school_history
for each row execute function app_private.enforce_cumulative_record_actor_integrity();
