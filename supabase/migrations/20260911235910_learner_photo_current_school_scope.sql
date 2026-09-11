-- Learner-photo storage is a school-operational surface. Preserve platform oversight,
-- but require school staff writes/reads to target the deterministic current active school
-- introduced by #411. This closes direct Storage/RPC calls that supplied another still-
-- active school membership.

create or replace function app_private.can_access_learner_photo_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private, storage
as $$
declare
  v_parts text[];
  v_school_id uuid;
  v_learner_id uuid;
  v_current_school_id uuid;
begin
  v_parts := storage.foldername(p_name);
  if coalesce(array_length(v_parts,1),0) < 2 then return false; end if;

  begin
    v_school_id := v_parts[1]::uuid;
    v_learner_id := v_parts[2]::uuid;
  exception when others then
    return false;
  end;

  if app_private.has_platform_role(array['platform_admin']) then
    return app_private.can_read_learner_identity(v_school_id,v_learner_id);
  end if;

  select sm.school_id into v_current_school_id
  from public.school_memberships sm
  where sm.user_id = (select auth.uid())
    and sm.active_from <= current_date
    and (sm.active_to is null or sm.active_to >= current_date)
  order by sm.active_from desc, sm.id asc
  limit 1;

  if v_current_school_id is null or v_school_id <> v_current_school_id then
    return false;
  end if;

  return app_private.can_read_learner_identity(v_school_id,v_learner_id);
end;
$$;

revoke all on function app_private.can_access_learner_photo_object(text) from public, anon;
grant execute on function app_private.can_access_learner_photo_object(text) to authenticated;

comment on function app_private.can_access_learner_photo_object(text) is
'Learner-photo read authorization. Platform Admin retains existing oversight; school staff must pass existing learner-specific authorization inside their deterministic current school.';

create or replace function app_private.can_manage_learner_photo_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private, storage
as $$
declare
  v_parts text[];
  v_school_id uuid;
  v_learner_id uuid;
  v_current_school_id uuid;
begin
  v_parts := storage.foldername(p_name);
  if coalesce(array_length(v_parts,1),0) < 2 then return false; end if;

  begin
    v_school_id := v_parts[1]::uuid;
    v_learner_id := v_parts[2]::uuid;
  exception when others then
    return false;
  end;

  select sm.school_id into v_current_school_id
  from public.school_memberships sm
  where sm.user_id = (select auth.uid())
    and sm.active_from <= current_date
    and (sm.active_to is null or sm.active_to >= current_date)
  order by sm.active_from desc, sm.id asc
  limit 1;

  if v_current_school_id is null or v_school_id <> v_current_school_id then
    return false;
  end if;

  if not app_private.has_school_role(v_school_id,array['school_admin']) then
    return false;
  end if;

  return exists(
    select 1
    from public.enrolments e
    where e.school_id = v_school_id
      and e.learner_id = v_learner_id
  );
end;
$$;

revoke all on function app_private.can_manage_learner_photo_object(text) from public, anon;
grant execute on function app_private.can_manage_learner_photo_object(text) to authenticated;

comment on function app_private.can_manage_learner_photo_object(text) is
'Learner-photo write authorization: valid school/learner path, real enrolment, school_admin role, and deterministic current-school binding.';

create or replace function public.set_learner_photo(
  p_learner_id uuid,
  p_school_id uuid,
  p_photo_path text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private, storage
as $$
declare
  v_tenant_id uuid;
  v_photo_path text;
  v_expected_prefix text;
  v_current_school_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select sm.school_id into v_current_school_id
  from public.school_memberships sm
  where sm.user_id = auth.uid()
    and sm.active_from <= current_date
    and (sm.active_to is null or sm.active_to >= current_date)
  order by sm.active_from desc, sm.id asc
  limit 1;

  if v_current_school_id is null or p_school_id <> v_current_school_id then
    raise exception 'Permission denied';
  end if;
  if not app_private.has_school_role(p_school_id,array['school_admin']) then
    raise exception 'Permission denied';
  end if;

  select tenant_id into v_tenant_id
  from public.school_learner_identifiers
  where learner_id = p_learner_id
    and school_id = p_school_id;
  if v_tenant_id is null then raise exception 'Learner does not belong to this school'; end if;

  v_photo_path := nullif(btrim(coalesce(p_photo_path,'')),'');
  if v_photo_path is not null then
    v_expected_prefix := p_school_id::text || '/' || p_learner_id::text || '/';
    if left(v_photo_path,length(v_expected_prefix)) <> v_expected_prefix then
      raise exception 'Learner photo path does not match this learner';
    end if;
    if not exists(
      select 1
      from storage.objects o
      where o.bucket_id = 'learner-photos'
        and o.name = v_photo_path
    ) then
      raise exception 'Uploaded learner photo object was not found';
    end if;
  end if;

  update public.learners
  set photo_path = v_photo_path
  where id = p_learner_id
    and tenant_id = v_tenant_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values (
    v_tenant_id,p_school_id,auth.uid(),'learner.photo_updated','learner',p_learner_id,
    jsonb_build_object('has_photo',v_photo_path is not null)
  );
  return true;
end;
$$;

revoke all on function public.set_learner_photo(uuid,uuid,text) from public, anon;
grant execute on function public.set_learner_photo(uuid,uuid,text) to authenticated;

comment on function public.set_learner_photo(uuid,uuid,text) is
'Links or clears a learner photo only for a school_admin operating in the deterministic current school and only against the exact learner storage prefix.';
