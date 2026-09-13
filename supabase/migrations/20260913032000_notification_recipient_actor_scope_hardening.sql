-- School-operational notifications must not remain visible or creatable through
-- a stale staff-linked membership, and Platform Support is not a school-local
-- operational recipient. Preserve platform-admin override and historical rows.

create or replace function app_private.can_access_notification_for_rls(p_notification_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists (
    select 1
    from public.notifications n
    where n.id = p_notification_id
      and n.recipient_user_id = auth.uid()
      and (
        n.school_id is null
        or app_private.has_platform_role(array['platform_admin'])
        or (
          not app_private.has_platform_role(array['platform_support'])
          and app_private.is_current_school(n.school_id)
          and (
            exists (
              select 1
              from public.school_memberships sm
              where sm.tenant_id = n.tenant_id
                and sm.school_id = n.school_id
                and sm.user_id = auth.uid()
                and sm.active_from <= current_date
                and (sm.active_to is null or sm.active_to >= current_date)
                and (
                  sm.staff_member_id is null
                  or app_private.staff_member_covers_school_period(
                    sm.staff_member_id,
                    n.school_id,
                    current_date,
                    current_date
                  )
                )
            )
            or exists (
              select 1
              from public.staff_members staff
              join public.staff_school_assignments ssa
                on ssa.staff_member_id = staff.id
               and ssa.tenant_id = staff.tenant_id
              where staff.tenant_id = n.tenant_id
                and staff.user_id = auth.uid()
                and staff.status = 'active'
                and ssa.school_id = n.school_id
                and ssa.effective_from <= current_date
                and (ssa.effective_to is null or ssa.effective_to >= current_date)
            )
            or exists (
              select 1
              from public.guardian_user_links gul
              join public.learner_guardians lg
                on lg.tenant_id = gul.tenant_id
               and lg.guardian_id = gul.guardian_id
              join public.enrolments e
                on e.tenant_id = lg.tenant_id
               and e.learner_id = lg.learner_id
              where gul.tenant_id = n.tenant_id
                and gul.user_id = auth.uid()
                and lg.effective_from <= current_date
                and (lg.effective_to is null or lg.effective_to >= current_date)
                and e.school_id = n.school_id
                and e.status = 'current'
                and e.enrolled_from <= current_date
                and (e.enrolled_to is null or e.enrolled_to >= current_date)
            )
          )
        )
      )
  );
$$;

revoke all on function app_private.can_access_notification_for_rls(uuid) from public, anon;
grant execute on function app_private.can_access_notification_for_rls(uuid) to authenticated;

comment on function app_private.can_access_notification_for_rls(uuid) is
'RLS notification inbox wrapper. School-scoped rows require deterministic current-school authority through an effective relationship; staff-linked memberships require effective placement, Platform Support is denied, and Platform Admin remains the explicit override.';

create or replace function app_private.enforce_notification_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_school_tenant uuid;
  v_on_date date := coalesce(new.created_at::date, current_date);
  v_platform_admin boolean := false;
  v_platform_support boolean := false;
begin
  if tg_op = 'UPDATE' and (
    new.recipient_user_id is distinct from old.recipient_user_id
    or new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.severity is distinct from old.severity
    or new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.href is distinct from old.href
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Notification recipient, scope, content, and creation provenance are immutable';
  end if;

  if new.school_id is not null then
    if new.tenant_id is null then
      raise exception 'Notification scope mismatch: school-scoped notification requires tenant';
    end if;

    select s.tenant_id into v_school_tenant
    from public.schools s
    where s.id = new.school_id;

    if v_school_tenant is null or v_school_tenant <> new.tenant_id then
      raise exception 'Notification scope mismatch: school does not belong to tenant';
    end if;

    select exists (
      select 1 from public.platform_memberships pm
      where pm.user_id = new.recipient_user_id
        and pm.role_key = 'platform_admin'
        and pm.active_from <= v_on_date
        and (pm.active_to is null or pm.active_to >= v_on_date)
    ) into v_platform_admin;

    select exists (
      select 1 from public.platform_memberships pm
      where pm.user_id = new.recipient_user_id
        and pm.role_key = 'platform_support'
        and pm.active_from <= v_on_date
        and (pm.active_to is null or pm.active_to >= v_on_date)
    ) into v_platform_support;

    if not v_platform_admin and (
      v_platform_support
      or not (
        exists (
          select 1
          from public.school_memberships sm
          where sm.tenant_id = new.tenant_id
            and sm.school_id = new.school_id
            and sm.user_id = new.recipient_user_id
            and sm.active_from <= v_on_date
            and (sm.active_to is null or sm.active_to >= v_on_date)
            and (
              sm.staff_member_id is null
              or app_private.staff_member_covers_school_period(
                sm.staff_member_id,
                new.school_id,
                v_on_date,
                v_on_date
              )
            )
        )
        or exists (
          select 1
          from public.staff_members staff
          join public.staff_school_assignments ssa
            on ssa.staff_member_id = staff.id
           and ssa.tenant_id = staff.tenant_id
          where staff.tenant_id = new.tenant_id
            and staff.user_id = new.recipient_user_id
            and staff.status = 'active'
            and ssa.school_id = new.school_id
            and (ssa.effective_to is null or ssa.effective_to >= v_on_date)
        )
        or exists (
          select 1
          from public.guardian_user_links gul
          join public.learner_guardians lg
            on lg.tenant_id = gul.tenant_id
           and lg.guardian_id = gul.guardian_id
          join public.enrolments e
            on e.tenant_id = lg.tenant_id
           and e.learner_id = lg.learner_id
          where gul.tenant_id = new.tenant_id
            and gul.user_id = new.recipient_user_id
            and lg.effective_from <= v_on_date
            and (lg.effective_to is null or lg.effective_to >= v_on_date)
            and e.school_id = new.school_id
            and e.status = 'current'
            and e.enrolled_from <= v_on_date
            and (e.enrolled_to is null or e.enrolled_to >= v_on_date)
        )
      )
    ) then
      raise exception 'Notification scope mismatch: recipient is not related to school';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_notification_scope_integrity() from public, anon, authenticated;

comment on function app_private.enforce_notification_scope_integrity() is
'Keeps notification scope/content provenance immutable. School notifications require a valid current recipient relationship; staff-linked memberships require effective placement, Platform Support is denied, Platform Admin is the explicit override, and future staff assignments remain eligible for advance notifications.';
