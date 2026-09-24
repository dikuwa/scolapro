-- Issue #676: governed permanent deletion for teacher-owned professional documents.
--
-- Issue #487 made archive the default lifecycle and made silent hard deletion
-- impossible (`Teacher professional documents are archived, not deleted`). That
-- invariant is preserved: nothing may hard-delete a professional document except
-- this owner-scoped, audited RPC, and only for exactly the one row it authorized
-- inside its own transaction. Service-role/backend paths stay blocked by the
-- existing integrity trigger.
--
-- Permanent deletion is separate from archiving and is refused whenever the
-- document entered the HOD review cycle, because that document is retained
-- governed evidence. The private binary must already be gone from private
-- storage, so metadata deletion can never leave an unreferenced teacher file
-- behind. Archive remains the default, non-destructive lifecycle.

-- Governed hard-delete escape hatch: only the audited RPC above may set this
-- transaction-local flag, and only for the row it locked and authorized.
create or replace function app_private.enforce_teacher_professional_document_integrity()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if tg_op='DELETE' then
    if current_setting('app.teacher_professional_document_permanent_delete',true)
       = old.id::text then
      return old;
    end if;
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

create or replace function public.permanently_delete_teacher_professional_document(
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
  if p_document_id is null then
    raise exception 'A professional document identifier is required';
  end if;

  select * into v_document
  from public.teacher_professional_documents
  where id=p_document_id
  for update;
  if not found then raise exception 'Teacher professional document not found'; end if;

  if not app_private.user_owns_teacher_professional_documents(
    auth.uid(),v_document.school_id,v_document.owner_staff_member_id
  ) then raise exception 'Teacher document owner authority required'; end if;

  -- Option B (Issue #676): permanent deletion is permitted ONLY after archive.
  -- Active documents must be archived first; the UI disables "Delete
  -- permanently" while active with an archive-first explanation.
  if v_document.status <> 'archived' then
    raise exception 'Archive this document before deleting it permanently';
  end if;

  if exists(
    select 1
    from public.teacher_professional_document_review_submissions s
    where s.document_id=v_document.id
  ) then
    raise exception 'This professional document entered HOD review and cannot be permanently deleted';
  end if;

  -- Any other governed reference is blocked by ON DELETE RESTRICT foreign
  -- keys (e.g. review submissions reference documents on delete restrict), so
  -- the DELETE below raises a foreign-key violation rather than leaving a
  -- dangling governed record. The server action maps that violation to the
  -- blocked message.

  if exists(
    select 1
    from storage.objects o
    where o.bucket_id='teacher-professional-documents'
      and o.name=v_document.storage_path
  ) then
    raise exception 'The private file must be removed from private storage before its record can be permanently deleted';
  end if;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_document.tenant_id,v_document.school_id,auth.uid(),
    'teacher_professional_document.deleted',
    'teacher_professional_document',v_document.id,
    jsonb_build_object(
      'owner_staff_member_id',v_document.owner_staff_member_id,
      'storage_path',v_document.storage_path,
      'original_filename',v_document.original_filename,
      'mime_type',v_document.mime_type,
      'file_size',v_document.file_size,
      'category_label',v_document.category_label,
      'title',v_document.title,
      'status_at_deletion',v_document.status,
      'uploaded_at',v_document.created_at,
      'uploaded_by_user_id',v_document.uploaded_by_user_id,
      'private_object_removed',true
    )
  );

  perform set_config(
    'app.teacher_professional_document_permanent_delete',v_document.id::text,true
  );
  delete from public.teacher_professional_documents where id=v_document.id;
  perform set_config('app.teacher_professional_document_permanent_delete','',true);

  return true;
end;
$$;

revoke all on function public.permanently_delete_teacher_professional_document(uuid)
from public,anon;
grant execute on function public.permanently_delete_teacher_professional_document(uuid)
to authenticated;

comment on function public.permanently_delete_teacher_professional_document(uuid) is
'Owner-only governed permanent deletion of one teacher professional document. Archive remains the default lifecycle. Refused once the document entered HOD review and refused while the private binary still exists, so deletion cannot orphan teacher data in private storage. The deletion always writes immutable identity/provenance metadata to the audit trail.';
