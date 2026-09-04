create or replace function app_private.user_has_explicit_support_role(
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
        and sm.role_key in ('counsellor','learner_support')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    );
$$;

revoke all on function app_private.user_has_explicit_support_role(uuid,uuid)
  from public, anon, authenticated;

create or replace function app_private.user_can_create_learner_support_case(
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
      app_private.user_has_explicit_support_role(p_user_id,p_school_id)
      or exists(
        select 1
        from public.school_memberships sm
        where sm.school_id=p_school_id
          and sm.user_id=p_user_id
          and sm.role_key in ('principal','deputy_principal')
          and sm.active_from<=current_date
          and (sm.active_to is null or sm.active_to>=current_date)
      )
    else false
  end;
$$;

revoke all on function app_private.user_can_create_learner_support_case(uuid,uuid,text)
  from public, anon, authenticated;

create or replace function app_private.user_can_access_learner_support_case(
  p_user_id uuid,
  p_case_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select exists(
    select 1
    from public.learner_support_cases c
    where c.id=p_case_id
      and (
        app_private.user_has_explicit_support_role(p_user_id,c.school_id)
        or exists(
          select 1
          from public.staff_members owner_staff
          where owner_staff.id=c.owner_staff_member_id
            and owner_staff.user_id=p_user_id
            and owner_staff.tenant_id=c.tenant_id
            and owner_staff.status='active'
            and (
              exists(
                select 1
                from public.staff_school_assignments ssa
                where ssa.staff_member_id=owner_staff.id
                  and ssa.tenant_id=c.tenant_id
                  and ssa.school_id=c.school_id
                  and ssa.effective_from<=current_date
                  and (ssa.effective_to is null or ssa.effective_to>=current_date)
              )
              or exists(
                select 1
                from public.school_memberships owner_membership
                where owner_membership.staff_member_id=owner_staff.id
                  and owner_membership.tenant_id=c.tenant_id
                  and owner_membership.school_id=c.school_id
                  and owner_membership.user_id=p_user_id
                  and owner_membership.active_from<=current_date
                  and (owner_membership.active_to is null or owner_membership.active_to>=current_date)
              )
            )
        )
        or (
          c.sensitivity='restricted'
          and exists(
            select 1
            from public.school_memberships sm
            where sm.school_id=c.school_id
              and sm.user_id=p_user_id
              and sm.role_key in ('principal','deputy_principal')
              and sm.active_from<=current_date
              and (sm.active_to is null or sm.active_to>=current_date)
          )
        )
      )
  );
$$;

revoke all on function app_private.user_can_access_learner_support_case(uuid,uuid)
  from public, anon, authenticated;

create or replace function app_private.enforce_learner_support_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_table_name='learner_support_cases' then
    if not app_private.user_can_create_learner_support_case(
      new.opened_by_user_id,
      new.school_id,
      new.sensitivity
    ) then
      raise exception 'Learner support opener mismatch: user is not authorized to create this case';
    end if;
  elsif tg_table_name='learner_support_interventions' then
    if not app_private.user_can_access_learner_support_case(
      new.recorded_by_user_id,
      new.support_case_id
    ) then
      raise exception 'Learner support intervention recorder mismatch: user cannot access support case';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_learner_support_actor_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_learner_support_actor_integrity() is
'Prevents trusted or RLS-bypassing paths from forging learner-support case openers or intervention recorders by mirroring the established confidentiality and case-access authority model at the physical insert boundary.';

drop trigger if exists learner_support_case_actor_integrity_trg on public.learner_support_cases;
create trigger learner_support_case_actor_integrity_trg
before insert on public.learner_support_cases
for each row execute function app_private.enforce_learner_support_actor_integrity();

drop trigger if exists learner_support_intervention_actor_integrity_trg on public.learner_support_interventions;
create trigger learner_support_intervention_actor_integrity_trg
before insert on public.learner_support_interventions
for each row execute function app_private.enforce_learner_support_actor_integrity();
