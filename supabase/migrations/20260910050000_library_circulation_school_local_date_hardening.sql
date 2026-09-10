create or replace function app_private.can_manage_ltsm(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_school_role(
    target_school_id,
    array['school_admin','principal','deputy_principal','librarian','ltsm']
  );
$$;

grant execute on function app_private.can_manage_ltsm(uuid) to authenticated;

create or replace function app_private.user_can_manage_ltsm(p_user_id uuid, p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.user_has_school_role(
    p_user_id,
    p_school_id,
    array['school_admin','principal','deputy_principal','librarian','ltsm']
  );
$$;

revoke all on function app_private.user_can_manage_ltsm(uuid,uuid) from public, anon, authenticated;

create or replace function app_private.learning_resource_today()
returns date
language sql
stable
set search_path = pg_catalog
as $$
  select (now() at time zone 'Africa/Windhoek')::date;
$$;

revoke all on function app_private.learning_resource_today() from public, anon, authenticated;

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

create or replace function public.return_learning_resource(
  p_loan_id uuid,
  p_returned_condition text default null,
  p_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_loan public.learning_resource_loans%rowtype;
  v_condition text;
  v_requested_condition text;
  v_requested_notes text;
  v_today date := app_private.learning_resource_today();
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_loan
  from public.learning_resource_loans
  where id = p_loan_id
  for update;
  if not found then raise exception 'Loan not found'; end if;
  if not app_private.can_manage_ltsm(v_loan.school_id) then raise exception 'Permission denied'; end if;

  v_requested_condition := nullif(btrim(coalesce(p_returned_condition, '')), '');
  v_requested_notes := nullif(btrim(coalesce(p_notes, '')), '');

  if v_loan.status in ('returned','lost') then
    if v_requested_condition is not null
       and v_requested_condition is distinct from v_loan.returned_condition then
      raise exception 'Loan is already completed with a different return condition';
    end if;

    if v_requested_notes is not null
       and v_requested_notes is distinct from v_loan.notes then
      raise exception 'Loan is already completed with different return notes';
    end if;

    return true;
  end if;

  if v_loan.status not in ('open','overdue') then raise exception 'Loan is not open'; end if;

  v_condition := coalesce(
    v_requested_condition,
    (select condition from public.learning_resource_copies where id = v_loan.copy_id)
  );
  if v_condition not in ('new','good','fair','poor','damaged','lost') then
    raise exception 'Return condition is invalid';
  end if;

  update public.learning_resource_loans
  set returned_on = v_today,
      returned_condition = v_condition,
      returned_by_user_id = auth.uid(),
      status = case when v_condition = 'lost' then 'lost' else 'returned' end,
      notes = coalesce(v_requested_notes, notes),
      updated_at = now()
  where id = p_loan_id;

  update public.learning_resource_copies
  set condition = v_condition,
      availability = case
        when v_condition = 'lost' then 'lost'
        when v_condition = 'damaged' then 'repair'
        else 'available'
      end,
      updated_at = now()
  where id = v_loan.copy_id;

  insert into public.audit_events(
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    v_loan.tenant_id, v_loan.school_id, auth.uid(), 'ltsm.resource.returned',
    'learning_resource_loan', v_loan.id,
    jsonb_build_object(
      'copy_id', v_loan.copy_id,
      'learner_id', v_loan.learner_id,
      'staff_member_id', v_loan.staff_member_id,
      'condition', v_condition
    )
  );

  return true;
end;
$$;

revoke all on function public.issue_learning_resource(uuid,uuid,uuid,date,text) from public, anon;
grant execute on function public.issue_learning_resource(uuid,uuid,uuid,date,text) to authenticated;
revoke all on function public.return_learning_resource(uuid,text,text) from public, anon;
grant execute on function public.return_learning_resource(uuid,text,text) to authenticated;
