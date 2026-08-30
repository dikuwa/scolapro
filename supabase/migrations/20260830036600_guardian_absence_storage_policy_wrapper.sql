-- Guardian absence storage uses a private helper that authenticated clients must not
-- invoke directly. Storage RLS itself needs a narrow executable wrapper because all
-- buckets share storage.objects and PostgreSQL may evaluate sibling policy expressions.

create or replace function app_private.can_access_guardian_absence_object_policy(p_name text)
returns boolean
language sql
stable
security definer
set search_path=public,storage,app_private
as $$
  select app_private.can_access_guardian_absence_object(p_name);
$$;

revoke all on function app_private.can_access_guardian_absence_object_policy(text) from public,anon;
grant execute on function app_private.can_access_guardian_absence_object_policy(text) to authenticated;

drop policy if exists "guardian uploads own absence evidence" on storage.objects;
create policy "guardian uploads own absence evidence"
on storage.objects for insert
to authenticated
with check (
  bucket_id='guardian-absence-evidence'
  and array_length(storage.foldername(name),1) >= 3
  and (storage.foldername(name))[2]=(select auth.uid())::text
  and app_private.can_access_guardian_absence_object_policy(name)
  and exists(
    select 1 from public.guardian_absence_notices n
    where n.id::text=(storage.foldername(name))[3]
      and n.school_id::text=(storage.foldername(name))[1]
      and n.submitted_by_user_id=(select auth.uid())
      and n.status in ('submitted','returned')
  )
);

drop policy if exists "authorized users read guardian absence evidence" on storage.objects;
create policy "authorized users read guardian absence evidence"
on storage.objects for select
to authenticated
using (
  bucket_id='guardian-absence-evidence'
  and app_private.can_access_guardian_absence_object_policy(name)
);

comment on function app_private.can_access_guardian_absence_object_policy(text) is
'RLS-only executable wrapper around the private guardian absence object authorization helper.';
