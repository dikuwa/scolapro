create or replace function app_private.enforce_learner_support_owner_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner_tenant uuid;
  v_owner_status text;
begin
  if new.owner_staff_member_id is null then
    return new;
  end if;

  -- Revalidate only when an owner is first assigned or explicitly changed. Ordinary
  -- case updates must not fail merely because a previously valid owner later moved.
  if tg_op = 'UPDATE' and new.owner_staff_member_id is not distinct from old.owner_staff_member_id then
    return new;
  end if;

  select sm.tenant_id, sm.status
    into v_owner_tenant, v_owner_status
    from public.staff_members sm
   where sm.id = new.owner_staff_member_id;

  if v_owner_tenant is null
     or v_owner_tenant is distinct from new.tenant_id
     or v_owner_status is distinct from 'active' then
    raise exception 'Learner support owner must be an active staff member in the case tenant';
  end if;

  if not exists (
    select 1
      from public.staff_school_assignments ssa
     where ssa.staff_member_id = new.owner_staff_member_id
       and ssa.tenant_id = new.tenant_id
       and ssa.school_id = new.school_id
       and ssa.effective_from <= current_date
       and (ssa.effective_to is null or ssa.effective_to >= current_date)
  ) and not exists (
    select 1
      from public.school_memberships sm
     where sm.staff_member_id = new.owner_staff_member_id
       and sm.tenant_id = new.tenant_id
       and sm.school_id = new.school_id
       and sm.active_from <= current_date
       and (sm.active_to is null or sm.active_to >= current_date)
  ) then
    raise exception 'Learner support owner must have an active placement at the case school';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_learner_support_owner_scope_integrity() from public, anon, authenticated;

drop trigger if exists learner_support_owner_scope_integrity_trg on public.learner_support_cases;
create trigger learner_support_owner_scope_integrity_trg
before insert or update of tenant_id, school_id, owner_staff_member_id
on public.learner_support_cases
for each row execute function app_private.enforce_learner_support_owner_scope_integrity();

create or replace function app_private.can_access_learner_support_case(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select exists(
    select 1
    from public.learner_support_cases c
    where c.id=p_case_id
      and (
        app_private.has_explicit_support_role(c.school_id)
        or exists(
          select 1
          from public.staff_members owner_staff
          where owner_staff.id=c.owner_staff_member_id
            and owner_staff.user_id=(select auth.uid())
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
                  and owner_membership.user_id=(select auth.uid())
                  and owner_membership.active_from<=current_date
                  and (owner_membership.active_to is null or owner_membership.active_to>=current_date)
              )
            )
        )
        or (
          c.sensitivity='restricted'
          and exists(
            select 1 from public.school_memberships sm
            where sm.school_id=c.school_id
              and sm.user_id=(select auth.uid())
              and sm.role_key in ('principal','deputy_principal')
              and sm.active_from<=current_date
              and (sm.active_to is null or sm.active_to>=current_date)
          )
        )
      )
  );
$$;

revoke all on function app_private.can_access_learner_support_case(uuid) from public, anon;
grant execute on function app_private.can_access_learner_support_case(uuid) to authenticated;

comment on function app_private.enforce_learner_support_owner_scope_integrity() is
'Prevents counselling/support case ownership from being assigned to inactive, cross-tenant, or cross-school staff identities.';
