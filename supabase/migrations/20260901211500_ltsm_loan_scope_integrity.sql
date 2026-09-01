create or replace function app_private.enforce_learning_resource_loan_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_copy_tenant uuid;
  v_copy_school uuid;
  v_learner_tenant uuid;
  v_staff_tenant uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.copy_id is distinct from old.copy_id
    or new.learner_id is distinct from old.learner_id
    or new.staff_member_id is distinct from old.staff_member_id
    or new.issued_on is distinct from old.issued_on
    or new.issued_condition is distinct from old.issued_condition
    or new.issued_by_user_id is distinct from old.issued_by_user_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Learning resource loan scope and issue provenance are immutable';
  end if;

  select s.tenant_id
    into v_school_tenant
    from public.schools s
   where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Learning resource loan scope mismatch: school does not belong to tenant';
  end if;

  select c.tenant_id, c.school_id
    into v_copy_tenant, v_copy_school
    from public.learning_resource_copies c
   where c.id = new.copy_id;

  if v_copy_tenant is null
     or v_copy_tenant <> new.tenant_id
     or v_copy_school <> new.school_id then
    raise exception 'Learning resource loan scope mismatch: copy does not belong to school';
  end if;

  if tg_op = 'INSERT' then
    if new.learner_id is not null then
      select l.tenant_id
        into v_learner_tenant
        from public.learners l
       where l.id = new.learner_id;

      if v_learner_tenant is null or v_learner_tenant <> new.tenant_id then
        raise exception 'Learning resource loan scope mismatch: learner does not belong to tenant';
      end if;

      if not exists (
        select 1
          from public.enrolments e
         where e.tenant_id = new.tenant_id
           and e.school_id = new.school_id
           and e.learner_id = new.learner_id
           and e.enrolled_from <= new.issued_on
           and (e.enrolled_to is null or e.enrolled_to >= new.issued_on)
      ) then
        raise exception 'Learning resource loan scope mismatch: learner has no school enrolment at issue date';
      end if;
    elsif new.staff_member_id is not null then
      select sm.tenant_id
        into v_staff_tenant
        from public.staff_members sm
       where sm.id = new.staff_member_id;

      if v_staff_tenant is null or v_staff_tenant <> new.tenant_id then
        raise exception 'Learning resource loan scope mismatch: staff member does not belong to tenant';
      end if;

      if not (
        exists (
          select 1
            from public.staff_school_assignments ssa
           where ssa.tenant_id = new.tenant_id
             and ssa.school_id = new.school_id
             and ssa.staff_member_id = new.staff_member_id
             and ssa.effective_from <= new.issued_on
             and (ssa.effective_to is null or ssa.effective_to >= new.issued_on)
        )
        or exists (
          select 1
            from public.school_memberships sm
           where sm.tenant_id = new.tenant_id
             and sm.school_id = new.school_id
             and sm.staff_member_id = new.staff_member_id
             and sm.active_from <= new.issued_on
             and (sm.active_to is null or sm.active_to >= new.issued_on)
        )
      ) then
        raise exception 'Learning resource loan scope mismatch: staff member has no school placement at issue date';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_learning_resource_loan_scope_integrity() from public, anon, authenticated;

drop trigger if exists learning_resource_loan_scope_integrity_trg on public.learning_resource_loans;
create trigger learning_resource_loan_scope_integrity_trg
before insert or update
on public.learning_resource_loans
for each row execute function app_private.enforce_learning_resource_loan_scope_integrity();

comment on function app_private.enforce_learning_resource_loan_scope_integrity() is
'Defense-in-depth LTSM loan guard. A copy and borrower must belong to the same tenant/school context at issue time, while issue identity and provenance remain immutable after creation.';