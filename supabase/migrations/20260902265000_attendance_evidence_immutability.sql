-- Attendance evidence belongs to append-oriented register submissions. Once an
-- object has been registered in attendance_evidence, deleting either the metadata
-- row or its private storage object would make the historical submission point to
-- missing evidence. Corrections must create a new submission/evidence record.

revoke delete on table public.attendance_evidence from authenticated;
drop policy if exists "uploader or school admin can delete attendance evidence"
  on public.attendance_evidence;

create or replace function app_private.can_delete_unlinked_attendance_evidence_object(
  p_object_name text
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,storage
as $$
  select auth.uid() is not null
    and p_object_name is not null
    and array_length(storage.foldername(p_object_name),1) >= 2
    and (storage.foldername(p_object_name))[2] = auth.uid()::text
    and not exists (
      select 1
      from public.attendance_evidence ae
      where ae.storage_path=p_object_name
    );
$$;

revoke all on function app_private.can_delete_unlinked_attendance_evidence_object(text)
from public,anon;
grant execute on function app_private.can_delete_unlinked_attendance_evidence_object(text)
to authenticated;

drop policy if exists "attendance uploader can delete evidence" on storage.objects;
create policy "attendance uploader can delete unlinked evidence"
on storage.objects
for delete to authenticated
using (
  bucket_id='attendance-evidence'
  and app_private.can_delete_unlinked_attendance_evidence_object(name)
);

comment on function app_private.can_delete_unlinked_attendance_evidence_object(text) is
'Allows an authenticated uploader to clean up only an attendance-evidence object in their own upload folder that has not yet been registered as durable attendance evidence. Linked historical evidence is immutable.';
