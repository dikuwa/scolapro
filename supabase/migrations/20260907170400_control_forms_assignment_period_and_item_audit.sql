-- N20 Control Room follow-up: authoritative responsible-assignment period validation
-- and checklist-template-item audit provenance.

create or replace function app_private.enforce_control_cycle_responsible_assignment_period()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_assignment public.staff_school_assignments%rowtype;
begin
  if new.responsible_staff_school_assignment_id is null then
    return new;
  end if;

  select * into v_assignment
  from public.staff_school_assignments
  where id=new.responsible_staff_school_assignment_id;

  if not found
     or v_assignment.school_id<>new.school_id
     or v_assignment.tenant_id<>new.tenant_id then
    raise exception 'Responsible staff assignment must belong to the control cycle school';
  end if;

  if v_assignment.effective_from>new.period_start
     or (v_assignment.effective_to is not null and v_assignment.effective_to<new.period_end) then
    raise exception 'Responsible staff assignment must be effective for the full control cycle period';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_control_cycle_responsible_assignment_period() from public,anon,authenticated;

drop trigger if exists control_cycle_responsible_assignment_period_trg on public.control_cycle;
create trigger control_cycle_responsible_assignment_period_trg
before insert or update of responsible_staff_school_assignment_id,period_start,period_end
on public.control_cycle
for each row execute function app_private.enforce_control_cycle_responsible_assignment_period();

create or replace function public.add_control_template_item(
  p_template_id uuid,
  p_item_key text,
  p_label text,
  p_sort_order integer,
  p_instructions text default null,
  p_evidence_required boolean default false,
  p_reviewer_required boolean default false
) returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_t public.control_template%rowtype;
  v_id uuid;
begin
  select * into v_t from public.control_template where id=p_template_id;
  if not found then raise exception 'Control template not found'; end if;
  if not app_private.control_template_access(v_t.school_id,v_t.owning_department_head_assignment_id) then
    raise exception 'Permission denied';
  end if;
  if v_t.status<>'draft' then
    raise exception 'Published control template versions are immutable';
  end if;

  insert into public.control_template_item(
    tenant_id,school_id,control_template_id,item_key,label,instructions,sort_order,
    evidence_required,reviewer_required
  ) values(
    v_t.tenant_id,v_t.school_id,v_t.id,btrim(p_item_key),btrim(p_label),p_instructions,
    p_sort_order,p_evidence_required,p_reviewer_required
  ) returning id into v_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_t.tenant_id,
    v_t.school_id,
    auth.uid(),
    'control.template.item_created',
    'control_template_item',
    v_id,
    jsonb_build_object(
      'control_template_id',v_t.id,
      'template_key',v_t.template_key,
      'version_no',v_t.version_no,
      'item_key',btrim(p_item_key),
      'sort_order',p_sort_order,
      'evidence_required',p_evidence_required,
      'reviewer_required',p_reviewer_required
    )
  );

  return v_id;
end;
$$;

revoke all on function public.add_control_template_item(uuid,text,text,integer,text,boolean,boolean) from public,anon;
grant execute on function public.add_control_template_item(uuid,text,text,integer,text,boolean,boolean) to authenticated;

comment on function app_private.enforce_control_cycle_responsible_assignment_period() is
'Requires a responsible staff_school_assignment to cover the entire control-cycle period using the authoritative effective-dated placement.';