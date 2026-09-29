-- Issue #871: Teaching Files shared-resource / external-link reference foundation.
-- Reference metadata only. Binary teacher documents remain in the existing private
-- teacher_professional_documents storage lifecycle; no second file store is created.

create table public.operational_file_resources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete restrict,
  school_id uuid references public.schools(id) on delete restrict,
  subject_id uuid references public.subjects(id) on delete restrict,
  owner_staff_member_id uuid references public.staff_members(id) on delete restrict,
  teacher_document_id uuid references public.teacher_professional_documents(id) on delete restrict,
  scope_type text not null check (scope_type in ('national','school','subject_phase','teacher')),
  visibility text not null check (visibility in ('platform','school','subject','private')),
  title text not null,
  description text,
  provider text not null,
  authority_label text not null,
  external_url text,
  academic_year integer check (academic_year is null or academic_year between 2000 and 2200),
  grade_from smallint check (grade_from is null or grade_from between 0 and 20),
  grade_to smallint check (grade_to is null or grade_to between 0 and 20),
  effective_from date,
  effective_to date,
  status text not null default 'active' check (status in ('active','archived')),
  created_by_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by_user_id uuid references auth.users(id) on delete restrict,
  check (effective_to is null or effective_from is null or effective_to >= effective_from),
  check (grade_to is null or grade_from is null or grade_to >= grade_from),
  check (external_url is null or external_url ~* '^https://'),
  check (external_url is not null or teacher_document_id is not null),
  check (
    (scope_type='national' and visibility='platform' and tenant_id is null and school_id is null and subject_id is null and owner_staff_member_id is null and teacher_document_id is null)
    or
    (scope_type='school' and visibility='school' and tenant_id is not null and school_id is not null and subject_id is null and owner_staff_member_id is null and teacher_document_id is null)
    or
    (scope_type='subject_phase' and visibility='subject' and tenant_id is not null and school_id is not null and subject_id is not null and owner_staff_member_id is null and teacher_document_id is null)
    or
    (scope_type='teacher' and visibility='private' and tenant_id is not null and school_id is not null and owner_staff_member_id is not null)
  ),
  check (
    (status='active' and archived_at is null and archived_by_user_id is null)
    or
    (status='archived' and archived_at is not null and archived_by_user_id is not null)
  )
);

create table public.operational_file_resource_bindings (
  resource_id uuid not null references public.operational_file_resources(id) on delete cascade,
  template_item_id uuid not null references public.operational_file_template_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(resource_id,template_item_id)
);

create index operational_file_resources_school_scope_idx
  on public.operational_file_resources(school_id,subject_id,owner_staff_member_id,status);
create index operational_file_resources_effective_idx
  on public.operational_file_resources(scope_type,effective_from,effective_to);
create index operational_file_resource_bindings_item_idx
  on public.operational_file_resource_bindings(template_item_id,resource_id);

alter table public.operational_file_resources enable row level security;
alter table public.operational_file_resource_bindings enable row level security;

revoke all on public.operational_file_resources from anon, authenticated;
revoke all on public.operational_file_resource_bindings from anon, authenticated;
grant select on public.operational_file_resources to authenticated;
grant select on public.operational_file_resource_bindings to authenticated;

create or replace function app_private.user_owns_operational_file_resource(
  p_user_id uuid,
  p_school_id uuid,
  p_staff_member_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select p_user_id is not null
    and app_private.user_current_school_matches(p_user_id,p_school_id)
    and not exists(
      select 1 from public.platform_memberships pm
      where pm.user_id=p_user_id
        and pm.role_key in ('platform_admin','platform_support')
        and pm.active_from<=current_date
        and (pm.active_to is null or pm.active_to>=current_date)
    )
    and exists(
      select 1
      from public.school_memberships sm
      where sm.user_id=p_user_id
        and sm.school_id=p_school_id
        and sm.staff_member_id=p_staff_member_id
        and sm.role_key in ('teacher','class_teacher','hod')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    );
$$;
revoke all on function app_private.user_owns_operational_file_resource(uuid,uuid,uuid) from public,anon;
grant execute on function app_private.user_owns_operational_file_resource(uuid,uuid,uuid) to authenticated;

create or replace function app_private.can_read_operational_file_resource(
  p_resource_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select exists(
    select 1
    from public.operational_file_resources r
    where r.id=p_resource_id
      and r.status='active'
      and (
        (
          r.scope_type='national'
          and exists(
            select 1 from public.school_memberships sm
            where sm.user_id=auth.uid()
              and sm.active_from<=current_date
              and (sm.active_to is null or sm.active_to>=current_date)
          )
          and not exists(
            select 1 from public.platform_memberships pm
            where pm.user_id=auth.uid()
              and pm.role_key in ('platform_admin','platform_support')
              and pm.active_from<=current_date
              and (pm.active_to is null or pm.active_to>=current_date)
          )
        )
        or (
          r.scope_type='school'
          and app_private.user_current_school_matches(auth.uid(),r.school_id)
        )
        or (
          r.scope_type='subject_phase'
          and app_private.user_current_school_matches(auth.uid(),r.school_id)
          and (
            app_private.has_school_role(r.school_id,array['school_admin','principal','deputy_principal'])
            or app_private.hod_responsible_for_subject(r.school_id,r.subject_id)
            or exists(
              select 1
              from public.school_memberships sm
              join public.teacher_allocations ta
                on ta.staff_member_id=sm.staff_member_id
               and ta.school_id=sm.school_id
               and ta.active_from<=current_date
               and (ta.active_to is null or ta.active_to>=current_date)
              join public.subject_offerings so on so.id=ta.subject_offering_id
              where sm.user_id=auth.uid()
                and sm.school_id=r.school_id
                and sm.role_key in ('teacher','class_teacher','hod')
                and sm.active_from<=current_date
                and (sm.active_to is null or sm.active_to>=current_date)
                and so.subject_id=r.subject_id
            )
          )
        )
        or (
          r.scope_type='teacher'
          and app_private.user_owns_operational_file_resource(
            auth.uid(),r.school_id,r.owner_staff_member_id
          )
        )
      )
  );
$$;
revoke all on function app_private.can_read_operational_file_resource(uuid) from public,anon;
grant execute on function app_private.can_read_operational_file_resource(uuid) to authenticated;

create policy "authorized actors read operational file resources"
on public.operational_file_resources
for select to authenticated
using (app_private.can_read_operational_file_resource(id));

create policy "authorized actors read operational file resource bindings"
on public.operational_file_resource_bindings
for select to authenticated
using (app_private.can_read_operational_file_resource(resource_id));

create or replace function app_private.enforce_operational_file_resource_scope()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_school_tenant uuid;
  v_subject_school uuid;
  v_subject_tenant uuid;
  v_staff_tenant uuid;
  v_document public.teacher_professional_documents%rowtype;
begin
  if new.school_id is not null then
    select s.tenant_id into v_school_tenant from public.schools s where s.id=new.school_id;
    if v_school_tenant is null or new.tenant_id is distinct from v_school_tenant then
      raise exception 'Operational resource school/tenant scope mismatch' using errcode='23514';
    end if;
  end if;

  if new.subject_id is not null then
    select s.school_id,s.tenant_id into v_subject_school,v_subject_tenant
    from public.subjects s where s.id=new.subject_id;
    if v_subject_school is distinct from new.school_id or v_subject_tenant is distinct from new.tenant_id then
      raise exception 'Operational resource subject scope mismatch' using errcode='23514';
    end if;
  end if;

  if new.owner_staff_member_id is not null then
    select sm.tenant_id into v_staff_tenant from public.staff_members sm where sm.id=new.owner_staff_member_id;
    if v_staff_tenant is distinct from new.tenant_id then
      raise exception 'Operational resource staff scope mismatch' using errcode='23514';
    end if;
  end if;

  if new.teacher_document_id is not null then
    select * into v_document
    from public.teacher_professional_documents d
    where d.id=new.teacher_document_id;
    if not found
      or new.scope_type<>'teacher'
      or v_document.school_id is distinct from new.school_id
      or v_document.tenant_id is distinct from new.tenant_id
      or v_document.owner_staff_member_id is distinct from new.owner_staff_member_id then
      raise exception 'Operational resource teacher document scope mismatch' using errcode='23514';
    end if;
  end if;

  return new;
end;
$$;
revoke all on function app_private.enforce_operational_file_resource_scope() from public,anon,authenticated;

create trigger operational_file_resource_scope_guard
before insert or update on public.operational_file_resources
for each row execute function app_private.enforce_operational_file_resource_scope();

create or replace function app_private.can_manage_operational_file_resource(
  p_scope_type text,
  p_school_id uuid,
  p_subject_id uuid,
  p_owner_staff_member_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select case
    when p_scope_type='national' then
      app_private.has_platform_role(array['platform_admin'])
    when p_scope_type='school' then
      app_private.user_current_school_matches(auth.uid(),p_school_id)
      and app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
    when p_scope_type='subject_phase' then
      app_private.user_current_school_matches(auth.uid(),p_school_id)
      and (
        app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
        or app_private.hod_responsible_for_subject(p_school_id,p_subject_id)
      )
    when p_scope_type='teacher' then
      app_private.user_owns_operational_file_resource(auth.uid(),p_school_id,p_owner_staff_member_id)
    else false
  end;
$$;
revoke all on function app_private.can_manage_operational_file_resource(text,uuid,uuid,uuid) from public,anon;
grant execute on function app_private.can_manage_operational_file_resource(text,uuid,uuid,uuid) to authenticated;

create or replace function public.create_operational_file_resource(
  p_scope_type text,
  p_school_id uuid,
  p_subject_id uuid,
  p_owner_staff_member_id uuid,
  p_teacher_document_id uuid,
  p_title text,
  p_description text,
  p_provider text,
  p_authority_label text,
  p_external_url text,
  p_academic_year integer,
  p_grade_from integer,
  p_grade_to integer,
  p_effective_from date,
  p_effective_to date,
  p_template_item_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_id uuid:=gen_random_uuid();
  v_tenant_id uuid;
  v_visibility text;
  v_item_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_scope_type not in ('national','school','subject_phase','teacher') then
    raise exception 'Unsupported operational resource scope';
  end if;
  if nullif(btrim(coalesce(p_title,'')),'') is null then raise exception 'Resource title is required'; end if;
  if nullif(btrim(coalesce(p_provider,'')),'') is null then raise exception 'Resource provider is required'; end if;
  if nullif(btrim(coalesce(p_authority_label,'')),'') is null then raise exception 'Resource authority label is required'; end if;
  if p_external_url is not null and p_external_url !~* '^https://' then
    raise exception 'External operational resource URL must use HTTPS';
  end if;
  if p_external_url is null and p_teacher_document_id is null then
    raise exception 'Operational resource requires an HTTPS reference or existing teacher document';
  end if;
  if coalesce(array_length(p_template_item_ids,1),0)=0 then
    raise exception 'Operational resource must bind to at least one template item';
  end if;
  if p_grade_from is not null and (p_grade_from<0 or p_grade_from>20) then raise exception 'Invalid grade range'; end if;
  if p_grade_to is not null and (p_grade_to<0 or p_grade_to>20) then raise exception 'Invalid grade range'; end if;
  if p_grade_from is not null and p_grade_to is not null and p_grade_to<p_grade_from then raise exception 'Invalid grade range'; end if;
  if p_effective_from is not null and p_effective_to is not null and p_effective_to<p_effective_from then raise exception 'Invalid effective range'; end if;

  if p_scope_type='national' then
    v_visibility:='platform';
    if p_school_id is not null or p_subject_id is not null or p_owner_staff_member_id is not null or p_teacher_document_id is not null then
      raise exception 'National operational resources cannot carry school/private scope';
    end if;
  else
    select s.tenant_id into v_tenant_id from public.schools s where s.id=p_school_id and s.status='active';
    if v_tenant_id is null then raise exception 'Active school is required'; end if;
    v_visibility:=case p_scope_type when 'school' then 'school' when 'subject_phase' then 'subject' else 'private' end;
  end if;

  if not app_private.can_manage_operational_file_resource(
    p_scope_type,p_school_id,p_subject_id,p_owner_staff_member_id
  ) then
    raise exception 'Operational resource management authority required';
  end if;

  insert into public.operational_file_resources(
    id,tenant_id,school_id,subject_id,owner_staff_member_id,teacher_document_id,
    scope_type,visibility,title,description,provider,authority_label,external_url,
    academic_year,grade_from,grade_to,effective_from,effective_to,created_by_user_id
  ) values(
    v_id,v_tenant_id,p_school_id,p_subject_id,p_owner_staff_member_id,p_teacher_document_id,
    p_scope_type,v_visibility,btrim(p_title),nullif(btrim(coalesce(p_description,'')),''),
    btrim(p_provider),btrim(p_authority_label),nullif(btrim(coalesce(p_external_url,'')),''),
    p_academic_year,p_grade_from::smallint,p_grade_to::smallint,p_effective_from,p_effective_to,auth.uid()
  );

  foreach v_item_id in array p_template_item_ids loop
    insert into public.operational_file_resource_bindings(resource_id,template_item_id)
    values(v_id,v_item_id)
    on conflict do nothing;
  end loop;

  return v_id;
end;
$$;
revoke all on function public.create_operational_file_resource(
  text,uuid,uuid,uuid,uuid,text,text,text,text,text,integer,integer,integer,date,date,uuid[]
) from public,anon;
grant execute on function public.create_operational_file_resource(
  text,uuid,uuid,uuid,uuid,text,text,text,text,text,integer,integer,integer,date,date,uuid[]
) to authenticated;

create or replace function public.archive_operational_file_resource(p_resource_id uuid)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_resource public.operational_file_resources%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_resource from public.operational_file_resources where id=p_resource_id for update;
  if not found then raise exception 'Operational resource not found'; end if;

  if not app_private.can_manage_operational_file_resource(
    v_resource.scope_type,v_resource.school_id,v_resource.subject_id,v_resource.owner_staff_member_id
  ) then
    raise exception 'Operational resource management authority required';
  end if;

  if v_resource.status='archived' then return true; end if;

  update public.operational_file_resources
  set status='archived',archived_at=now(),archived_by_user_id=auth.uid()
  where id=p_resource_id;
  return true;
end;
$$;
revoke all on function public.archive_operational_file_resource(uuid) from public,anon;
grant execute on function public.archive_operational_file_resource(uuid) to authenticated;

-- Resource identity/provenance is immutable. Lifecycle is archive-only.
create or replace function app_private.preserve_operational_file_resource_provenance()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if new.id is distinct from old.id
    or new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.subject_id is distinct from old.subject_id
    or new.owner_staff_member_id is distinct from old.owner_staff_member_id
    or new.teacher_document_id is distinct from old.teacher_document_id
    or new.scope_type is distinct from old.scope_type
    or new.visibility is distinct from old.visibility
    or new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.provider is distinct from old.provider
    or new.authority_label is distinct from old.authority_label
    or new.external_url is distinct from old.external_url
    or new.academic_year is distinct from old.academic_year
    or new.grade_from is distinct from old.grade_from
    or new.grade_to is distinct from old.grade_to
    or new.effective_from is distinct from old.effective_from
    or new.effective_to is distinct from old.effective_to
    or new.created_by_user_id is distinct from old.created_by_user_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Operational resource provenance is immutable; archive and create a replacement'
      using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function app_private.preserve_operational_file_resource_provenance() from public,anon,authenticated;

create trigger operational_file_resource_provenance_guard
before update on public.operational_file_resources
for each row execute function app_private.preserve_operational_file_resource_provenance();

comment on table public.operational_file_resources is
'Shared/external operational-file reference metadata. National, school, subject/phase and private teacher scopes reuse canonical records or HTTPS references; binary storage is not duplicated.';
comment on table public.operational_file_resource_bindings is
'Many-to-many binding from one shared operational resource/reference to policy template items.';
