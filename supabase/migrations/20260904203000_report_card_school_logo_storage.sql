-- Governed, school-scoped logo assets for official document rendering.
-- The document profile stores the immutable object path; report-card snapshots
-- already freeze the full document_profile JSON, preserving historical branding.
--
-- Logo objects are append-only for authenticated school users. Replacing or
-- clearing the current logo changes only the document-profile pointer; old objects
-- remain available for certified historical snapshots that reference them.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'school-document-assets',
  'school-document-assets',
  false,
  5242880,
  array['image/jpeg','image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "School document assets select" on storage.objects;
create policy "School document assets select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'school-document-assets'
  and (storage.foldername(name))[2] = 'logos'
  and exists (
    select 1
    from public.school_memberships m
    where m.user_id = (select auth.uid())
      and m.school_id::text = (storage.foldername(name))[1]
      and m.role_key in ('school_admin','principal','deputy_principal')
      and m.active_from <= current_date
      and (m.active_to is null or m.active_to >= current_date)
  )
);

drop policy if exists "School document assets insert" on storage.objects;
create policy "School document assets insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'school-document-assets'
  and lower(storage.extension(name)) in ('jpg','jpeg','png')
  and (storage.foldername(name))[2] = 'logos'
  and exists (
    select 1
    from public.school_memberships m
    where m.user_id = (select auth.uid())
      and m.school_id::text = (storage.foldername(name))[1]
      and m.role_key in ('school_admin','principal','deputy_principal')
      and m.active_from <= current_date
      and (m.active_to is null or m.active_to >= current_date)
  )
);

-- Intentionally no UPDATE or DELETE policy. School document logos are immutable
-- assets because report-card snapshots may reference an older stored path forever.
drop policy if exists "School document assets delete" on storage.objects;

create or replace function public.set_report_card_logo_asset(
  p_school_id uuid,
  p_storage_path text
)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_profile jsonb := '{}'::jsonb;
  v_extension text;
begin
  if not app_private.can_manage_report_card_settings(p_school_id) then
    raise exception 'Not authorised to manage report-card settings';
  end if;

  if p_storage_path is not null and p_storage_path <> '' then
    if p_storage_path not like p_school_id::text || '/logos/%' then
      raise exception 'Logo asset path does not belong to this school';
    end if;
    v_extension := lower(regexp_replace(p_storage_path, '^.*\.', ''));
    if v_extension not in ('jpg','jpeg','png') then
      raise exception 'Unsupported logo asset type';
    end if;
  end if;

  select coalesce(setting_value, '{}'::jsonb)
  into v_profile
  from public.school_settings
  where school_id = p_school_id
    and setting_key = 'document_profile';

  v_profile := jsonb_set(
    coalesce(v_profile, '{}'::jsonb),
    '{logo_storage_path}',
    to_jsonb(coalesce(p_storage_path, '')),
    true
  );

  insert into public.school_settings (school_id, setting_key, setting_value)
  values (p_school_id, 'document_profile', v_profile)
  on conflict (school_id, setting_key)
  do update set setting_value = excluded.setting_value;
end;
$$;

revoke all on function public.set_report_card_logo_asset(uuid,text)
from public, anon, authenticated;
grant execute on function public.set_report_card_logo_asset(uuid,text) to authenticated;

comment on function public.set_report_card_logo_asset(uuid,text) is
  'Attaches or clears one school-scoped immutable document-logo path after tenant-role validation.';
