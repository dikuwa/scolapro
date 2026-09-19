-- Issue #536: Phase 1 Sports / Houses UI requires governed house activation state.
-- Reuse the canonical sports_houses table and existing sports-management authority.

create or replace function public.set_sports_house_status(
  p_school_id uuid,
  p_house_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_tenant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not app_private.can_manage_sports(p_school_id) then
    raise exception 'Permission denied';
  end if;

  if p_status not in ('active','inactive') then
    raise exception 'House status must be active or inactive';
  end if;

  select tenant_id into v_tenant_id
  from public.schools
  where id = p_school_id
    and status = 'active';

  if v_tenant_id is null then
    raise exception 'School not found or inactive';
  end if;

  update public.sports_houses
  set status = p_status,
      updated_at = now()
  where id = p_house_id
    and school_id = p_school_id
    and tenant_id = v_tenant_id
    and status <> 'archived';

  if not found then
    raise exception 'House not found in this school';
  end if;

  insert into public.audit_events(
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  )
  values(
    v_tenant_id, p_school_id, auth.uid(), 'sports.house.status_changed',
    'sports_house', p_house_id, jsonb_build_object('status', p_status)
  );

  return true;
end;
$$;

revoke all on function public.set_sports_house_status(uuid,uuid,text) from public,anon;
grant execute on function public.set_sports_house_status(uuid,uuid,text) to authenticated;

comment on function public.set_sports_house_status(uuid,uuid,text) is
'Governed Phase 1 house activation/deactivation without exposing raw table mutation or creating parallel house state.';
