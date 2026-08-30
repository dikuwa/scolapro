-- Learner identity reads are assignment-aware, so photo storage must use the same
-- learner-specific boundary instead of the older school-wide operational helper.

create or replace function app_private.can_access_learner_photo_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path=public,app_private,storage
as $$
declare
  v_parts text[];
  v_school_id uuid;
  v_learner_id uuid;
begin
  v_parts := storage.foldername(p_name);
  if coalesce(array_length(v_parts,1),0) < 2 then return false; end if;
  begin
    v_school_id := v_parts[1]::uuid;
    v_learner_id := v_parts[2]::uuid;
  exception when others then
    return false;
  end;
  return app_private.can_read_learner_identity(v_school_id,v_learner_id);
end;
$$;

revoke all on function app_private.can_access_learner_photo_object(text) from public,anon;
grant execute on function app_private.can_access_learner_photo_object(text) to authenticated;

drop policy if exists "authorized school staff can read learner photos" on storage.objects;
drop policy if exists "scoped users read learner photos" on storage.objects;

create policy "scoped users read learner photos"
on storage.objects for select to authenticated
using (
  bucket_id='learner-photos'
  and app_private.can_access_learner_photo_object(name)
);

comment on function app_private.can_access_learner_photo_object(text) is
'Parses learner-photo paths as school_id/learner_id/file and applies the same learner-specific identity authorization used for raw learner records.';
