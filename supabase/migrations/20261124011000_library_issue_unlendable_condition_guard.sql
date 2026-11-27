-- #1320: physically unlendable copies must not pass the canonical issue gate.
-- All single, bulk and offline-idempotent issue paths delegate here.
-- Preserve school authority, borrower-period checks and the existing row lock.
create or replace function public.issue_learning_resource(
  p_copy_id uuid,
  p_learner_id uuid default null,
  p_staff_member_id uuid default null,
  p_due_on date default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_copy public.learning_resource_copies%rowtype;
  v_loan_id uuid;
  v_today date := app_private.learning_resource_today();
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if (p_learner_id is null and p_staff_member_id is null)
    or (p_learner_id is not null and p_staff_member_id is not null)
  then raise exception 'Choose exactly one borrower'; end if;

  select * into v_copy
  from public.learning_resource_copies
  where id=p_copy_id
  for update;
  if not found then raise exception 'Resource copy not found'; end if;
  if not app_private.can_manage_ltsm(v_copy.school_id) then raise exception 'Permission denied'; end if;
  if v_copy.availability<>'available' then raise exception 'Resource copy is not available'; end if;
  -- Bulk import and offline stock reconciliation can leave inconsistent states.
  -- Physical condition wins even if the availability flag still reads available.
  if v_copy.condition in ('damaged','lost') then
    raise exception 'Damaged or lost resource copy cannot be issued';
  end if;
  if p_due_on is not null and p_due_on<v_today then raise exception 'Due date cannot be before issue date'; end if;

  if p_learner_id is not null and not exists(
    select 1
    from public.enrolments e
    where e.school_id=v_copy.school_id
      and e.tenant_id=v_copy.tenant_id
      and e.learner_id=p_learner_id
      and e.status='current'
      and e.enrolled_from<=v_today
      and (e.enrolled_to is null or e.enrolled_to>=v_today)
  ) then raise exception 'Learner is not currently enrolled at this school'; end if;

  if p_staff_member_id is not null and not exists(
    select 1
    from public.staff_members staff
    where staff.id=p_staff_member_id
      and staff.tenant_id=v_copy.tenant_id
      and staff.status='active'
      and (
        exists(
          select 1 from public.staff_school_assignments ssa
          where ssa.school_id=v_copy.school_id
            and ssa.staff_member_id=staff.id
            and ssa.effective_from<=v_today
            and (ssa.effective_to is null or ssa.effective_to>=v_today)
        )
        or exists(
          select 1 from public.school_memberships sm
          where sm.school_id=v_copy.school_id
            and sm.staff_member_id=staff.id
            and sm.active_from<=v_today
            and (sm.active_to is null or sm.active_to>=v_today)
        )
      )
  ) then raise exception 'Staff member is not active at this school'; end if;

  insert into public.learning_resource_loans(
    tenant_id,school_id,copy_id,learner_id,staff_member_id,issued_on,due_on,
    issued_condition,issued_by_user_id,notes
  ) values(
    v_copy.tenant_id,v_copy.school_id,v_copy.id,p_learner_id,p_staff_member_id,v_today,p_due_on,
    v_copy.condition,auth.uid(),nullif(btrim(coalesce(p_notes,'')),'')
  ) returning id into v_loan_id;

  update public.learning_resource_copies
  set availability='on_loan',updated_at=now()
  where id=v_copy.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_copy.tenant_id,v_copy.school_id,auth.uid(),'ltsm.resource.issued','learning_resource_loan',v_loan_id,
    jsonb_build_object('copy_id',v_copy.id,'learner_id',p_learner_id,'staff_member_id',p_staff_member_id,'due_on',p_due_on)
  );

  return v_loan_id;
end;
$$;
