-- Align report-card management provenance with the deterministic current-school
-- context introduced by the multi-school navigation hardening. Platform admins
-- keep their existing platform-wide authority; school management authority is
-- valid only for the caller's one current active school.

create or replace function app_private.user_can_manage_report_cards(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists(
      select 1
      from public.platform_memberships pm
      where pm.user_id = p_user_id
        and pm.role_key = 'platform_admin'
        and pm.active_from <= current_date
        and (pm.active_to is null or pm.active_to >= current_date)
    )
    or p_school_id = (
      select sm.school_id
      from public.school_memberships sm
      where sm.user_id = p_user_id
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
      order by sm.active_from desc, sm.id asc
      limit 1
    )
    and exists(
      select 1
      from public.school_memberships sm
      where sm.school_id = p_school_id
        and sm.user_id = p_user_id
        and sm.role_key in ('school_admin','principal','deputy_principal')
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
    );
$$;

revoke all on function app_private.user_can_manage_report_cards(uuid,uuid)
  from public, anon, authenticated;

comment on function app_private.user_can_manage_report_cards(uuid,uuid) is
'Physical report-card management authority mirror. Platform admins retain platform scope; school managers are authorized only for their deterministic current active school (active_from DESC, id ASC).';
