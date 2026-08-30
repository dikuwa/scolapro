-- Storage policies share one storage.objects table. PostgreSQL may evaluate policy
-- expressions from multiple private buckets, so a policy must not invoke a helper that
-- authenticated users are intentionally forbidden to execute directly. Expose only a
-- narrow SECURITY DEFINER wrapper for RLS evaluation; keep the sensitive helper private.

create or replace function app_private.can_read_attendance_evidence_object(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select exists(
    select 1
    from public.attendance_evidence ae
    where ae.storage_path=p_storage_path
      and app_private.can_read_attendance_evidence(ae.id)
  );
$$;

revoke all on function app_private.can_read_attendance_evidence_object(text) from public,anon;
grant execute on function app_private.can_read_attendance_evidence_object(text) to authenticated;

drop policy if exists "need to know users read attendance evidence objects" on storage.objects;
create policy "need to know users read attendance evidence objects"
on storage.objects for select to authenticated
using (
  bucket_id='attendance-evidence'
  and (
    (array_length(storage.foldername(name),1)>=2 and (storage.foldername(name))[2]=(select auth.uid())::text)
    or app_private.can_read_attendance_evidence_object(name)
  )
);

comment on function app_private.can_read_attendance_evidence_object(text) is
'RLS-only storage wrapper. Resolves an attendance-evidence object path through the private need-to-know attendance evidence authorization helper without exposing that helper directly.';
