-- Assessment/marks are school-operational boundaries. Preserve the existing
-- assessment lifecycle and subject/class allocation model, but bind current access
-- to deterministic current school, effective linked staff placement, and Platform
-- Support separation.

create or replace function app_private.user_has_current_assessment_school_role(
  p_user_id uuid,
  p_school_id uuid,
  p_allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  with platform_flags as (
    select
      exists(
        select 1
        from public.platform_memberships pm
        where pm.user_id = p_user_id
          and pm.role_key = 'platform_admin'
          and pm.active_from <= current_date
          and (pm.active_to is null or pm.active_to >= current_date)
      ) as is_admin,
      exists(
        select 1
        from public.platform_memberships pm
        where pm.user_id = p_user_id
          and pm.role_key = 'platform_support'
          and pm.active_from <= current_date
          and (pm.active_to is null or pm.active_to >= current_date)
      ) as is_support
  ),
  current_school as (
    select sm.school_id
    from public.school_memberships sm
    where sm.user_id = p_user_id
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
    order by sm.active_from desc, sm.id asc
    limit 1
  )
  select (select is_admin from platform_flags)
    or (
      not (select is_support from platform_flags)
      and exists(select 1 from current_school cs where cs.school_id = p_school_id)
      and exists(
        select 1
        from public.school_memberships sm
        where sm.user_id = p_user_id
          and sm.school_id = p_school_id
          and sm.role_key = any(p_allowed_roles)
          and sm.active_from <= current_date
          and (sm.active_to is null or sm.active_to >= current_date)
          and (
            sm.staff_member_id is null
            or (
              exists(
                select 1
                from public.staff_members staff
                where staff.id = sm.staff_member_id
                  and staff.tenant_id = sm.tenant_id
                  and staff.status = 'active'
              )
              and app_private.staff_member_covers_school_period(
                sm.staff_member_id,
                p_school_id,
                current_date,
                current_date
              )
            )
          )
      )
    );
$$;

revoke all on function app_private.user_has_current_assessment_school_role(uuid,uuid,text[])
  from public, anon, authenticated;

comment on function app_private.user_has_current_assessment_school_role(uuid,uuid,text[]) is
'Assessment-specific arbitrary-user role authority. Platform Admin remains a cross-school override; otherwise authority is bound to deterministic current school, effective role membership, effective linked staff placement, and explicit Platform Support separation.';

create or replace function app_private.user_is_academic_leader(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.user_has_current_assessment_school_role(
    p_user_id,
    p_school_id,
    array['school_admin','principal','deputy_principal','hod']
  );
$$;

revoke all on function app_private.user_is_academic_leader(uuid,uuid)
  from public, anon, authenticated;

create or replace function app_private.user_can_manage_assessment_instance_scope(
  p_user_id uuid,
  p_school_id uuid,
  p_academic_year integer,
  p_subject_offering_id uuid,
  p_register_class_id uuid,
  p_teacher_allocation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.user_is_academic_leader(p_user_id, p_school_id)
    or (
      not exists(
        select 1
        from public.platform_memberships pm
        where pm.user_id = p_user_id
          and pm.role_key = 'platform_support'
          and pm.active_from <= current_date
          and (pm.active_to is null or pm.active_to >= current_date)
      )
      and exists(
        select 1
        from (
          select sm.school_id
          from public.school_memberships sm
          where sm.user_id = p_user_id
            and sm.active_from <= current_date
            and (sm.active_to is null or sm.active_to >= current_date)
          order by sm.active_from desc, sm.id asc
          limit 1
        ) cs
        where cs.school_id = p_school_id
      )
      and exists(
        select 1
        from public.school_memberships sm
        join public.staff_members staff
          on staff.id = sm.staff_member_id
         and staff.tenant_id = sm.tenant_id
         and staff.status = 'active'
        join public.teacher_allocations ta
          on ta.id = p_teacher_allocation_id
         and ta.staff_member_id = staff.id
         and ta.tenant_id = sm.tenant_id
         and ta.school_id = p_school_id
         and ta.academic_year = p_academic_year
         and ta.subject_offering_id = p_subject_offering_id
         and ta.register_class_id = p_register_class_id
         and ta.active_from <= current_date
         and (ta.active_to is null or ta.active_to >= current_date)
        where sm.user_id = p_user_id
          and sm.school_id = p_school_id
          and sm.role_key in ('teacher','class_teacher')
          and sm.active_from <= current_date
          and (sm.active_to is null or sm.active_to >= current_date)
          and app_private.staff_member_covers_school_period(
            staff.id,
            p_school_id,
            current_date,
            current_date
          )
      )
    );
$$;

revoke all on function app_private.user_can_manage_assessment_instance_scope(uuid,uuid,integer,uuid,uuid,uuid)
  from public, anon, authenticated;

create or replace function app_private.can_manage_assessment_instance_scope(
  p_school_id uuid,
  p_academic_year integer,
  p_subject_offering_id uuid,
  p_register_class_id uuid,
  p_teacher_allocation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select (select auth.uid()) is not null
    and app_private.user_can_manage_assessment_instance_scope(
      (select auth.uid()),
      p_school_id,
      p_academic_year,
      p_subject_offering_id,
      p_register_class_id,
      p_teacher_allocation_id
    );
$$;

revoke all on function app_private.can_manage_assessment_instance_scope(uuid,integer,uuid,uuid,uuid)
  from public, anon;
grant execute on function app_private.can_manage_assessment_instance_scope(uuid,integer,uuid,uuid,uuid)
  to authenticated;

create or replace function app_private.can_access_assessment_instance(target_instance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists(
    select 1
    from public.assessment_instances ai
    where ai.id = target_instance_id
      and app_private.can_manage_assessment_instance_scope(
        ai.school_id,
        ai.academic_year,
        ai.subject_offering_id,
        ai.register_class_id,
        ai.teacher_allocation_id
      )
  );
$$;

revoke all on function app_private.can_access_assessment_instance(uuid) from public, anon;
grant execute on function app_private.can_access_assessment_instance(uuid) to authenticated;

create or replace function app_private.can_read_assessment_reference_school(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select (select auth.uid()) is not null
    and app_private.user_has_current_assessment_school_role(
      (select auth.uid()),
      p_school_id,
      array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']
    );
$$;

revoke all on function app_private.can_read_assessment_reference_school(uuid) from public, anon;
grant execute on function app_private.can_read_assessment_reference_school(uuid) to authenticated;

create or replace function app_private.can_read_official_result(
  p_school_id uuid,
  p_enrolment_id uuid,
  p_subject_offering_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.user_is_academic_leader((select auth.uid()), p_school_id)
    or (
      (select auth.uid()) is not null
      and not app_private.has_platform_role(array['platform_support'])
      and app_private.is_current_school(p_school_id)
      and exists(
        select 1
        from public.enrolments e
        join public.school_memberships sm
          on sm.school_id = e.school_id
         and sm.tenant_id = e.tenant_id
        join public.staff_members staff
          on staff.id = sm.staff_member_id
         and staff.tenant_id = sm.tenant_id
         and staff.status = 'active'
        join public.teacher_allocations ta
          on ta.staff_member_id = staff.id
         and ta.tenant_id = e.tenant_id
         and ta.school_id = e.school_id
         and ta.academic_year = e.academic_year
         and ta.register_class_id = e.register_class_id
         and ta.subject_offering_id = p_subject_offering_id
         and ta.active_from <= current_date
         and (ta.active_to is null or ta.active_to >= current_date)
        where e.id = p_enrolment_id
          and e.school_id = p_school_id
          and sm.user_id = (select auth.uid())
          and sm.role_key in ('teacher','class_teacher')
          and sm.active_from <= current_date
          and (sm.active_to is null or sm.active_to >= current_date)
          and app_private.staff_member_covers_school_period(
            staff.id,
            p_school_id,
            current_date,
            current_date
          )
      )
    );
$$;

revoke all on function app_private.can_read_official_result(uuid,uuid,uuid) from public, anon;
grant execute on function app_private.can_read_official_result(uuid,uuid,uuid) to authenticated;

-- Reference configuration remains school-wide to the same academic roles, but only
-- inside the actor's deterministic current school and effective placement.
drop policy if exists "academic staff can read assessment schemes" on public.assessment_schemes;
create policy "academic staff can read assessment schemes"
on public.assessment_schemes for select to authenticated
using (app_private.can_read_assessment_reference_school(school_id));

drop policy if exists "academic leaders can manage assessment schemes" on public.assessment_schemes;
create policy "academic leaders can manage assessment schemes"
on public.assessment_schemes for all to authenticated
using (app_private.user_is_academic_leader((select auth.uid()), school_id))
with check (app_private.user_is_academic_leader((select auth.uid()), school_id));

drop policy if exists "academic leaders can manage assessment schemes [insert]" on public.assessment_schemes;
create policy "academic leaders can manage assessment schemes [insert]"
on public.assessment_schemes for insert to authenticated
with check (
  created_by_user_id = (select auth.uid())
  and app_private.user_is_academic_leader((select auth.uid()), school_id)
);

drop policy if exists "academic staff can read assessment components" on public.assessment_components;
create policy "academic staff can read assessment components"
on public.assessment_components for select to authenticated
using (app_private.can_read_assessment_reference_school(school_id));

drop policy if exists "academic leaders can manage assessment components" on public.assessment_components;
create policy "academic leaders can manage assessment components"
on public.assessment_components for all to authenticated
using (app_private.user_is_academic_leader((select auth.uid()), school_id))
with check (app_private.user_is_academic_leader((select auth.uid()), school_id));

comment on function app_private.can_manage_assessment_instance_scope(uuid,integer,uuid,uuid,uuid) is
'Current assessment mutation authority: Platform Admin or deterministic-current-school academic leadership, otherwise an effective teacher/class-teacher with authoritative current staff placement and the exact active subject/class allocation. Platform Support is not a school-operational assessment actor.';

comment on function app_private.can_access_assessment_instance(uuid) is
'Assessment instance read/write authority bound to the hardened current assessment scope used by mark entry and submission workflows.';
