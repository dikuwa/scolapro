-- Align report-card management provenance and artifact reads with the deterministic
-- current-school context introduced by the multi-school navigation hardening.
-- Platform admins keep their existing platform-wide authority. Guardian access stays
-- relationship-based and published-only. School staff/management access is valid only
-- for the caller's one current active school.

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
    or (
      p_school_id = (
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
      )
    );
$$;

revoke all on function app_private.user_can_manage_report_cards(uuid,uuid)
  from public, anon, authenticated;

comment on function app_private.user_can_manage_report_cards(uuid,uuid) is
'Physical report-card management authority mirror. Platform admins retain platform scope; school managers are authorized only for their deterministic current active school (active_from DESC, id ASC).';

-- Snapshot/document reads need the same current-school boundary. Preserve existing
-- relationship-aware teacher/class-teacher/HOD semantics inside the current school,
-- preserve platform oversight, and keep guardian reads published + current-relationship only.
drop policy if exists "authorized users read report card snapshots" on public.report_card_snapshots;
drop policy if exists "scoped users read report card snapshots" on public.report_card_snapshots;
create policy "scoped users read report card snapshots"
on public.report_card_snapshots for select to authenticated
using (
  app_private.has_platform_role(array['platform_admin'])
  or (
    school_id = (
      select sm.school_id
      from public.school_memberships sm
      where sm.user_id = (select auth.uid())
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
      order by sm.active_from desc, sm.id asc
      limit 1
    )
    and app_private.can_read_report_card_snapshot(school_id,learner_id,status)
  )
  or (
    status = 'published'
    and exists (
      select 1
      from public.learner_guardians lg
      join public.guardian_user_links gul on gul.guardian_id = lg.guardian_id
      where lg.learner_id = report_card_snapshots.learner_id
        and lg.effective_from <= current_date
        and (lg.effective_to is null or lg.effective_to >= current_date)
        and gul.user_id = (select auth.uid())
    )
  )
);

comment on policy "scoped users read report card snapshots" on public.report_card_snapshots is
'Report-card snapshot visibility preserves platform and current guardian access while school staff/management reads are bounded to the deterministic current school.';

drop policy if exists "authorized users read report card documents" on public.report_card_documents;
drop policy if exists "scoped users read report card documents" on public.report_card_documents;
create policy "scoped users read report card documents"
on public.report_card_documents for select to authenticated
using (
  exists (
    select 1
    from public.report_card_snapshots rs
    where rs.id = report_card_documents.snapshot_id
      and rs.school_id = report_card_documents.school_id
      and rs.tenant_id = report_card_documents.tenant_id
      and (
        app_private.has_platform_role(array['platform_admin'])
        or (
          rs.school_id = (
            select sm.school_id
            from public.school_memberships sm
            where sm.user_id = (select auth.uid())
              and sm.active_from <= current_date
              and (sm.active_to is null or sm.active_to >= current_date)
            order by sm.active_from desc, sm.id asc
            limit 1
          )
          and app_private.can_read_report_card_snapshot(rs.school_id,rs.learner_id,rs.status)
        )
        or (
          rs.status = 'published'
          and exists (
            select 1
            from public.learner_guardians lg
            join public.guardian_user_links gul on gul.guardian_id = lg.guardian_id
            where lg.learner_id = rs.learner_id
              and lg.effective_from <= current_date
              and (lg.effective_to is null or lg.effective_to >= current_date)
              and gul.user_id = (select auth.uid())
          )
        )
      )
  )
);

comment on policy "scoped users read report card documents" on public.report_card_documents is
'Report artifact visibility follows its immutable snapshot: platform oversight is preserved, school access is current-school bounded, and guardians require a current learner relationship to a published snapshot.';
