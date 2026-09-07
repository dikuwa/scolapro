-- N20 Control Room review corrections.
-- Department ownership reuses the authoritative HOD school membership -> staff_member_id
-- -> effective-dated staff_school_assignments chain. No parallel department membership
-- or copied staff identity is introduced.

alter table public.control_template
  add column owning_department_head_assignment_id uuid
  references public.staff_school_assignments(id) on delete restrict;

create index control_template_department_head_idx
  on public.control_template(school_id,owning_department_head_assignment_id)
  where owning_department_head_assignment_id is not null;

create or replace function app_private.control_leader(p_school_id uuid)
returns boolean language sql stable security definer
set search_path=pg_catalog,public,app_private as $$
  select auth.uid() is not null and exists(
    select 1 from public.school_memberships sm
    where sm.school_id=p_school_id and sm.user_id=auth.uid()
      and sm.role_key in ('school_admin','principal','deputy_principal')
      and sm.active_from<=current_date and (sm.active_to is null or sm.active_to>=current_date)
  );
$$;
revoke all on function app_private.control_leader(uuid) from public,anon;
grant execute on function app_private.control_leader(uuid) to authenticated;

create or replace function app_private.control_template_access(
  p_school_id uuid,
  p_owning_department_head_assignment_id uuid
) returns boolean language sql stable security definer
set search_path=pg_catalog,public,app_private as $$
  select app_private.control_leader(p_school_id)
  or (
    p_owning_department_head_assignment_id is not null
    and exists(
      select 1
      from public.school_memberships sm
      join public.staff_school_assignments ssa
        on ssa.id=p_owning_department_head_assignment_id
       and ssa.school_id=sm.school_id
       and ssa.staff_member_id=sm.staff_member_id
      where sm.school_id=p_school_id
        and sm.user_id=auth.uid()
        and sm.role_key='hod'
        and sm.staff_member_id is not null
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
        and ssa.effective_from<=current_date
        and (ssa.effective_to is null or ssa.effective_to>=current_date)
    )
  );
$$;
revoke all on function app_private.control_template_access(uuid,uuid) from public,anon;
grant execute on function app_private.control_template_access(uuid,uuid) to authenticated;

create or replace function app_private.enforce_control_scope()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,app_private as $$
declare
  v_school_tenant uuid;
  v_template public.control_template%rowtype;
  v_cycle public.control_cycle%rowtype;
  v_item public.control_template_item%rowtype;
  v_assignment public.staff_school_assignments%rowtype;
begin
  select tenant_id into v_school_tenant from public.schools where id=new.school_id;
  if v_school_tenant is null or new.tenant_id<>v_school_tenant then
    raise exception 'Control record tenant must match school tenant';
  end if;

  if tg_table_name='control_template' then
    if tg_op='UPDATE' and old.status<>'draft' and new is distinct from old then
      raise exception 'Published control template versions are immutable';
    end if;
    if new.owning_department_head_assignment_id is not null then
      select * into v_assignment from public.staff_school_assignments where id=new.owning_department_head_assignment_id;
      if not found or v_assignment.school_id<>new.school_id or v_assignment.tenant_id<>new.tenant_id then
        raise exception 'Owning department head assignment must belong to the control template school';
      end if;
    end if;
    if new.supersedes_template_id is not null then
      select * into v_template from public.control_template where id=new.supersedes_template_id;
      if not found or v_template.school_id<>new.school_id or v_template.template_key<>new.template_key then
        raise exception 'Superseded control template must be the same school and template key';
      end if;
      if new.version_no<>v_template.version_no+1 then
        raise exception 'Control template version must increment its predecessor by one';
      end if;
    elsif new.version_no<>1 then
      raise exception 'First control template version must be version 1';
    end if;
  elsif tg_table_name='control_template_item' then
    select * into v_template from public.control_template where id=new.control_template_id;
    if not found or v_template.school_id<>new.school_id or v_template.tenant_id<>new.tenant_id then
      raise exception 'Control template item must match template school and tenant';
    end if;
    if v_template.status<>'draft' then raise exception 'Published control template items are immutable'; end if;
  elsif tg_table_name='control_cycle' then
    select * into v_template from public.control_template where id=new.control_template_id;
    if not found or v_template.school_id<>new.school_id or v_template.tenant_id<>new.tenant_id then
      raise exception 'Control cycle must match template school and tenant';
    end if;
    if tg_op='INSERT' and v_template.status<>'published' then raise exception 'Control cycle requires a published template version'; end if;
    if new.period_start<v_template.effective_from
       or (v_template.effective_to is not null and new.period_end>v_template.effective_to) then
      raise exception 'Control cycle period must fall within the published template effective period';
    end if;
    if tg_op='UPDATE' and new.control_template_id is distinct from old.control_template_id then
      raise exception 'Control cycle template version binding is immutable';
    end if;
    if new.responsible_staff_school_assignment_id is not null then
      select * into v_assignment from public.staff_school_assignments where id=new.responsible_staff_school_assignment_id;
      if not found or v_assignment.school_id<>new.school_id or v_assignment.tenant_id<>new.tenant_id then
        raise exception 'Responsible staff assignment must belong to the control cycle school';
      end if;
    end if;
  elsif tg_table_name='evidence_reference' then
    null;
  elsif tg_table_name='control_teacher_item' then
    select * into v_cycle from public.control_cycle where id=new.control_cycle_id;
    select * into v_item from public.control_template_item where id=new.control_template_item_id;
    if v_cycle.id is null or v_item.id is null or v_cycle.school_id<>new.school_id or v_item.school_id<>new.school_id
       or v_cycle.tenant_id<>new.tenant_id or v_item.tenant_id<>new.tenant_id then
      raise exception 'Control item must match cycle/template item school and tenant';
    end if;
    if v_item.control_template_id<>v_cycle.control_template_id then
      raise exception 'Control item must come from the cycle frozen template version';
    end if;
    if new.assigned_staff_school_assignment_id is not null then
      select * into v_assignment from public.staff_school_assignments where id=new.assigned_staff_school_assignment_id;
      if not found or v_assignment.school_id<>new.school_id or v_assignment.tenant_id<>new.tenant_id then
        raise exception 'Assigned staff placement must belong to the control cycle school';
      end if;
    end if;
    if new.evidence_reference_id is not null and not exists(
      select 1 from public.evidence_reference e where e.id=new.evidence_reference_id and e.school_id=new.school_id and e.tenant_id=new.tenant_id
    ) then raise exception 'Evidence reference must belong to the control cycle school'; end if;
  end if;
  return new;
end; $$;
revoke all on function app_private.enforce_control_scope() from public,anon,authenticated;

-- Revalidate successor-period invariants on draft updates as well as inserts.
drop trigger if exists control_template_version_period_trg on public.control_template;
create trigger control_template_version_period_trg
before insert or update on public.control_template
for each row execute function app_private.enforce_control_template_version_period();

-- Replace school-wide HOD RLS with owner-scoped access.
drop policy if exists "control leaders read templates" on public.control_template;
drop policy if exists "control leaders read template items" on public.control_template_item;
drop policy if exists "control leaders read cycles" on public.control_cycle;
drop policy if exists "control leaders read cycle items" on public.control_teacher_item;
drop policy if exists "control leaders read evidence refs" on public.evidence_reference;

create policy "scoped control leaders read templates" on public.control_template for select to authenticated
using (app_private.control_template_access(school_id,owning_department_head_assignment_id));
create policy "scoped control leaders read template items" on public.control_template_item for select to authenticated
using (exists(select 1 from public.control_template t where t.id=control_template_id and app_private.control_template_access(t.school_id,t.owning_department_head_assignment_id)));
create policy "scoped control leaders read cycles" on public.control_cycle for select to authenticated
using (exists(select 1 from public.control_template t where t.id=control_template_id and app_private.control_template_access(t.school_id,t.owning_department_head_assignment_id)));
create policy "scoped control leaders read cycle items" on public.control_teacher_item for select to authenticated
using (exists(select 1 from public.control_cycle c join public.control_template t on t.id=c.control_template_id where c.id=control_cycle_id and app_private.control_template_access(t.school_id,t.owning_department_head_assignment_id)));
create policy "scoped control leaders read evidence refs" on public.evidence_reference for select to authenticated
using (app_private.control_leader(school_id) or exists(
  select 1 from public.control_teacher_item i
  join public.control_cycle c on c.id=i.control_cycle_id
  join public.control_template t on t.id=c.control_template_id
  where i.evidence_reference_id=evidence_reference.id
    and app_private.control_template_access(t.school_id,t.owning_department_head_assignment_id)
));

-- Existing five-argument creator is retained for school-wide leadership only.
create or replace function public.create_control_template_version(
  p_school_id uuid,p_template_key text,p_name text,p_effective_from date,p_supersedes_template_id uuid default null
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_school public.schools%rowtype; v_version integer; v_id uuid;
begin
  if not app_private.control_leader(p_school_id) then raise exception 'Permission denied'; end if;
  select * into v_school from public.schools where id=p_school_id;
  if not found then raise exception 'School not found'; end if;
  if btrim(coalesce(p_template_key,''))='' or btrim(coalesce(p_name,''))='' or p_effective_from is null then raise exception 'Template key, name and effective date are required'; end if;
  if p_supersedes_template_id is null then v_version:=1;
  else select version_no+1 into v_version from public.control_template where id=p_supersedes_template_id and school_id=p_school_id and template_key=p_template_key;
    if v_version is null then raise exception 'Superseded control template not found'; end if;
  end if;
  insert into public.control_template(tenant_id,school_id,template_key,name,version_no,supersedes_template_id,effective_from,created_by_user_id)
  values(v_school.tenant_id,v_school.id,btrim(p_template_key),btrim(p_name),v_version,p_supersedes_template_id,p_effective_from,auth.uid()) returning id into v_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_school.tenant_id,v_school.id,auth.uid(),'control.template.version_created','control_template',v_id,jsonb_build_object('template_key',p_template_key,'version_no',v_version));
  return v_id;
end; $$;

-- Department-scoped creator. HOD must own the authoritative active staff placement.
create or replace function public.create_control_template_version(
  p_school_id uuid,p_template_key text,p_name text,p_effective_from date,p_supersedes_template_id uuid,p_owning_department_head_assignment_id uuid
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_school public.schools%rowtype; v_version integer; v_id uuid;
begin
  if p_owning_department_head_assignment_id is null then raise exception 'Department-scoped control template requires an owning department head assignment'; end if;
  if not app_private.control_template_access(p_school_id,p_owning_department_head_assignment_id) then raise exception 'Permission denied'; end if;
  select * into v_school from public.schools where id=p_school_id;
  if not found then raise exception 'School not found'; end if;
  if btrim(coalesce(p_template_key,''))='' or btrim(coalesce(p_name,''))='' or p_effective_from is null then raise exception 'Template key, name and effective date are required'; end if;
  if p_supersedes_template_id is null then v_version:=1;
  else
    select version_no+1 into v_version from public.control_template
    where id=p_supersedes_template_id and school_id=p_school_id and template_key=p_template_key
      and owning_department_head_assignment_id=p_owning_department_head_assignment_id;
    if v_version is null then raise exception 'Superseded control template not found in permitted department'; end if;
  end if;
  insert into public.control_template(tenant_id,school_id,template_key,name,version_no,supersedes_template_id,effective_from,owning_department_head_assignment_id,created_by_user_id)
  values(v_school.tenant_id,v_school.id,btrim(p_template_key),btrim(p_name),v_version,p_supersedes_template_id,p_effective_from,p_owning_department_head_assignment_id,auth.uid()) returning id into v_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_school.tenant_id,v_school.id,auth.uid(),'control.template.version_created','control_template',v_id,jsonb_build_object('template_key',p_template_key,'version_no',v_version,'owning_department_head_assignment_id',p_owning_department_head_assignment_id));
  return v_id;
end; $$;

create or replace function public.add_control_template_item(
  p_template_id uuid,p_item_key text,p_label text,p_sort_order integer,p_instructions text default null,p_evidence_required boolean default false,p_reviewer_required boolean default false
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_t public.control_template%rowtype; v_id uuid;
begin
  select * into v_t from public.control_template where id=p_template_id;
  if not found then raise exception 'Control template not found'; end if;
  if not app_private.control_template_access(v_t.school_id,v_t.owning_department_head_assignment_id) then raise exception 'Permission denied'; end if;
  if v_t.status<>'draft' then raise exception 'Published control template versions are immutable'; end if;
  insert into public.control_template_item(tenant_id,school_id,control_template_id,item_key,label,instructions,sort_order,evidence_required,reviewer_required)
  values(v_t.tenant_id,v_t.school_id,v_t.id,btrim(p_item_key),btrim(p_label),p_instructions,p_sort_order,p_evidence_required,p_reviewer_required) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.publish_control_template(p_template_id uuid,p_effective_to date default null)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_t public.control_template%rowtype;
begin
  select * into v_t from public.control_template where id=p_template_id for update;
  if not found then raise exception 'Control template not found'; end if;
  if not app_private.control_template_access(v_t.school_id,v_t.owning_department_head_assignment_id) then raise exception 'Permission denied'; end if;
  if v_t.status<>'draft' then raise exception 'Only draft control templates can be published'; end if;
  if not exists(select 1 from public.control_template_item i where i.control_template_id=v_t.id) then raise exception 'Control template requires at least one item'; end if;
  if p_effective_to is not null and p_effective_to<v_t.effective_from then raise exception 'Effective-to date cannot precede effective-from date'; end if;
  update public.control_template set status='published',effective_to=p_effective_to,published_at=now() where id=v_t.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_t.tenant_id,v_t.school_id,auth.uid(),'control.template.published','control_template',v_t.id,jsonb_build_object('version_no',v_t.version_no));
  return true;
end; $$;

create or replace function public.create_control_cycle(
  p_template_id uuid,p_cycle_key text,p_period_start date,p_period_end date,p_responsible_staff_school_assignment_id uuid default null
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_t public.control_template%rowtype; v_id uuid;
begin
  select * into v_t from public.control_template where id=p_template_id;
  if not found then raise exception 'Control template not found'; end if;
  if not app_private.control_template_access(v_t.school_id,v_t.owning_department_head_assignment_id) then raise exception 'Permission denied'; end if;
  if v_t.status<>'published' then raise exception 'Control cycle requires a published template version'; end if;
  if p_period_end<p_period_start then raise exception 'Control cycle end cannot precede start'; end if;
  if p_period_start<v_t.effective_from or (v_t.effective_to is not null and p_period_end>v_t.effective_to) then
    raise exception 'Control cycle period must fall within the published template effective period';
  end if;
  insert into public.control_cycle(tenant_id,school_id,control_template_id,cycle_key,period_start,period_end,responsible_staff_school_assignment_id,created_by_user_id)
  values(v_t.tenant_id,v_t.school_id,v_t.id,btrim(p_cycle_key),p_period_start,p_period_end,p_responsible_staff_school_assignment_id,auth.uid()) returning id into v_id;
  insert into public.control_teacher_item(tenant_id,school_id,control_cycle_id,control_template_item_id)
  select v_t.tenant_id,v_t.school_id,v_id,i.id from public.control_template_item i where i.control_template_id=v_t.id order by i.sort_order;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_t.tenant_id,v_t.school_id,auth.uid(),'control.cycle.created','control_cycle',v_id,jsonb_build_object('template_id',v_t.id,'version_no',v_t.version_no,'period_start',p_period_start,'period_end',p_period_end));
  return v_id;
end; $$;

create or replace function public.record_control_item(
  p_control_teacher_item_id uuid,p_status text,p_remarks text default null,p_evidence_reference_type text default null,p_evidence_reference_value text default null
) returns boolean language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_i public.control_teacher_item%rowtype; v_c public.control_cycle%rowtype; v_t public.control_template%rowtype; v_ti public.control_template_item%rowtype; v_e uuid;
begin
  select * into v_i from public.control_teacher_item where id=p_control_teacher_item_id for update;
  if not found then raise exception 'Control item not found'; end if;
  select * into v_c from public.control_cycle where id=v_i.control_cycle_id;
  select * into v_t from public.control_template where id=v_c.control_template_id;
  if not app_private.control_template_access(v_t.school_id,v_t.owning_department_head_assignment_id) then raise exception 'Permission denied'; end if;
  select * into v_ti from public.control_template_item where id=v_i.control_template_item_id;
  if v_c.status<>'open' then raise exception 'Completed control cycles are immutable'; end if;
  if p_status not in ('complete','not_applicable') then raise exception 'Recorded control item status must be complete or not_applicable'; end if;
  if v_ti.evidence_required and nullif(btrim(coalesce(p_evidence_reference_value,'')),'') is null then raise exception 'Evidence is required for this control item'; end if;
  if nullif(btrim(coalesce(p_evidence_reference_value,'')),'') is not null then
    if p_evidence_reference_type not in ('document','url','record','note') then raise exception 'Valid evidence reference type is required'; end if;
    insert into public.evidence_reference(tenant_id,school_id,reference_type,reference_value,created_by_user_id)
    values(v_i.tenant_id,v_i.school_id,p_evidence_reference_type,btrim(p_evidence_reference_value),auth.uid()) returning id into v_e;
  end if;
  update public.control_teacher_item set status=p_status,remarks=p_remarks,evidence_reference_id=v_e,completed_at=now(),completed_by_user_id=auth.uid(),updated_at=now() where id=v_i.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_i.tenant_id,v_i.school_id,auth.uid(),'control.item.recorded','control_teacher_item',v_i.id,jsonb_build_object('status',p_status,'evidence_reference_id',v_e));
  return true;
end; $$;

create or replace function public.complete_control_cycle(p_cycle_id uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_c public.control_cycle%rowtype; v_t public.control_template%rowtype;
begin
  select * into v_c from public.control_cycle where id=p_cycle_id for update;
  if not found then raise exception 'Control cycle not found'; end if;
  select * into v_t from public.control_template where id=v_c.control_template_id;
  if not app_private.control_template_access(v_t.school_id,v_t.owning_department_head_assignment_id) then raise exception 'Permission denied'; end if;
  if v_c.status<>'open' then raise exception 'Only open control cycles can be completed'; end if;
  if exists(select 1 from public.control_teacher_item i where i.control_cycle_id=v_c.id and i.status='pending') then raise exception 'All control items must be recorded before cycle completion'; end if;
  update public.control_cycle set status='completed',completed_at=now(),completed_by_user_id=auth.uid() where id=v_c.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_c.tenant_id,v_c.school_id,auth.uid(),'control.cycle.completed','control_cycle',v_c.id,'{}'::jsonb);
  return true;
end; $$;

create or replace function public.review_control_cycle(p_cycle_id uuid,p_remarks text default null)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_c public.control_cycle%rowtype; v_t public.control_template%rowtype;
begin
  select * into v_c from public.control_cycle where id=p_cycle_id for update;
  if not found then raise exception 'Control cycle not found'; end if;
  select * into v_t from public.control_template where id=v_c.control_template_id;
  if not app_private.control_template_access(v_t.school_id,v_t.owning_department_head_assignment_id) then raise exception 'Permission denied'; end if;
  if v_c.status<>'completed' then raise exception 'Only completed control cycles can be reviewed'; end if;
  update public.control_cycle set status='reviewed',reviewed_at=now(),reviewed_by_user_id=auth.uid(),review_remarks=p_remarks where id=v_c.id;
  update public.control_teacher_item set reviewed_at=now(),reviewed_by_user_id=auth.uid(),review_remarks=p_remarks,updated_at=now() where control_cycle_id=v_c.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_c.tenant_id,v_c.school_id,auth.uid(),'control.cycle.reviewed','control_cycle',v_c.id,jsonb_build_object('remarks',p_remarks));
  return true;
end; $$;

revoke all on function public.create_control_template_version(uuid,text,text,date,uuid,uuid) from public,anon;
grant execute on function public.create_control_template_version(uuid,text,text,date,uuid,uuid) to authenticated;

comment on column public.control_template.owning_department_head_assignment_id is
'Optional department ownership anchor. HOD access resolves through the authoritative active school membership staff_member_id and staff_school_assignments placement; null means school-wide leadership only.';