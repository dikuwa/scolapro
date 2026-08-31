-- Learner photo metadata is trusted later to mint a signed URL from the private
-- learner-photos bucket. Only link an object that exists under the exact school/learner
-- prefix. Clearing a photo remains allowed.

create or replace function public.set_learner_photo(
  p_learner_id uuid,
  p_school_id uuid,
  p_photo_path text
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private,storage
as $$
declare
  v_tenant_id uuid;
  v_photo_path text;
  v_expected_prefix text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_school_role(p_school_id,array['school_admin']) then raise exception 'Permission denied'; end if;

  select tenant_id into v_tenant_id
  from public.school_learner_identifiers
  where learner_id=p_learner_id and school_id=p_school_id;
  if v_tenant_id is null then raise exception 'Learner does not belong to this school'; end if;

  v_photo_path:=nullif(btrim(coalesce(p_photo_path,'')),'');
  if v_photo_path is not null then
    v_expected_prefix:=p_school_id::text||'/'||p_learner_id::text||'/';
    if left(v_photo_path,length(v_expected_prefix))<>v_expected_prefix then
      raise exception 'Learner photo path does not match this learner';
    end if;
    if not exists(
      select 1 from storage.objects o
      where o.bucket_id='learner-photos' and o.name=v_photo_path
    ) then
      raise exception 'Uploaded learner photo object was not found';
    end if;
  end if;

  update public.learners
  set photo_path=v_photo_path
  where id=p_learner_id and tenant_id=v_tenant_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_tenant_id,p_school_id,auth.uid(),'learner.photo_updated','learner',p_learner_id,
    jsonb_build_object('has_photo',v_photo_path is not null)
  );
  return true;
end;
$$;

revoke all on function public.set_learner_photo(uuid,uuid,text) from public,anon;
grant execute on function public.set_learner_photo(uuid,uuid,text) to authenticated;

comment on function public.set_learner_photo(uuid,uuid,text) is
'Links a learner only to an existing private learner-photos object under that exact school/learner prefix, or clears the photo when the path is null.';
