-- Issue #487: smallest governed teacher-owned professional-document foundation.
-- Reuses private Supabase Storage and the existing /teaching/files hub.
-- No official Namibia/NIED taxonomy is introduced here.

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values(
  'teacher-professional-documents',
  'teacher-professional-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png'
  ]
)
on conflict(id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.teacher_professional_documents (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  owner_staff_member_id uuid not null references public.staff_members(id) on delete restrict,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  file_size integer not null check(file_size > 0 and file_size <= 10485760),
  title text,
  category_label text,
  status text not null default 'active' check(status in ('active','archived')),
  uploaded_by_user_id uuid not null references auth.users(id) on delete restrict,
  archived_by_user_id uuid references auth.users(id) on delete restrict,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status='active' and archived_at is null and archived_by_user_id is null)
    or (status='archived' and archived_at is not null and archived_by_user_id is not null)
  )
);

create index if not exists teacher_professional_documents_owner_idx
on public.teacher_professional_documents(school_id,owner_staff_member_id,status,created_at desc);

alter table public.teacher_professional_documents enable row level security;
revoke all on public.teacher_professional_documents from anon;
grant select on public.teacher_professional_documents to authenticated;

create or replace function app_private.user_owns_teacher_professional_documents(
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
    and not exists(
      select 1
      from public.platform_memberships pm
      where pm.user_id=p_user_id
        and pm.role_key in ('platform_admin','platform_support')
        and pm.active_from<=current_date
        and (pm.active_to is null or pm.active_to>=current_date)
    )
    and app_private.user_targets_current_school(p_user_id,p_school_id)
    and exists(
      select 1
      from public.school_memberships sm
      join public.schools s
        on s.id=sm.school_id
       and s.tenant_id=sm.tenant_id
      join public.staff_members staff
        on staff.id=sm.staff_member_id
       and staff.tenant_id=sm.tenant_id
       and staff.status='active'
      where sm.user_id=p_user_id
        and sm.school_id=p_school_id
        and sm.staff_member_id=p_staff_member_id
        and sm.role_key in ('teacher','class_teacher','hod')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
        and app_private.staff_member_covers_school_period(
          p_staff_member_id,p_school_id,current_date,current_date
        )
    );
$$;

-- The SELECT RLS policy below executes this helper as the authenticated
-- table reader. Keep the helper inaccessible to anon/public, but allow the
-- authenticated role to execute the read-only predicate used by that policy.
revoke all on function app_private.user_owns_teacher_professional_documents(uuid,uuid,uuid)
from public,anon;
grant execute on function app_private.user_owns_teacher_professional_documents(uuid,uuid,uuid)
to authenticated;

create policy "teachers read own professional documents"
on public.teacher_professional_documents
for select
to authenticated
using (
  app_private.user_owns_teacher_professional_documents(
    auth.uid(),school_id,owner_staff_member_id
  )
);

-- No authenticated INSERT/UPDATE/DELETE policies are created. Writes use the
-- governed RPCs below, and stored objects have no direct authenticated policies.
-- Upload/download is issued as short-lived signed access after owner authorization.

create or replace function app_private.enforce_teacher_professional_document_integrity()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if tg_op='DELETE' then
    raise exception 'Teacher professional documents are archived, not deleted';
  end if;

  if tg_op='UPDATE' then
    if new.id is distinct from old.id
      or new.tenant_id is distinct from old.tenant_id
      or new.school_id is distinct from old.school_id
      or new.owner_staff_member_id is distinct from old.owner_staff_member_id
      or new.storage_path is distinct from old.storage_path
      or new.original_filename is distinct from old.original_filename
      or new.mime_type is distinct from old.mime_type
      or new.file_size is distinct from old.file_size
      or new.uploaded_by_user_id is distinct from old.uploaded_by_user_id
      or new.created_at is distinct from old.created_at then
      raise exception 'Teacher professional document identity and upload provenance are immutable';
    end if;
    new.updated_at:=now();
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_teacher_professional_document_integrity()
from public,anon,authenticated;

drop trigger if exists teacher_professional_document_integrity_trg
on public.teacher_professional_documents;
create trigger teacher_professional_document_integrity_trg
before update or delete
on public.teacher_professional_documents
for each row execute function app_private.enforce_teacher_professional_document_integrity();

create or replace function public.can_prepare_teacher_professional_document_upload(
  p_school_id uuid,
  p_staff_member_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select auth.uid() is not null
    and app_private.user_owns_teacher_professional_documents(
      auth.uid(),p_school_id,p_staff_member_id
    );
$$;

revoke all on function public.can_prepare_teacher_professional_document_upload(uuid,uuid)
from public,anon;
grant execute on function public.can_prepare_teacher_professional_document_upload(uuid,uuid)
to authenticated;

create or replace function public.register_teacher_professional_document(
  p_document_id uuid,
  p_school_id uuid,
  p_staff_member_id uuid,
  p_storage_path text,
  p_original_filename text,
  p_mime_type text,
  p_file_size integer,
  p_title text default null,
  p_category_label text default null
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private,storage
as $$
declare
  v_tenant_id uuid;
  v_expected_prefix text;
  v_allowed_mime_types constant text[] := array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png'
  ];
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.user_owns_teacher_professional_documents(
    auth.uid(),p_school_id,p_staff_member_id
  ) then raise exception 'Teacher document owner authority required'; end if;

  select s.tenant_id into v_tenant_id
  from public.schools s
  join public.staff_members staff
    on staff.id=p_staff_member_id
   and staff.tenant_id=s.tenant_id
  where s.id=p_school_id
    and s.status='active'
    and staff.status='active';
  if v_tenant_id is null then raise exception 'Teacher document school/staff scope mismatch'; end if;

  if not (p_mime_type = any(v_allowed_mime_types)) then
    raise exception 'Unsupported professional document type';
  end if;
  if p_file_size is null or p_file_size<=0 or p_file_size>10485760 then
    raise exception 'Professional document must be between 1 byte and 10 MB';
  end if;
  if nullif(btrim(coalesce(p_original_filename,'')),'') is null then
    raise exception 'Original filename is required';
  end if;
  if length(btrim(coalesce(p_original_filename,'')))>255 then
    raise exception 'Original filename is too long';
  end if;
  if length(btrim(coalesce(p_title,'')))>180 then
    raise exception 'Document title is too long';
  end if;
  if length(btrim(coalesce(p_category_label,'')))>120 then
    raise exception 'Document category is too long';
  end if;

  v_expected_prefix:=p_school_id::text||'/'||p_staff_member_id::text||'/'||p_document_id::text||'.';
  if left(p_storage_path,length(v_expected_prefix))<>v_expected_prefix then
    raise exception 'Professional document path does not match owner identity';
  end if;

  if not exists(
    select 1
    from storage.objects o
    where o.bucket_id='teacher-professional-documents'
      and o.name=p_storage_path
  ) then
    raise exception 'Uploaded professional document object was not found';
  end if;

  insert into public.teacher_professional_documents(
    id,tenant_id,school_id,owner_staff_member_id,storage_path,
    original_filename,mime_type,file_size,title,category_label,
    uploaded_by_user_id
  ) values(
    p_document_id,v_tenant_id,p_school_id,p_staff_member_id,p_storage_path,
    btrim(p_original_filename),p_mime_type,p_file_size,
    nullif(btrim(coalesce(p_title,'')),''),
    nullif(btrim(coalesce(p_category_label,'')),''),
    auth.uid()
  );

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_tenant_id,p_school_id,auth.uid(),
    'teacher_professional_document.uploaded',
    'teacher_professional_document',p_document_id,
    jsonb_build_object(
      'owner_staff_member_id',p_staff_member_id,
      'mime_type',p_mime_type,
      'file_size',p_file_size,
      'category_label',nullif(btrim(coalesce(p_category_label,'')),'')
    )
  );

  return p_document_id;
end;
$$;

revoke all on function public.register_teacher_professional_document(
  uuid,uuid,uuid,text,text,text,integer,text,text
) from public,anon;
grant execute on function public.register_teacher_professional_document(
  uuid,uuid,uuid,text,text,text,integer,text,text
) to authenticated;

create or replace function public.archive_teacher_professional_document(
  p_document_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_document public.teacher_professional_documents%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_document
  from public.teacher_professional_documents
  where id=p_document_id
  for update;
  if not found then raise exception 'Teacher professional document not found'; end if;

  if not app_private.user_owns_teacher_professional_documents(
    auth.uid(),v_document.school_id,v_document.owner_staff_member_id
  ) then raise exception 'Teacher document owner authority required'; end if;

  if v_document.status='archived' then return true; end if;

  update public.teacher_professional_documents
  set status='archived',
      archived_at=now(),
      archived_by_user_id=auth.uid()
  where id=p_document_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_document.tenant_id,v_document.school_id,auth.uid(),
    'teacher_professional_document.archived',
    'teacher_professional_document',v_document.id,
    jsonb_build_object('owner_staff_member_id',v_document.owner_staff_member_id)
  );

  return true;
end;
$$;

revoke all on function public.archive_teacher_professional_document(uuid)
from public,anon;
grant execute on function public.archive_teacher_professional_document(uuid)
to authenticated;

comment on table public.teacher_professional_documents is
'Teacher-owned professional document metadata. Binary objects live in private storage; categories are neutral teacher labels and carry no official Ministry/NIED taxonomy claim.';
comment on function public.can_prepare_teacher_professional_document_upload(uuid,uuid) is
'Owner-only current-school/effective-placement preflight for short-lived signed upload tickets.';
comment on function public.register_teacher_professional_document(uuid,uuid,uuid,text,text,text,integer,text,text) is
'Finalizes one existing private signed-upload object as an immutable teacher-owned professional document with audit provenance.';
comment on function public.archive_teacher_professional_document(uuid) is
'Owner-only historical archive lifecycle. Documents are not hard-deleted.';
