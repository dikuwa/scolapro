-- Learner-photo writes must target a real learner belonging to the named school;
-- school administration cannot use the private learner-photo bucket as arbitrary storage.

create or replace function app_private.can_manage_learner_photo_object(p_name text)
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

  if not app_private.has_school_role(v_school_id,array['school_admin']) then return false; end if;

  return exists(
    select 1
    from public.enrolments e
    where e.school_id=v_school_id
      and e.learner_id=v_learner_id
  );
end;
$$;

revoke all on function app_private.can_manage_learner_photo_object(text) from public,anon;
grant execute on function app_private.can_manage_learner_photo_object(text) to authenticated;

drop policy if exists "school admins can upload learner photos" on storage.objects;
drop policy if exists "school admins can update learner photos" on storage.objects;
drop policy if exists "school admins can delete learner photos" on storage.objects;

create policy "school admins upload scoped learner photos"
on storage.objects for insert to authenticated
with check (
  bucket_id='learner-photos'
  and app_private.can_manage_learner_photo_object(name)
);

create policy "school admins update scoped learner photos"
on storage.objects for update to authenticated
using (
  bucket_id='learner-photos'
  and app_private.can_manage_learner_photo_object(name)
)
with check (
  bucket_id='learner-photos'
  and app_private.can_manage_learner_photo_object(name)
);

create policy "school admins delete scoped learner photos"
on storage.objects for delete to authenticated
using (
  bucket_id='learner-photos'
  and app_private.can_manage_learner_photo_object(name)
);

comment on function app_private.can_manage_learner_photo_object(text) is
'Learner-photo write authorization: valid school_id/learner_id path, real enrolment relationship, and school_admin role.';
