-- Operational detention sessions and immutable report-document persistence.
-- Detention remains a school discipline workflow and is not statutory attendance.
-- Rendered report documents are artifacts of certified/published snapshots and never
-- recompute historical results from live marks.

create table if not exists public.detention_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  session_date date not null,
  starts_at time,
  ends_at time,
  supervisor_staff_member_id uuid references public.staff_members(id) on delete restrict,
  location text,
  status text not null default 'planned' check (status in ('planned','open','completed','cancelled')),
  notes text,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  completed_by_user_id uuid references auth.users(id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check ((status = 'completed' and completed_at is not null) or status <> 'completed')
);
create index if not exists detention_sessions_school_date_idx
  on public.detention_sessions(school_id, session_date desc, status);
create index if not exists detention_sessions_supervisor_idx
  on public.detention_sessions(supervisor_staff_member_id, session_date desc)
  where supervisor_staff_member_id is not null;

create table if not exists public.detention_session_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  detention_session_id uuid not null references public.detention_sessions(id) on delete cascade,
  obligation_id uuid not null references public.late_detention_obligations(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  attendance_status text not null default 'scheduled' check (attendance_status in ('scheduled','attended','absent','excused')),
  outcome_note text,
  recorded_by_user_id uuid references auth.users(id) on delete restrict,
  recorded_at timestamptz,
  created_at timestamptz not null default now(),
  unique(detention_session_id, obligation_id)
);
create index if not exists detention_session_items_session_idx
  on public.detention_session_items(detention_session_id, attendance_status, learner_id);
create index if not exists detention_session_items_obligation_idx
  on public.detention_session_items(obligation_id);

alter table public.detention_sessions enable row level security;
alter table public.detention_session_items enable row level security;

create policy "authorized staff read detention sessions" on public.detention_sessions
for select to authenticated
using (
  app_private.can_view_operational_learners(school_id)
  or app_private.has_school_duty(school_id,'late_arrival_recorder',session_date)
  or exists (
    select 1 from public.staff_members sm
    where sm.id = supervisor_staff_member_id
      and sm.user_id = (select auth.uid())
      and sm.status = 'active'
  )
);

create policy "authorized staff read detention session items" on public.detention_session_items
for select to authenticated
using (
  app_private.can_view_operational_learners(school_id)
  or app_private.has_school_duty(school_id,'late_arrival_recorder')
  or exists (
    select 1
    from public.detention_sessions ds
    join public.staff_members sm on sm.id = ds.supervisor_staff_member_id
    where ds.id = detention_session_id
      and sm.user_id = (select auth.uid())
      and sm.status = 'active'
  )
);

create or replace function app_private.enforce_detention_session_item_scope()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_session public.detention_sessions%rowtype;
  v_obligation public.late_detention_obligations%rowtype;
begin
  select * into v_session from public.detention_sessions where id = new.detention_session_id;
  if not found then raise exception 'Detention session not found'; end if;
  select * into v_obligation from public.late_detention_obligations where id = new.obligation_id;
  if not found then raise exception 'Detention obligation not found'; end if;
  if new.tenant_id <> v_session.tenant_id or new.school_id <> v_session.school_id then
    raise exception 'Detention item scope must match session';
  end if;
  if new.tenant_id <> v_obligation.tenant_id or new.school_id <> v_obligation.school_id or new.learner_id <> v_obligation.learner_id then
    raise exception 'Detention item scope must match obligation';
  end if;
  return new;
end;
$$;

drop trigger if exists detention_session_item_scope_trg on public.detention_session_items;
create trigger detention_session_item_scope_trg
before insert or update on public.detention_session_items
for each row execute function app_private.enforce_detention_session_item_scope();
revoke all on function app_private.enforce_detention_session_item_scope() from public,anon,authenticated;

create or replace function public.create_detention_session(
  p_school_id uuid,
  p_session_date date,
  p_starts_at time default null,
  p_ends_at time default null,
  p_supervisor_staff_member_id uuid default null,
  p_location text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_tenant_id uuid;
  v_session_id uuid;
  v_staff public.staff_members%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'Permission denied';
  end if;
  select tenant_id into v_tenant_id from public.schools where id=p_school_id;
  if v_tenant_id is null then raise exception 'School not found'; end if;
  if p_supervisor_staff_member_id is not null then
    select * into v_staff from public.staff_members where id=p_supervisor_staff_member_id;
    if not found or v_staff.tenant_id<>v_tenant_id or v_staff.status<>'active' then
      raise exception 'Active supervisor staff member not found in tenant';
    end if;
  end if;
  insert into public.detention_sessions(
    tenant_id,school_id,session_date,starts_at,ends_at,supervisor_staff_member_id,location,notes,created_by_user_id
  ) values (
    v_tenant_id,p_school_id,p_session_date,p_starts_at,p_ends_at,p_supervisor_staff_member_id,
    nullif(btrim(p_location),''),nullif(btrim(p_notes),''),auth.uid()
  ) returning id into v_session_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_tenant_id,p_school_id,auth.uid(),'detention.session.created','detention_session',v_session_id,jsonb_build_object('session_date',p_session_date));
  return v_session_id;
end;
$$;

create or replace function public.populate_detention_session(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_session public.detention_sessions%rowtype;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_session from public.detention_sessions where id=p_session_id for update;
  if not found then raise exception 'Detention session not found'; end if;
  if not (app_private.has_school_role(v_session.school_id,array['school_admin','principal','deputy_principal'])
          or app_private.has_school_duty(v_session.school_id,'late_arrival_recorder',v_session.session_date)) then
    raise exception 'Permission denied';
  end if;
  if v_session.status not in ('planned','open') then raise exception 'Session cannot be populated in its current state'; end if;

  insert into public.detention_session_items(tenant_id,school_id,detention_session_id,obligation_id,learner_id)
  select o.tenant_id,o.school_id,v_session.id,o.id,o.learner_id
  from public.late_detention_obligations o
  where o.school_id=v_session.school_id
    and o.status in ('pending','carried_forward')
    and o.due_on <= v_session.session_date
  on conflict(detention_session_id,obligation_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.record_detention_attendance(
  p_session_id uuid,
  p_obligation_id uuid,
  p_attendance_status text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_session public.detention_sessions%rowtype;
  v_item public.detention_session_items%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_attendance_status not in ('attended','absent','excused') then raise exception 'Invalid detention attendance status'; end if;
  select * into v_session from public.detention_sessions where id=p_session_id for update;
  if not found then raise exception 'Detention session not found'; end if;
  if not (
    app_private.has_school_role(v_session.school_id,array['school_admin','principal','deputy_principal'])
    or app_private.has_school_duty(v_session.school_id,'late_arrival_recorder',v_session.session_date)
    or exists(select 1 from public.staff_members sm where sm.id=v_session.supervisor_staff_member_id and sm.user_id=auth.uid() and sm.status='active')
  ) then raise exception 'Permission denied'; end if;
  if v_session.status not in ('planned','open') then raise exception 'Session is not open for attendance'; end if;

  update public.detention_session_items
  set attendance_status=p_attendance_status,
      outcome_note=nullif(btrim(p_note),''),
      recorded_by_user_id=auth.uid(),recorded_at=now()
  where detention_session_id=p_session_id and obligation_id=p_obligation_id
  returning * into v_item;
  if not found then raise exception 'Detention session item not found'; end if;

  if p_attendance_status='attended' then
    update public.late_detention_obligations
      set status='completed',completed_at=now(),completed_by_user_id=auth.uid(),resolution_note=coalesce(nullif(btrim(p_note),''),resolution_note),updated_at=now()
    where id=p_obligation_id and status in ('pending','carried_forward');
  end if;
  return true;
end;
$$;

create or replace function public.complete_detention_session(p_session_id uuid,p_notes text default null)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_session public.detention_sessions%rowtype;
  v_unrecorded integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_session from public.detention_sessions where id=p_session_id for update;
  if not found then raise exception 'Detention session not found'; end if;
  if not (
    app_private.has_school_role(v_session.school_id,array['school_admin','principal','deputy_principal'])
    or app_private.has_school_duty(v_session.school_id,'late_arrival_recorder',v_session.session_date)
    or exists(select 1 from public.staff_members sm where sm.id=v_session.supervisor_staff_member_id and sm.user_id=auth.uid() and sm.status='active')
  ) then raise exception 'Permission denied'; end if;
  select count(*) into v_unrecorded from public.detention_session_items where detention_session_id=p_session_id and attendance_status='scheduled';
  if v_unrecorded>0 then raise exception 'All scheduled learners must have a detention attendance outcome'; end if;
  update public.detention_sessions
  set status='completed',completed_by_user_id=auth.uid(),completed_at=now(),notes=coalesce(nullif(btrim(p_notes),''),notes),updated_at=now()
  where id=p_session_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_session.tenant_id,v_session.school_id,auth.uid(),'detention.session.completed','detention_session',v_session.id,jsonb_build_object('session_date',v_session.session_date));
  return true;
end;
$$;

revoke all on function public.create_detention_session(uuid,date,time,time,uuid,text,text) from public,anon;
grant execute on function public.create_detention_session(uuid,date,time,time,uuid,text,text) to authenticated;
revoke all on function public.populate_detention_session(uuid) from public,anon;
grant execute on function public.populate_detention_session(uuid) to authenticated;
revoke all on function public.record_detention_attendance(uuid,uuid,text,text) from public,anon;
grant execute on function public.record_detention_attendance(uuid,uuid,text,text) to authenticated;
revoke all on function public.complete_detention_session(uuid,text) from public,anon;
grant execute on function public.complete_detention_session(uuid,text) to authenticated;

create table if not exists public.report_card_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  snapshot_id uuid not null references public.report_card_snapshots(id) on delete restrict,
  template_key text not null,
  template_version text not null,
  document_format text not null default 'pdf' check (document_format in ('pdf','html')),
  storage_bucket text not null,
  storage_path text not null,
  content_sha256 text,
  page_count integer check (page_count is null or page_count > 0),
  status text not null default 'ready' check (status in ('ready','failed','superseded')),
  generated_by_user_id uuid references auth.users(id) on delete restrict,
  generated_at timestamptz not null default now(),
  failure_detail text,
  created_at timestamptz not null default now(),
  unique(snapshot_id,template_key,template_version,document_format,storage_path),
  check (content_sha256 is null or content_sha256 ~ '^[0-9a-fA-F]{64}$')
);
create index if not exists report_card_documents_snapshot_idx
  on public.report_card_documents(snapshot_id,generated_at desc);
create index if not exists report_card_documents_school_idx
  on public.report_card_documents(school_id,status,generated_at desc);
alter table public.report_card_documents enable row level security;

create policy "authorized users read report card documents" on public.report_card_documents
for select to authenticated
using (
  exists (
    select 1 from public.report_card_snapshots rs
    where rs.id=report_card_documents.snapshot_id
      and (
        app_private.has_school_role(rs.school_id,array['school_admin','principal','deputy_principal','hod','teacher','class_teacher'])
        or app_private.has_platform_role(array['platform_admin'])
        or (
          rs.status='published'
          and exists (
            select 1 from public.learner_guardians lg
            join public.guardian_user_links gul on gul.guardian_id=lg.guardian_id
            where lg.learner_id=rs.learner_id
              and lg.effective_from<=current_date
              and (lg.effective_to is null or lg.effective_to>=current_date)
              and gul.user_id=(select auth.uid())
          )
        )
      )
  )
);

create or replace function app_private.enforce_report_document_scope()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_snapshot public.report_card_snapshots%rowtype;
begin
  select * into v_snapshot from public.report_card_snapshots where id=new.snapshot_id;
  if not found then raise exception 'Report-card snapshot not found'; end if;
  if new.tenant_id<>v_snapshot.tenant_id or new.school_id<>v_snapshot.school_id then
    raise exception 'Report document scope must match snapshot';
  end if;
  if v_snapshot.status not in ('certified','published','superseded') then
    raise exception 'Report documents may only be registered for certified historical snapshots';
  end if;
  return new;
end;
$$;

drop trigger if exists report_card_document_scope_trg on public.report_card_documents;
create trigger report_card_document_scope_trg
before insert or update on public.report_card_documents
for each row execute function app_private.enforce_report_document_scope();
revoke all on function app_private.enforce_report_document_scope() from public,anon,authenticated;

create or replace function public.register_report_card_document(
  p_snapshot_id uuid,
  p_template_key text,
  p_template_version text,
  p_document_format text,
  p_storage_bucket text,
  p_storage_path text,
  p_content_sha256 text default null,
  p_page_count integer default null
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_snapshot public.report_card_snapshots%rowtype;
  v_document_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_snapshot from public.report_card_snapshots where id=p_snapshot_id;
  if not found then raise exception 'Report-card snapshot not found'; end if;
  if not app_private.has_school_role(v_snapshot.school_id,array['school_admin','principal','deputy_principal'])
     and not app_private.has_platform_role(array['platform_admin']) then
    raise exception 'Permission denied';
  end if;
  if v_snapshot.status not in ('certified','published','superseded') then raise exception 'Snapshot must be certified before rendering'; end if;
  if btrim(coalesce(p_template_key,''))='' or btrim(coalesce(p_template_version,''))='' then raise exception 'Template identity is required'; end if;
  if btrim(coalesce(p_storage_bucket,''))='' or btrim(coalesce(p_storage_path,''))='' then raise exception 'Document storage location is required'; end if;

  insert into public.report_card_documents(
    tenant_id,school_id,snapshot_id,template_key,template_version,document_format,storage_bucket,storage_path,content_sha256,page_count,generated_by_user_id,status
  ) values (
    v_snapshot.tenant_id,v_snapshot.school_id,v_snapshot.id,btrim(p_template_key),btrim(p_template_version),coalesce(nullif(btrim(p_document_format),''),'pdf'),
    btrim(p_storage_bucket),btrim(p_storage_path),nullif(lower(btrim(p_content_sha256)),''),p_page_count,auth.uid(),'ready'
  ) returning id into v_document_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_snapshot.tenant_id,v_snapshot.school_id,auth.uid(),'report_card.document.registered','report_card_document',v_document_id,jsonb_build_object('snapshot_id',v_snapshot.id,'format',p_document_format,'template_key',p_template_key,'template_version',p_template_version));
  return v_document_id;
end;
$$;

revoke all on public.detention_sessions from anon;
revoke all on public.detention_session_items from anon;
revoke all on public.report_card_documents from anon;
grant select on public.detention_sessions,public.detention_session_items,public.report_card_documents to authenticated;
revoke all on function public.register_report_card_document(uuid,text,text,text,text,text,text,integer) from public,anon;
grant execute on function public.register_report_card_document(uuid,text,text,text,text,text,text,integer) to authenticated;
