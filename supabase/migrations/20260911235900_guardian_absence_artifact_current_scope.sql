-- Guardian absence evidence remains private after submission. Revalidate both guardian
-- relationship and deterministic current-school staff authority whenever an object is
-- read, uploaded, deleted, or registered. Do not treat historical submitter provenance
-- as an evergreen storage entitlement.

create or replace function app_private.can_access_guardian_absence_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, storage, app_private
as $$
  select case
    when array_length(storage.foldername(p_name),1) < 3 then false
    else exists(
      select 1
      from public.guardian_absence_notices n
      where n.id::text = (storage.foldername(p_name))[3]
        and n.school_id::text = (storage.foldername(p_name))[1]
        and (
          exists (
            select 1
            from public.guardian_user_links gul
            join public.learner_guardians lg
              on lg.tenant_id = gul.tenant_id
             and lg.guardian_id = gul.guardian_id
            where gul.tenant_id = n.tenant_id
              and gul.guardian_id = n.guardian_id
              and gul.user_id = (select auth.uid())
              and lg.learner_id = n.learner_id
              and lg.effective_from <= current_date
              and (lg.effective_to is null or lg.effective_to >= current_date)
          )
          or (
            n.school_id = (
              select sm.school_id
              from public.school_memberships sm
              where sm.user_id = (select auth.uid())
                and sm.active_from <= current_date
                and (sm.active_to is null or sm.active_to >= current_date)
              order by sm.active_from desc, sm.id asc
              limit 1
            )
            and app_private.can_view_operational_learners(n.school_id)
          )
        )
    )
  end;
$$;

revoke all on function app_private.can_access_guardian_absence_object(text)
from public, anon, authenticated;

comment on function app_private.can_access_guardian_absence_object(text) is
'Private guardian-absence object authorization. Guardians require a current effective learner relationship; staff access is bounded to the deterministic current school before existing operational learner authorization is applied.';

-- Guardian mutation of evidence is relationship-bound, not merely submitter-bound.
-- Storage policies deliberately call the pre-existing narrow executable wrapper rather
-- than the private helper directly because sibling storage.objects policies can be
-- evaluated for other buckets under the authenticated role.
drop policy if exists "guardian uploads own absence evidence" on storage.objects;
create policy "guardian uploads own absence evidence"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'guardian-absence-evidence'
  and array_length(storage.foldername(name),1) >= 3
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and app_private.can_access_guardian_absence_object_policy(name)
  and exists (
    select 1
    from public.guardian_absence_notices n
    where n.id::text = (storage.foldername(name))[3]
      and n.school_id::text = (storage.foldername(name))[1]
      and n.submitted_by_user_id = (select auth.uid())
      and n.status in ('submitted','returned')
  )
);

drop policy if exists "authorized users read guardian absence evidence" on storage.objects;
create policy "authorized users read guardian absence evidence"
on storage.objects for select
to authenticated
using (
  bucket_id = 'guardian-absence-evidence'
  and app_private.can_access_guardian_absence_object_policy(name)
);

drop policy if exists "guardian deletes editable absence evidence" on storage.objects;
create policy "guardian deletes editable absence evidence"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'guardian-absence-evidence'
  and array_length(storage.foldername(name),1) >= 3
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and app_private.can_access_guardian_absence_object_policy(name)
  and exists (
    select 1
    from public.guardian_absence_notices n
    where n.id::text = (storage.foldername(name))[3]
      and n.school_id::text = (storage.foldername(name))[1]
      and n.submitted_by_user_id = (select auth.uid())
      and n.status in ('submitted','returned')
  )
);

create or replace function public.register_guardian_absence_attachment(
  p_notice_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path = public, storage, app_private
as $$
declare
  v_notice public.guardian_absence_notices%rowtype;
  v_id uuid;
  v_expected_prefix text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_notice
  from public.guardian_absence_notices
  where id = p_notice_id;

  if not found or v_notice.submitted_by_user_id <> auth.uid() then
    raise exception 'Absence notice not found';
  end if;

  if not app_private.user_can_submit_guardian_absence_notice(
    auth.uid(), v_notice.tenant_id, v_notice.guardian_id, v_notice.learner_id
  ) then
    raise exception 'Guardian relationship is no longer active for this learner';
  end if;

  if v_notice.status not in ('submitted','returned') then
    raise exception 'Attachments can no longer be changed for this notice';
  end if;
  if p_mime_type not in ('image/jpeg','image/png','image/webp','application/pdf') then
    raise exception 'Unsupported attachment type';
  end if;
  if p_file_size_bytes <= 0 or p_file_size_bytes > 10485760 then
    raise exception 'Attachment must be 10 MB or smaller';
  end if;
  if btrim(coalesce(p_storage_path,'')) = '' or btrim(coalesce(p_file_name,'')) = '' then
    raise exception 'Attachment metadata is incomplete';
  end if;

  v_expected_prefix := v_notice.school_id::text || '/' || auth.uid()::text || '/' || v_notice.id::text || '/';
  if left(btrim(p_storage_path), length(v_expected_prefix)) <> v_expected_prefix then
    raise exception 'Attachment storage path does not match this absence notice';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'guardian-absence-evidence'
      and o.name = btrim(p_storage_path)
  ) then
    raise exception 'Uploaded absence evidence object was not found';
  end if;

  insert into public.guardian_absence_notice_attachments(
    tenant_id, school_id, notice_id, storage_path, file_name,
    mime_type, file_size_bytes, uploaded_by_user_id
  ) values (
    v_notice.tenant_id, v_notice.school_id, v_notice.id, btrim(p_storage_path),
    btrim(p_file_name), p_mime_type, p_file_size_bytes, auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.register_guardian_absence_attachment(uuid,text,text,text,bigint)
from public, anon;
grant execute on function public.register_guardian_absence_attachment(uuid,text,text,text,bigint)
to authenticated;

comment on function public.register_guardian_absence_attachment(uuid,text,text,text,bigint) is
'Registers private guardian absence evidence only while the submitting guardian still has a current effective relationship to the learner.';
