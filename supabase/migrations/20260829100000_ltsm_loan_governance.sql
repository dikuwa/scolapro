-- LTSM lending is transactional: direct loan-row edits can desynchronise copy
-- availability. Keep inventory catalogue management flexible, but require loans to pass
-- through issue/return RPCs. Staff borrowers use operational school placement and do not
-- need a login account.

create or replace function app_private.can_manage_ltsm(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or exists(
      select 1
      from public.school_memberships sm
      where sm.school_id=target_school_id
        and sm.user_id=(select auth.uid())
        and sm.role_key in ('school_admin','principal','deputy_principal','librarian','ltsm')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    );
$$;
revoke all on function app_private.can_manage_ltsm(uuid) from public,anon;
grant execute on function app_private.can_manage_ltsm(uuid) to authenticated;

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
set search_path=public,app_private
as $$
declare
  v_copy public.learning_resource_copies%rowtype;
  v_loan_id uuid;
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
  if p_due_on is not null and p_due_on<current_date then raise exception 'Due date cannot be before issue date'; end if;

  if p_learner_id is not null and not exists(
    select 1
    from public.enrolments e
    where e.school_id=v_copy.school_id
      and e.tenant_id=v_copy.tenant_id
      and e.learner_id=p_learner_id
      and e.status='current'
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
            and ssa.effective_from<=current_date
            and (ssa.effective_to is null or ssa.effective_to>=current_date)
        )
        or exists(
          select 1 from public.school_memberships sm
          where sm.school_id=v_copy.school_id
            and sm.staff_member_id=staff.id
            and sm.active_from<=current_date
            and (sm.active_to is null or sm.active_to>=current_date)
        )
      )
  ) then raise exception 'Staff member is not active at this school'; end if;

  insert into public.learning_resource_loans(
    tenant_id,school_id,copy_id,learner_id,staff_member_id,due_on,
    issued_condition,issued_by_user_id,notes
  ) values(
    v_copy.tenant_id,v_copy.school_id,v_copy.id,p_learner_id,p_staff_member_id,p_due_on,
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

revoke all on function public.issue_learning_resource(uuid,uuid,uuid,date,text) from public,anon;
grant execute on function public.issue_learning_resource(uuid,uuid,uuid,date,text) to authenticated;

-- Security-definer issue/return functions retain internal write ability; authenticated
-- clients cannot forge, rewrite, or delete loan transactions directly.
revoke insert,update,delete on public.learning_resource_loans from authenticated;

comment on table public.learning_resource_loans is
'Governed lending history. Authenticated clients read authorized loans but mutations occur only through issue/return workflows so copy availability remains consistent.';