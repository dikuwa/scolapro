-- Wave 3 / Stream A (issue #468): governed teaching-plan authoring authority.
--
-- Audit finding. The pre-existing mutation policies on pacing_plans and
-- pacing_plan_items used a bare school-role predicate:
--
--   has_school_role(school_id, array['school_admin','principal','deputy_principal','hod'])
--
-- That predicate is broader than the read boundary on the very same tables
-- (can_access_teaching_plan, which the teaching-current-scope migration already
-- narrowed to the deterministic current school). Two concrete defects followed:
--
--   1. It did not require app_private.user_current_school_matches, so a second
--      active, non-current school membership could still mutate another
--      school's plans even though it could no longer read them.
--   2. It granted any holder of role_key='hod' school-wide plan authority with
--      no department/subject responsibility and no effective placement, which
--      contradicts the HOD oversight model already governed by
--      app_private.hod_responsible_for_subject.
--
-- teaching_schedule_items additionally accepted any teacher allocation without
-- checking that the allocation is in force on the planned lesson date.
--
-- A third consequence must be stated honestly, because the two offending
-- policies were declared FOR ALL and therefore also carried SELECT:
--
--   3. app_private.has_school_role does NOT call user_current_school_matches. It
--      only requires an active membership holding the role. Because FOR ALL
--      includes SELECT, a member whose ACTIVE BUT NON-CURRENT school was this
--      one could still READ this school's pacing plans and items through the
--      broad policy, even though 20260912170000 had already removed that same
--      person's read access through can_access_teaching_plan.
--
-- Dropping those two policies removes that leftover read path as well. The
-- legitimate read path is untouched: "scoped academic staff can read pacing
-- plans" / "scoped academic staff can read pacing items" / "scoped staff can
-- read teaching schedule" all still call can_access_teaching_plan, so every
-- current-school leader and allocated teacher reads exactly what they read
-- before. What is lost is only the leaked path, and the regression test asserts
-- the surviving path explicitly.
--
-- Historical rows and provenance triggers are untouched, and the curriculum
-- registry remains exactly as it was.
--
-- Deliberate, documented scope decision: HOD authority carries the full
-- responsibility chain (current school + effective staff_school_assignment +
-- active subject_department_responsibility). School Admin/Principal/Deputy
-- Principal retain current-school school-wide authoring authority WITHOUT an
-- invented staff-placement requirement, because a governance account may not
-- hold a staff_members row and the existing model never required one. Narrowing
-- that would remove working authority rather than add governance.

-- 1. Governance predicate: may the actor author this plan layer? -------------
--
-- Platform Admin retains full cross-school authority (it administers the
-- curriculum registry from which every plan layer derives). School actors may
-- author only department/class layers, only for their deterministic current
-- school, and HODs only within an active subject department responsibility.
-- A national_baseline layer is therefore authorable only by Platform Admin:
-- no existing authorization model permits an ordinary school actor to author a
-- national baseline, so the boundary refuses it rather than assuming it.
create or replace function app_private.can_author_teaching_plan(
  p_school_id uuid,
  p_subject_offering_id uuid,
  p_plan_level text
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or (
      p_plan_level in ('department','class')
      and app_private.user_current_school_matches((select auth.uid()), p_school_id)
      and (
        app_private.has_school_role(
          p_school_id,
          array['school_admin','principal','deputy_principal']
        )
        or (
          p_subject_offering_id is not null
          and exists (
            select 1
            from public.subject_offerings so
            where so.id = p_subject_offering_id
              and so.school_id = p_school_id
              and app_private.hod_responsible_for_subject(p_school_id, so.subject_id)
          )
        )
      )
    );
$$;

comment on function app_private.can_author_teaching_plan(uuid,uuid,text) is
'Teaching-plan authoring boundary: Platform Admin, or a current-school School Admin/Principal/Deputy Principal for department/class layers, or a current-school HOD holding an active subject department responsibility covering the offering subject. national_baseline layers remain Platform Admin only. Platform Support is excluded by construction.';

-- Authoring authority for a plan item is inherited from its parent plan so an
-- item can never widen beyond the plan layer it belongs to.
create or replace function app_private.can_author_pacing_plan_item(
  p_pacing_plan_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists (
    select 1
    from public.pacing_plans pp
    where pp.id = p_pacing_plan_id
      and app_private.can_author_teaching_plan(
        pp.school_id,
        pp.subject_offering_id,
        pp.plan_level
      )
  );
$$;

comment on function app_private.can_author_pacing_plan_item(uuid) is
'Pacing plan item authoring inherits exactly the parent plan authoring boundary; items cannot widen authority beyond their plan.';

-- Ownership predicate for schedule authoring: does the actor *own* this
-- allocation right now?
--
-- This is deliberately NOT a copy of the allocated-teacher branch of
-- can_access_teaching_plan, and the difference is the point:
--
--   * can_access_teaching_plan is the READ boundary. It must keep serving
--     school-wide leaders, so its allocated-teacher branch additionally
--     requires sm.role_key in ('teacher','class_teacher'). Unchanged here.
--   * This predicate answers a narrower question for the WRITE policy: is the
--     caller the member of staff this allocation belongs to, in force today?
--     Ownership is a property of the staff identity, not of the role label on a
--     membership row.
--
-- Why the role label is not tested. The existing, working writer
-- src/features/academics/server/lesson-preparation.ts records prepared/taught
-- status against a schedule item as the allocated teacher. An HOD who is also
-- the allocated teacher of a class must keep that authority; the shorthand the
-- old policy granted such an actor was school-wide, and school-wide is exactly
-- what is being removed here. Bounding this branch by ownership rather than by
-- role label removes the school-wide shortcut while preserving every write the
-- previous policy legitimately allowed:
--
--   old = has_school_role([...,'hod'])  OR  owns(role in teacher,class_teacher)
--   new = author(in-dept only)          OR  owns(any staff role label)
--
-- The new predicate is therefore a strict narrowing: every caller it admits was
-- already admitted by the old policy.
create or replace function app_private.owns_current_teacher_allocation(
  p_school_id uuid,
  p_teacher_allocation_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select p_teacher_allocation_id is not null
    and app_private.user_current_school_matches((select auth.uid()), p_school_id)
    and exists (
      select 1
      from public.teacher_allocations ta
      join public.staff_members staff
        on staff.id = ta.staff_member_id
       and staff.user_id = (select auth.uid())
       and staff.status = 'active'
      join public.school_memberships sm
        on sm.school_id = ta.school_id
       and sm.staff_member_id = ta.staff_member_id
       and sm.user_id = (select auth.uid())
      where ta.id = p_teacher_allocation_id
        and ta.school_id = p_school_id
        and sm.role_key is not null
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
        and ta.active_from <= current_date
        and (ta.active_to is null or ta.active_to >= current_date)
        and app_private.staff_member_has_school_assignment(
          ta.staff_member_id,
          p_school_id,
          current_date
        )
    );
$$;

comment on function app_private.owns_current_teacher_allocation(uuid,uuid) is
'Schedule-write ownership: the caller is an active member of staff at their current school who owns this teacher allocation and whose allocation and governed staff placement are in force today. Bounded by ownership rather than membership role label so an HOD who is also the allocated teacher keeps authority, while the former school-wide HOD shortcut is removed.';

-- Schedule authoring: plan author, or the teacher the allocation actually
-- belongs to. The school-wide leadership branch is deliberately not inherited;
-- a HOD therefore cannot schedule outside their department responsibility.
create or replace function app_private.can_manage_teaching_schedule(
  p_school_id uuid,
  p_pacing_plan_item_id uuid,
  p_teacher_allocation_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.can_author_pacing_plan_item(p_pacing_plan_item_id)
      or app_private.owns_current_teacher_allocation(p_school_id, p_teacher_allocation_id);
$$;

comment on function app_private.can_manage_teaching_schedule(uuid,uuid,uuid) is
'Teaching schedule authoring: the plan-item author, or the member of staff who owns that allocation today. No school-wide leadership shortcut: a HOD is limited to plan items in their department responsibility, or to allocations they personally own.';

revoke all on function app_private.can_author_teaching_plan(uuid,uuid,text) from public, anon;
revoke all on function app_private.can_author_pacing_plan_item(uuid) from public, anon;
revoke all on function app_private.owns_current_teacher_allocation(uuid,uuid) from public, anon;
revoke all on function app_private.can_manage_teaching_schedule(uuid,uuid,uuid) from public, anon;

grant execute on function app_private.can_author_teaching_plan(uuid,uuid,text) to authenticated;
grant execute on function app_private.can_author_pacing_plan_item(uuid) to authenticated;
grant execute on function app_private.owns_current_teacher_allocation(uuid,uuid) to authenticated;
grant execute on function app_private.can_manage_teaching_schedule(uuid,uuid,uuid) to authenticated;

-- 2. Replace the over-broad write policies ----------------------------------

-- pacing_plans ---------------------------------------------------------------
drop policy if exists "academic leaders can manage pacing plans" on public.pacing_plans;
drop policy if exists "academic leaders can manage pacing plans [insert]" on public.pacing_plans;

drop policy if exists "planning authors can create pacing plans" on public.pacing_plans;
create policy "planning authors can create pacing plans"
on public.pacing_plans
for insert
to authenticated
with check (
  created_by_user_id = (select auth.uid())
  and app_private.can_author_teaching_plan(school_id, subject_offering_id, plan_level)
);

drop policy if exists "planning authors can update pacing plans" on public.pacing_plans;
create policy "planning authors can update pacing plans"
on public.pacing_plans
for update
to authenticated
using (
  app_private.can_author_teaching_plan(school_id, subject_offering_id, plan_level)
)
with check (
  app_private.can_author_teaching_plan(school_id, subject_offering_id, plan_level)
);

drop policy if exists "planning authors can delete pacing plans" on public.pacing_plans;
create policy "planning authors can delete pacing plans"
on public.pacing_plans
for delete
to authenticated
using (
  app_private.can_author_teaching_plan(school_id, subject_offering_id, plan_level)
);

-- pacing_plan_items ----------------------------------------------------------
drop policy if exists "academic leaders can manage pacing items" on public.pacing_plan_items;

drop policy if exists "planning authors can create pacing items" on public.pacing_plan_items;
create policy "planning authors can create pacing items"
on public.pacing_plan_items
for insert
to authenticated
with check (app_private.can_author_pacing_plan_item(pacing_plan_id));

drop policy if exists "planning authors can update pacing items" on public.pacing_plan_items;
create policy "planning authors can update pacing items"
on public.pacing_plan_items
for update
to authenticated
using (app_private.can_author_pacing_plan_item(pacing_plan_id))
with check (app_private.can_author_pacing_plan_item(pacing_plan_id));

drop policy if exists "planning authors can delete pacing items" on public.pacing_plan_items;
create policy "planning authors can delete pacing items"
on public.pacing_plan_items
for delete
to authenticated
using (app_private.can_author_pacing_plan_item(pacing_plan_id));

-- teaching_schedule_items ----------------------------------------------------
drop policy if exists "scoped staff can manage teaching schedule" on public.teaching_schedule_items;

drop policy if exists "planning authors can create teaching schedule" on public.teaching_schedule_items;
create policy "planning authors can create teaching schedule"
on public.teaching_schedule_items
for insert
to authenticated
with check (
  app_private.can_manage_teaching_schedule(
    school_id,
    pacing_plan_item_id,
    teacher_allocation_id
  )
);

drop policy if exists "planning authors can update teaching schedule" on public.teaching_schedule_items;
create policy "planning authors can update teaching schedule"
on public.teaching_schedule_items
for update
to authenticated
using (
  app_private.can_manage_teaching_schedule(
    school_id,
    pacing_plan_item_id,
    teacher_allocation_id
  )
)
with check (
  app_private.can_manage_teaching_schedule(
    school_id,
    pacing_plan_item_id,
    teacher_allocation_id
  )
);

drop policy if exists "planning authors can delete teaching schedule" on public.teaching_schedule_items;
create policy "planning authors can delete teaching schedule"
on public.teaching_schedule_items
for delete
to authenticated
using (
  app_private.can_manage_teaching_schedule(
    school_id,
    pacing_plan_item_id,
    teacher_allocation_id
  )
);

-- 3. Allocation window enforcement for scheduled lessons ---------------------
--
-- A lesson may only be scheduled inside the window of the allocation it names.
-- The existing scheduling boundary validates tenant/school/year/class/offering
-- but never the allocation effective dates, so a lesson could be planned
-- against an allocation that had already ended.
create or replace function app_private.enforce_teaching_schedule_allocation_window()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_allocation record;
begin
  select ta.active_from, ta.active_to
    into v_allocation
    from public.teacher_allocations ta
   where ta.id = new.teacher_allocation_id
     and ta.tenant_id = new.tenant_id
     and ta.school_id = new.school_id;

  if not found then
    raise exception 'Teaching schedule allocation window mismatch: teacher allocation does not exist in this school';
  end if;

  if new.planned_on < v_allocation.active_from
     or (
       v_allocation.active_to is not null
       and new.planned_on > v_allocation.active_to
     ) then
    raise exception 'Teaching schedule allocation window mismatch: lesson date is outside the teacher allocation window';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_teaching_schedule_allocation_window()
  from public, anon, authenticated;

comment on function app_private.enforce_teaching_schedule_allocation_window() is
'Rejects a scheduled lesson whose planned date falls outside the effective window of the teacher allocation it names. Status-only updates and moved dates are untouched, so historical schedules survive intact.';

drop trigger if exists teaching_schedule_allocation_window_trg on public.teaching_schedule_items;
create trigger teaching_schedule_allocation_window_trg
before insert or update of planned_on, teacher_allocation_id
on public.teaching_schedule_items
for each row execute function app_private.enforce_teaching_schedule_allocation_window();
