-- Completed returns/losses are final historical facts. Repeating the same governed
-- return is a safe no-op; conflicting repeats or later status rewrites are rejected.

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
  set returned_on = current_date,
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
    'learning_resource_loan', v_loan.id, jsonb_build_object('condition', v_condition)
  );

  return true;
end;
$$;

revoke all on function public.return_learning_resource(uuid,text,text) from public, anon;
grant execute on function public.return_learning_resource(uuid,text,text) to authenticated;

create or replace function app_private.enforce_learning_resource_loan_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'open'
       or new.returned_on is not null
       or new.returned_condition is not null
       or new.returned_by_user_id is not null then
      raise exception 'Learning resource loans must be created open without return provenance';
    end if;

    if auth.uid() is not null
       and new.issued_by_user_id is distinct from auth.uid() then
      raise exception 'Learning resource loan issuer must match authenticated actor';
    end if;

    if not app_private.user_can_manage_ltsm(new.issued_by_user_id, new.school_id) then
      raise exception 'Learning resource loan issuer is not authorized for school';
    end if;

    return new;
  end if;

  if new.issued_by_user_id is distinct from old.issued_by_user_id then
    raise exception 'Learning resource loan issuer provenance is immutable';
  end if;

  if old.status in ('returned','lost') and new.status is distinct from old.status then
    raise exception 'Completed learning resource loan status is immutable';
  end if;

  if old.returned_by_user_id is not null then
    if new.returned_by_user_id is distinct from old.returned_by_user_id
       or new.returned_on is distinct from old.returned_on
       or new.returned_condition is distinct from old.returned_condition then
      raise exception 'Learning resource loan return provenance is immutable';
    end if;
  elsif new.status in ('returned','lost') and old.status not in ('returned','lost') then
    if old.status not in ('open','overdue') then
      raise exception 'Only an open or overdue learning resource loan can be returned';
    end if;

    if new.returned_by_user_id is null
       or new.returned_on is null
       or nullif(btrim(coalesce(new.returned_condition,'')), '') is null then
      raise exception 'Returned learning resource loan requires return provenance';
    end if;

    if auth.uid() is not null
       and new.returned_by_user_id is distinct from auth.uid() then
      raise exception 'Learning resource loan returner must match authenticated actor';
    end if;

    if not app_private.user_can_manage_ltsm(new.returned_by_user_id, new.school_id) then
      raise exception 'Learning resource loan returner is not authorized for school';
    end if;
  elsif new.returned_by_user_id is not null
     or new.returned_on is not null
     or new.returned_condition is not null then
    raise exception 'Learning resource loan return provenance requires returned or lost status';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_learning_resource_loan_actor_integrity()
  from public, anon, authenticated;

comment on function public.return_learning_resource(uuid,text,text) is
'Governed idempotent LTSM return workflow. Repeating the same completed return is a no-op; conflicting completion details are rejected.';
