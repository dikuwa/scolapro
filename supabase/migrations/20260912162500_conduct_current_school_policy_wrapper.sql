-- Keep deterministic current-school matching private. RLS must not call the private
-- helper directly because authenticated policy evaluation requires EXECUTE on every
-- function named in the policy expression. Inline the deterministic school selector
-- here while leaving app_private.user_current_school_matches(...) non-executable to
-- authenticated callers; SECURITY DEFINER observation helpers may continue to call it.

-- Conduct history remains readable only through the user's deterministic current school.
drop policy if exists "authorized staff can read conduct events" on public.conduct_events;
create policy "authorized staff can read conduct events"
on public.conduct_events for select to authenticated
using (
  school_id = (
    select sm.school_id
    from public.school_memberships sm
    where sm.user_id = (select auth.uid())
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
    order by sm.active_from desc, sm.id asc
    limit 1
  )
  and app_private.can_view_operational_learners(school_id)
);

drop policy if exists "teaching staff can create conduct events" on public.conduct_events;
create policy "teaching staff can create conduct events"
on public.conduct_events for insert to authenticated
with check (
  recorded_by_user_id = (select auth.uid())
  and school_id = (
    select sm.school_id
    from public.school_memberships sm
    where sm.user_id = (select auth.uid())
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
    order by sm.active_from desc, sm.id asc
    limit 1
  )
  and app_private.has_school_role(
    school_id,
    array['school_admin','principal','deputy_principal','hod','teacher','class_teacher','counsellor']
  )
);

drop policy if exists "leaders can update conduct events" on public.conduct_events;
create policy "leaders can update conduct events"
on public.conduct_events for update to authenticated
using (
  school_id = (
    select sm.school_id
    from public.school_memberships sm
    where sm.user_id = (select auth.uid())
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
    order by sm.active_from desc, sm.id asc
    limit 1
  )
  and app_private.has_school_role(
    school_id,
    array['school_admin','principal','deputy_principal','hod']
  )
)
with check (
  school_id = (
    select sm.school_id
    from public.school_memberships sm
    where sm.user_id = (select auth.uid())
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
    order by sm.active_from desc, sm.id asc
    limit 1
  )
  and app_private.has_school_role(
    school_id,
    array['school_admin','principal','deputy_principal','hod']
  )
);

-- Achievement policies use the same current-school boundary and preserve the
-- established counsellor separation on writes.
drop policy if exists "authorized staff can read achievements" on public.achievement_events;
create policy "authorized staff can read achievements"
on public.achievement_events for select to authenticated
using (
  school_id = (
    select sm.school_id
    from public.school_memberships sm
    where sm.user_id = (select auth.uid())
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
    order by sm.active_from desc, sm.id asc
    limit 1
  )
  and app_private.can_view_operational_learners(school_id)
);

drop policy if exists "teaching staff can create achievements" on public.achievement_events;
create policy "teaching staff can create achievements"
on public.achievement_events for insert to authenticated
with check (
  recorded_by_user_id = (select auth.uid())
  and school_id = (
    select sm.school_id
    from public.school_memberships sm
    where sm.user_id = (select auth.uid())
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
    order by sm.active_from desc, sm.id asc
    limit 1
  )
  and app_private.has_school_role(
    school_id,
    array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']
  )
);

drop policy if exists "leaders can update achievements" on public.achievement_events;
create policy "leaders can update achievements"
on public.achievement_events for update to authenticated
using (
  school_id = (
    select sm.school_id
    from public.school_memberships sm
    where sm.user_id = (select auth.uid())
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
    order by sm.active_from desc, sm.id asc
    limit 1
  )
  and app_private.has_school_role(
    school_id,
    array['school_admin','principal','deputy_principal','hod']
  )
)
with check (
  school_id = (
    select sm.school_id
    from public.school_memberships sm
    where sm.user_id = (select auth.uid())
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
    order by sm.active_from desc, sm.id asc
    limit 1
  )
  and app_private.has_school_role(
    school_id,
    array['school_admin','principal','deputy_principal','hod']
  )
);
