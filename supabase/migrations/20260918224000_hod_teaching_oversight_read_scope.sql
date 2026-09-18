-- Issue #494 / Stream B: governed HOD teaching oversight.
--
-- Audit finding: app_private.can_access_teaching_plan historically treated any
-- current-school HOD as school-wide teaching-plan leadership. That conflicts
-- with the merged HOD responsibility model, where operational HOD authority is
-- explicit and effective-dated through subject_department_responsibilities.
--
-- This migration narrows HOD reads to assigned subjects while preserving:
--   * school-wide School Admin / Principal / Deputy Principal visibility;
--   * teacher/class-teacher self-scope through current governed allocation;
--   * Platform Admin governance;
--   * Platform Support exclusion through the existing current-school branch;
--   * historical rows, which are not rewritten.
--
-- It also exposes one read-only oversight RPC over the canonical planning,
-- preparation-submission and teaching-actual graph. No duplicate status store
-- or curriculum content is introduced.

create or replace function app_private.can_access_teaching_plan(
  target_school_id uuid,
  target_teacher_allocation_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or (
      app_private.user_current_school_matches((select auth.uid()), target_school_id)
      and not app_private.has_platform_role(array['platform_support'])
      and (
        app_private.has_school_role(
          target_school_id,
          array['school_admin','principal','deputy_principal']
        )
        or (
          target_teacher_allocation_id is not null
          and exists (
            select 1
            from public.teacher_allocations ta
            join public.subject_offerings so
              on so.id = ta.subject_offering_id
             and so.school_id = ta.school_id
            where ta.id = target_teacher_allocation_id
              and ta.school_id = target_school_id
              and app_private.hod_responsible_for_subject(
                target_school_id,
                so.subject_id
              )
          )
        )
        or exists (
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
          where ta.id = target_teacher_allocation_id
            and ta.school_id = target_school_id
            and sm.role_key is not null
            and sm.active_from <= current_date
            and (sm.active_to is null or sm.active_to >= current_date)
            and ta.active_from <= current_date
            and (ta.active_to is null or ta.active_to >= current_date)
            and app_private.staff_member_has_school_assignment(
              ta.staff_member_id,
              target_school_id,
              current_date
            )
        )
      )
    );
$$;

revoke all on function app_private.can_access_teaching_plan(uuid,uuid)
from public,anon;
grant execute on function app_private.can_access_teaching_plan(uuid,uuid)
to authenticated;

comment on function app_private.can_access_teaching_plan(uuid,uuid) is
'Teaching read boundary: Platform Admin; current-school School Admin/Principal/Deputy; current-school HOD only for an explicitly responsible subject; or current effective allocation owner regardless of local role label. This preserves teacher self-scope for an HOD who also teaches while HOD role alone is not school-wide teaching authority. Platform Support is excluded.';

drop policy if exists "scoped academic staff can read pacing plans"
on public.pacing_plans;
create policy "scoped academic staff can read pacing plans"
on public.pacing_plans
for select to authenticated
using (
  app_private.can_access_teaching_plan(school_id,teacher_allocation_id)
  or exists (
    select 1
    from public.subject_offerings so
    where so.id = pacing_plans.subject_offering_id
      and app_private.hod_responsible_for_subject(
        pacing_plans.school_id,
        so.subject_id
      )
  )
);

drop policy if exists "scoped academic staff can read pacing items"
on public.pacing_plan_items;
create policy "scoped academic staff can read pacing items"
on public.pacing_plan_items
for select to authenticated
using (
  exists (
    select 1
    from public.pacing_plans pp
    join public.subject_offerings so
      on so.id = pp.subject_offering_id
     and so.school_id = pp.school_id
    where pp.id = pacing_plan_items.pacing_plan_id
      and (
        app_private.can_access_teaching_plan(
          pp.school_id,
          pp.teacher_allocation_id
        )
        or app_private.hod_responsible_for_subject(
          pp.school_id,
          so.subject_id
        )
      )
  )
);

create or replace function public.resolve_hod_teaching_oversight(
  p_school_id uuid,
  p_academic_year integer
)
returns table(
  plan_id uuid,
  subject_id uuid,
  subject_name text,
  grade_name text,
  class_name text,
  teacher_name text,
  plan_level text,
  plan_status text,
  plan_item_count bigint,
  scheduled_lesson_count bigint,
  submitted_preparation_count bigint,
  reviewed_preparation_count bigint,
  returned_preparation_count bigint,
  taught_lesson_count bigint,
  reflected_lesson_count bigint,
  latest_taught_on date
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_academic_year is null or p_academic_year < 2000 or p_academic_year > 2200 then
    raise exception 'Invalid academic year';
  end if;
  if app_private.has_platform_role(array['platform_support']) then
    raise exception 'Permission denied';
  end if;
  if not app_private.user_current_school_matches((select auth.uid()),p_school_id) then
    raise exception 'Permission denied';
  end if;
  if not exists (
    select 1
    from public.school_memberships sm
    join public.staff_members staff
      on staff.id = sm.staff_member_id
     and staff.user_id = (select auth.uid())
     and staff.status = 'active'
    join public.staff_school_assignments ssa
      on ssa.staff_member_id = staff.id
     and ssa.school_id = sm.school_id
     and ssa.tenant_id = sm.tenant_id
     and ssa.effective_from <= current_date
     and (ssa.effective_to is null or ssa.effective_to >= current_date)
    where sm.school_id = p_school_id
      and sm.user_id = (select auth.uid())
      and sm.role_key = 'hod'
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
  ) then
    raise exception 'Permission denied';
  end if;

  return query
  select
    pp.id as plan_id,
    so.subject_id,
    subj.display_name::text as subject_name,
    grade.display_name::text as grade_name,
    rc.display_name::text as class_name,
    nullif(btrim(concat_ws(' ',teacher.first_name,teacher.last_name)),'')::text as teacher_name,
    pp.plan_level::text,
    pp.status::text,
    count(distinct ppi.id) as plan_item_count,
    count(distinct tsi.id) as scheduled_lesson_count,
    count(distinct psi.lesson_preparation_id) filter (where ps.status = 'submitted') as submitted_preparation_count,
    count(distinct psi.lesson_preparation_id) filter (where ps.status = 'reviewed') as reviewed_preparation_count,
    count(distinct psi.lesson_preparation_id) filter (where ps.status = 'returned') as returned_preparation_count,
    count(distinct ta.id) as taught_lesson_count,
    count(distinct ta.id) filter (
      where nullif(btrim(coalesce(ta.reflection,'')),'') is not null
    ) as reflected_lesson_count,
    max(ta.taught_on) as latest_taught_on
  from public.pacing_plans pp
  join public.subject_offerings so
    on so.id = pp.subject_offering_id
   and so.school_id = pp.school_id
  join public.subjects subj
    on subj.id = so.subject_id
  left join public.grades grade
    on grade.id = so.grade_id
  left join public.register_classes rc
    on rc.id = pp.register_class_id
  left join public.teacher_allocations alloc
    on alloc.id = pp.teacher_allocation_id
  left join public.staff_members teacher
    on teacher.id = alloc.staff_member_id
  left join public.pacing_plan_items ppi
    on ppi.pacing_plan_id = pp.id
  left join public.teaching_schedule_items tsi
    on tsi.pacing_plan_item_id = ppi.id
  left join public.lesson_preparations lp
    on lp.teaching_schedule_item_id = tsi.id
  left join public.preparation_submission_items psi
    on psi.lesson_preparation_id = lp.id
  left join public.preparation_submissions ps
    on ps.id = psi.preparation_submission_id
  left join public.teaching_actuals ta
    on ta.teaching_schedule_item_id = tsi.id
  where pp.school_id = p_school_id
    and pp.academic_year = p_academic_year
    and app_private.hod_responsible_for_subject(
      pp.school_id,
      so.subject_id
    )
  group by
    pp.id,so.subject_id,subj.display_name,grade.display_name,
    rc.display_name,teacher.first_name,teacher.last_name,
    pp.plan_level,pp.status
  order by
    subj.display_name,
    grade.display_name nulls last,
    rc.display_name nulls last,
    pp.id;
end;
$$;

revoke all on function public.resolve_hod_teaching_oversight(uuid,integer)
from public,anon;
grant execute on function public.resolve_hod_teaching_oversight(uuid,integer)
to authenticated;

comment on function public.resolve_hod_teaching_oversight(uuid,integer) is
'Read-only HOD oversight over canonical pacing plans, preparation submissions and teaching actuals. Only current effective subject responsibilities are returned; missing records remain missing rather than inferred as compliance.';
