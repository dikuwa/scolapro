create or replace function app_private.user_can_govern_voluntary_contributions(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists(
      select 1
      from public.platform_memberships pm
      where pm.user_id = p_user_id
        and pm.role_key = 'platform_admin'
        and pm.active_from <= current_date
        and (pm.active_to is null or pm.active_to >= current_date)
    )
    or exists(
      select 1
      from public.school_memberships sm
      where sm.school_id = p_school_id
        and sm.user_id = p_user_id
        and sm.role_key in ('school_admin','principal','deputy_principal')
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
    );
$$;

revoke all on function app_private.user_can_govern_voluntary_contributions(uuid,uuid)
  from public, anon, authenticated;

comment on function app_private.user_can_govern_voluntary_contributions(uuid,uuid) is
'Arbitrary-user mirror of voluntary-contribution leadership authority for physical provenance guards.';

create or replace function app_private.user_can_record_voluntary_contribution(
  p_user_id uuid,
  p_school_id uuid,
  p_learner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.user_can_govern_voluntary_contributions(p_user_id, p_school_id)
    or exists(
      select 1
      from public.enrolments e
      join public.register_classes rc
        on rc.id = e.register_class_id
      join public.staff_members staff
        on staff.id = rc.register_teacher_staff_id
      join public.school_memberships sm
        on sm.school_id = e.school_id
       and sm.user_id = p_user_id
       and sm.role_key = 'class_teacher'
       and sm.active_from <= current_date
       and (sm.active_to is null or sm.active_to >= current_date)
      where e.school_id = p_school_id
        and e.learner_id = p_learner_id
        and e.status = 'current'
        and staff.user_id = p_user_id
        and staff.status = 'active'
    );
$$;

revoke all on function app_private.user_can_record_voluntary_contribution(uuid,uuid,uuid)
  from public, anon, authenticated;

comment on function app_private.user_can_record_voluntary_contribution(uuid,uuid,uuid) is
'Arbitrary-user mirror of contribution-recording authority, preserving leadership access and register-class teacher scoping.';

create or replace function app_private.enforce_voluntary_contribution_campaign_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'UPDATE'
     and new.created_by_user_id is distinct from old.created_by_user_id then
    raise exception 'Voluntary contribution campaign creator provenance is immutable';
  end if;

  if auth.uid() is not null
     and tg_op = 'INSERT'
     and new.created_by_user_id is distinct from auth.uid() then
    raise exception 'Voluntary contribution campaign creator must match authenticated actor';
  end if;

  if not app_private.user_can_govern_voluntary_contributions(
    new.created_by_user_id,
    new.school_id
  ) then
    raise exception 'Voluntary contribution campaign creator is not authorized for school';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_voluntary_contribution_campaign_actor_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_voluntary_contribution_campaign_actor_integrity() is
'Physically binds contribution campaign creator provenance to current school leadership authority and prevents forged trusted writes.';

drop trigger if exists voluntary_contribution_campaign_actor_integrity_trg
  on public.voluntary_contribution_campaigns;
create trigger voluntary_contribution_campaign_actor_integrity_trg
before insert or update of created_by_user_id, school_id
on public.voluntary_contribution_campaigns
for each row execute function app_private.enforce_voluntary_contribution_campaign_actor_integrity();

create or replace function app_private.enforce_learner_voluntary_contribution_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'recorded'
       or new.verified_by_user_id is not null
       or new.verified_at is not null
       or new.reversed_by_user_id is not null
       or new.reversed_at is not null
       or new.reversal_note is not null then
      raise exception 'Voluntary contributions must be created in recorded state without review provenance';
    end if;

    if auth.uid() is not null
       and new.recorded_by_user_id is distinct from auth.uid() then
      raise exception 'Voluntary contribution recorder must match authenticated actor';
    end if;

    if not app_private.user_can_record_voluntary_contribution(
      new.recorded_by_user_id,
      new.school_id,
      new.learner_id
    ) then
      raise exception 'Voluntary contribution recorder is not authorized for learner';
    end if;

    return new;
  end if;

  if new.recorded_by_user_id is distinct from old.recorded_by_user_id then
    raise exception 'Voluntary contribution recorder provenance is immutable';
  end if;

  if old.verified_by_user_id is not null then
    if new.verified_by_user_id is distinct from old.verified_by_user_id
       or new.verified_at is distinct from old.verified_at then
      raise exception 'Voluntary contribution verification provenance is immutable';
    end if;
  elsif new.status = 'verified' and old.status is distinct from 'verified' then
    if new.verified_by_user_id is null or new.verified_at is null then
      raise exception 'Verified voluntary contribution requires verification provenance';
    end if;

    if auth.uid() is not null
       and new.verified_by_user_id is distinct from auth.uid() then
      raise exception 'Voluntary contribution verifier must match authenticated actor';
    end if;

    if not app_private.user_can_govern_voluntary_contributions(
      new.verified_by_user_id,
      new.school_id
    ) then
      raise exception 'Voluntary contribution verifier is not authorized for school';
    end if;
  elsif new.verified_by_user_id is not null or new.verified_at is not null then
    raise exception 'Voluntary contribution verification provenance requires verified history';
  end if;

  if old.reversed_by_user_id is not null then
    if new.reversed_by_user_id is distinct from old.reversed_by_user_id
       or new.reversed_at is distinct from old.reversed_at
       or new.reversal_note is distinct from old.reversal_note then
      raise exception 'Voluntary contribution reversal provenance is immutable';
    end if;
  elsif new.status = 'reversed' and old.status is distinct from 'reversed' then
    if new.reversed_by_user_id is null
       or new.reversed_at is null
       or nullif(btrim(coalesce(new.reversal_note,'')), '') is null then
      raise exception 'Reversed voluntary contribution requires reversal provenance';
    end if;

    if auth.uid() is not null
       and new.reversed_by_user_id is distinct from auth.uid() then
      raise exception 'Voluntary contribution reverser must match authenticated actor';
    end if;

    if not app_private.user_can_govern_voluntary_contributions(
      new.reversed_by_user_id,
      new.school_id
    ) then
      raise exception 'Voluntary contribution reverser is not authorized for school';
    end if;
  elsif new.reversed_by_user_id is not null
     or new.reversed_at is not null
     or new.reversal_note is not null then
    raise exception 'Voluntary contribution reversal provenance requires reversed status';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_learner_voluntary_contribution_actor_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_learner_voluntary_contribution_actor_integrity() is
'Physically binds contribution recording to leadership or the learner register teacher, binds verification/reversal to current leadership, and freezes review provenance.';

drop trigger if exists learner_voluntary_contribution_actor_integrity_trg
  on public.learner_voluntary_contributions;
create trigger learner_voluntary_contribution_actor_integrity_trg
before insert or update of recorded_by_user_id, verified_by_user_id, verified_at,
  reversed_by_user_id, reversed_at, reversal_note, status, school_id, learner_id
on public.learner_voluntary_contributions
for each row execute function app_private.enforce_learner_voluntary_contribution_actor_integrity();
