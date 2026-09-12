-- Learner-photo writes are school-operational artifact mutations. Preserve the existing
-- school-admin-only semantics while requiring the learner enrolment and linked staff placement
-- to remain current/effective. Platform Support must not gain school-operational artifact access.

create or replace function app_private.can_manage_learner_photo_target(
  p_school_id uuid,
  p_learner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select auth.uid() is not null
    and not app_private.has_platform_role(array['platform_support'])
    and app_private.user_targets_current_school(auth.uid(), p_school_id)
    and exists (
      select 1
      from public.school_memberships sm
      where sm.user_id = auth.uid()
        and sm.school_id = p_school_id
        and sm.role_key = 'school_admin'
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
        and (
          sm.staff_member_id is null
          or app_private.staff_member_covers_school_period(
            sm.staff_member_id,
            p_school_id,
            current_date,
            current_date
          )
        )
    )
    and exists (
      select 1
      from public.enrolments e
      join public.schools s
        on s.id = e.school_id
       and s.tenant_id = e.tenant_id
      join public.learners l
        on l.id = e.learner_id
       and l.tenant_id = e.tenant_id
      where e.school_id = p_school_id
        and e.learner_id = p_learner_id
        and e.status = 'current'
        and e.enrolled_from <= current_date
        and (e.enrolled_to is null or e.enrolled_to >= current_date)
    );
$$;

revoke all on function app_private.can_manage_learner_photo_target(uuid,uuid)
from public, anon, authenticated;

comment on function app_private.can_manage_learner_photo_target(uuid,uuid) is
'Private learner-photo mutation authority. Requires current effective learner enrolment, deterministic current-school school_admin authority, and effective linked staff placement; Platform Support is denied.';

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
begin
  v_parts := storage.foldername(p_name);
  if coalesce(array_length(v_parts,1),0) < 2 then return false; end if;

  begin
    v_school_id := v_parts[1]::uuid;
    v_learner_id := v_parts[2]::uuid;
  exception when others then
    return false;
  end;

  return app_private.can_manage_learner_photo_target(v_school_id, v_learner_id);
end;
$$;

revoke all on function app_private.can_manage_learner_photo_object(text)
from public, anon, authenticated;

grant execute on function app_private.can_manage_learner_photo_object(text) to authenticated;

comment on function app_private.can_manage_learner_photo_object(text) is
'Learner-photo storage write authorization. The object path must resolve to a current learner enrolment in the authenticated school admin current-school/effective-placement scope.';

create or replace function public.can_prepare_learner_photo_upload(
  p_school_id uuid,
  p_learner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.can_manage_learner_photo_target(p_school_id, p_learner_id);
$$;

revoke all on function public.can_prepare_learner_photo_upload(uuid,uuid)
from public, anon;
grant execute on function public.can_prepare_learner_photo_upload(uuid,uuid) to authenticated;

comment on function public.can_prepare_learner_photo_upload(uuid,uuid) is
'Authenticated preflight for service-generated learner-photo upload tickets. Returns only current artifact mutation entitlement.';

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
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  if not app_private.can_manage_learner_photo_target(p_school_id, p_learner_id) then
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
'Links or clears a learner photo only for a current-school school_admin whose linked placement and the learner enrolment remain current/effective.';
