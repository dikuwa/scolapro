create or replace function app_private.enforce_guardian_absence_attachment_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_notice public.guardian_absence_notices%rowtype;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.notice_id is distinct from old.notice_id
    or new.storage_bucket is distinct from old.storage_bucket
    or new.storage_path is distinct from old.storage_path
    or new.uploaded_by_user_id is distinct from old.uploaded_by_user_id
  ) then
    raise exception 'Guardian absence attachment scope and storage provenance are immutable';
  end if;

  select * into v_notice
  from public.guardian_absence_notices n
  where n.id = new.notice_id;

  if not found
    or (v_notice.tenant_id, v_notice.school_id)
       is distinct from (new.tenant_id, new.school_id) then
    raise exception 'Guardian absence attachment scope mismatch: notice does not match attachment tenant and school';
  end if;

  if new.storage_bucket <> 'guardian-absence-evidence' then
    raise exception 'Guardian absence attachment scope mismatch: storage bucket is invalid';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_guardian_absence_attachment_scope_integrity() from public, anon, authenticated;

drop trigger if exists guardian_absence_attachment_scope_integrity_trg on public.guardian_absence_notice_attachments;
create trigger guardian_absence_attachment_scope_integrity_trg
before insert or update of tenant_id, school_id, notice_id, storage_bucket, storage_path, uploaded_by_user_id
on public.guardian_absence_notice_attachments
for each row execute function app_private.enforce_guardian_absence_attachment_scope_integrity();