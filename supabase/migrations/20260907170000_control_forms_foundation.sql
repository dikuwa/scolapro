-- N20 configurable control / management forms foundation.
-- Templates are effective-dated immutable versions. Operational cycles bind one
-- exact version so later edits cannot rewrite historical or completed checklists.
-- Staff references reuse authoritative staff_school_assignments; no shadow staff,
-- learner, Ministry identifier, or calendar facts are introduced here.

create table public.control_template (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  template_key text not null check (btrim(template_key) <> ''),
  name text not null check (btrim(name) <> ''),
  version_no integer not null check (version_no > 0),
  supersedes_template_id uuid references public.control_template(id) on delete restrict,
  effective_from date not null,
  effective_to date,
  status text not null default 'draft' check (status in ('draft','published','retired')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  check (effective_to is null or effective_to >= effective_from),
  check ((status='published' and published_at is not null) or status<>'published'),
  check (supersedes_template_id is null or supersedes_template_id<>id),
  unique (school_id,template_key,version_no)
);

create index control_template_school_effective_idx
  on public.control_template(school_id,template_key,effective_from,effective_to);

create table public.control_template_item (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  control_template_id uuid not null references public.control_template(id) on delete restrict,
  item_key text not null check (btrim(item_key)<>''),
  label text not null check (btrim(label)<>''),
  instructions text,
  sort_order integer not null check (sort_order>0),
  evidence_required boolean not null default false,
  reviewer_required boolean not null default false,
  created_at timestamptz not null default now(),
  unique(control_template_id,item_key),
  unique(control_template_id,sort_order)
);

create table public.control_cycle (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  control_template_id uuid not null references public.control_template(id) on delete restrict,
  cycle_key text not null check (btrim(cycle_key)<>''),
  period_start date not null,
  period_end date not null,
  responsible_staff_school_assignment_id uuid references public.staff_school_assignments(id) on delete restrict,
  status text not null default 'open' check (status in ('open','completed','reviewed')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by_user_id uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references auth.users(id) on delete restrict,
  review_remarks text,
  check (period_end>=period_start),
  check ((status in ('completed','reviewed') and completed_at is not null and completed_by_user_id is not null) or status='open'),
  check ((status='reviewed' and reviewed_at is not null and reviewed_by_user_id is not null) or status<>'reviewed'),
  unique(school_id,cycle_key)
);

create index control_cycle_school_period_idx on public.control_cycle(school_id,period_start,period_end);
create index control_cycle_template_idx on public.control_cycle(control_template_id);

create table public.evidence_reference (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  reference_type text not null check (reference_type in ('document','url','record','note')),
  reference_value text not null check (btrim(reference_value)<>''),
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.control_teacher_item (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  control_cycle_id uuid not null references public.control_cycle(id) on delete restrict,
  control_template_item_id uuid not null references public.control_template_item(id) on delete restrict,
  assigned_staff_school_assignment_id uuid references public.staff_school_assignments(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','complete','not_applicable')),
  remarks text,
  evidence_reference_id uuid references public.evidence_reference(id) on delete restrict,
  completed_at timestamptz,
  completed_by_user_id uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references auth.users(id) on delete restrict,
  review_remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='pending' and completed_at is null and completed_by_user_id is null) or status<>'pending'),
  unique(control_cycle_id,control_template_item_id)
);

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

create trigger control_template_scope_trg before insert or update on public.control_template for each row execute function app_private.enforce_control_scope();
create trigger control_template_item_scope_trg before insert or update on public.control_template_item for each row execute function app_private.enforce_control_scope();
create trigger control_cycle_scope_trg before insert or update on public.control_cycle for each row execute function app_private.enforce_control_scope();
create trigger evidence_reference_scope_trg before insert or update on public.evidence_reference for each row execute function app_private.enforce_control_scope();
create trigger control_teacher_item_scope_trg before insert or update on public.control_teacher_item for each row execute function app_private.enforce_control_scope();

create or replace function app_private.control_leader(p_school_id uuid)
returns boolean language sql stable security definer
set search_path=pg_catalog,public,app_private as $$
  select auth.uid() is not null and exists(
    select 1 from public.school_memberships sm
    where sm.school_id=p_school_id and sm.user_id=auth.uid()
      and sm.role_key in ('school_admin','principal','deputy_principal','hod')
      and sm.active_from<=current_date and (sm.active_to is null or sm.active_to>=current_date)
  );
$$;
revoke all on function app_private.control_leader(uuid) from public,anon,authenticated;

alter table public.control_template enable row level security;
alter table public.control_template_item enable row level security;
alter table public.control_cycle enable row level security;
alter table public.control_teacher_item enable row level security;
alter table public.evidence_reference enable row level security;

create policy "control leaders read templates" on public.control_template for select to authenticated using (app_private.control_leader(school_id));
create policy "control leaders read template items" on public.control_template_item for select to authenticated using (app_private.control_leader(school_id));
create policy "control leaders read cycles" on public.control_cycle for select to authenticated using (app_private.control_leader(school_id));
create policy "control leaders read cycle items" on public.control_teacher_item for select to authenticated using (app_private.control_leader(school_id));
create policy "control leaders read evidence refs" on public.evidence_reference for select to authenticated using (app_private.control_leader(school_id));

revoke all on public.control_template,public.control_template_item,public.control_cycle,public.control_teacher_item,public.evidence_reference from anon;
revoke insert,update,delete on public.control_template,public.control_template_item,public.control_cycle,public.control_teacher_item,public.evidence_reference from authenticated;
grant select on public.control_template,public.control_template_item,public.control_cycle,public.control_teacher_item,public.evidence_reference to authenticated;

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

create or replace function public.add_control_template_item(
  p_template_id uuid,p_item_key text,p_label text,p_sort_order integer,p_instructions text default null,p_evidence_required boolean default false,p_reviewer_required boolean default false
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_t public.control_template%rowtype; v_id uuid;
begin
  select * into v_t from public.control_template where id=p_template_id;
  if not found then raise exception 'Control template not found'; end if;
  if not app_private.control_leader(v_t.school_id) then raise exception 'Permission denied'; end if;
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
  if not app_private.control_leader(v_t.school_id) then raise exception 'Permission denied'; end if;
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
  if not app_private.control_leader(v_t.school_id) then raise exception 'Permission denied'; end if;
  if v_t.status<>'published' then raise exception 'Control cycle requires a published template version'; end if;
  if p_period_end<p_period_start then raise exception 'Control cycle end cannot precede start'; end if;
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
declare v_i public.control_teacher_item%rowtype; v_c public.control_cycle%rowtype; v_ti public.control_template_item%rowtype; v_e uuid;
begin
  select * into v_i from public.control_teacher_item where id=p_control_teacher_item_id for update;
  if not found then raise exception 'Control item not found'; end if;
  if not app_private.control_leader(v_i.school_id) then raise exception 'Permission denied'; end if;
  select * into v_c from public.control_cycle where id=v_i.control_cycle_id;
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
declare v_c public.control_cycle%rowtype;
begin
  select * into v_c from public.control_cycle where id=p_cycle_id for update;
  if not found then raise exception 'Control cycle not found'; end if;
  if not app_private.control_leader(v_c.school_id) then raise exception 'Permission denied'; end if;
  if v_c.status<>'open' then raise exception 'Only open control cycles can be completed'; end if;
  if exists(select 1 from public.control_teacher_item i where i.control_cycle_id=v_c.id and i.status='pending') then raise exception 'All control items must be recorded before cycle completion'; end if;
  update public.control_cycle set status='completed',completed_at=now(),completed_by_user_id=auth.uid() where id=v_c.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_c.tenant_id,v_c.school_id,auth.uid(),'control.cycle.completed','control_cycle',v_c.id,'{}'::jsonb);
  return true;
end; $$;

create or replace function public.review_control_cycle(p_cycle_id uuid,p_remarks text default null)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_c public.control_cycle%rowtype;
begin
  select * into v_c from public.control_cycle where id=p_cycle_id for update;
  if not found then raise exception 'Control cycle not found'; end if;
  if not app_private.control_leader(v_c.school_id) then raise exception 'Permission denied'; end if;
  if v_c.status<>'completed' then raise exception 'Only completed control cycles can be reviewed'; end if;
  update public.control_cycle set status='reviewed',reviewed_at=now(),reviewed_by_user_id=auth.uid(),review_remarks=p_remarks where id=v_c.id;
  update public.control_teacher_item set reviewed_at=now(),reviewed_by_user_id=auth.uid(),review_remarks=p_remarks,updated_at=now() where control_cycle_id=v_c.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_c.tenant_id,v_c.school_id,auth.uid(),'control.cycle.reviewed','control_cycle',v_c.id,jsonb_build_object('remarks',p_remarks));
  return true;
end; $$;

revoke all on function public.create_control_template_version(uuid,text,text,date,uuid) from public,anon;
revoke all on function public.add_control_template_item(uuid,text,text,integer,text,boolean,boolean) from public,anon;
revoke all on function public.publish_control_template(uuid,date) from public,anon;
revoke all on function public.create_control_cycle(uuid,text,date,date,uuid) from public,anon;
revoke all on function public.record_control_item(uuid,text,text,text,text) from public,anon;
revoke all on function public.complete_control_cycle(uuid) from public,anon;
revoke all on function public.review_control_cycle(uuid,text) from public,anon;
grant execute on function public.create_control_template_version(uuid,text,text,date,uuid) to authenticated;
grant execute on function public.add_control_template_item(uuid,text,text,integer,text,boolean,boolean) to authenticated;
grant execute on function public.publish_control_template(uuid,date) to authenticated;
grant execute on function public.create_control_cycle(uuid,text,date,date,uuid) to authenticated;
grant execute on function public.record_control_item(uuid,text,text,text,text) to authenticated;
grant execute on function public.complete_control_cycle(uuid) to authenticated;
grant execute on function public.review_control_cycle(uuid,text) to authenticated;

comment on table public.control_template is 'N20 school-scoped immutable/effective-dated control-form template versions.';
comment on table public.control_cycle is 'N20 operational checklist cycle frozen to one published control template version.';
comment on table public.control_teacher_item is 'N20 cycle item state; authoritative staff placement may be referenced but is never copied.';