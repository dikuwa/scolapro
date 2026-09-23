-- Issue #681: subject + grade + academic-year Year Planner / Scheme of Work.
--
-- This extends the canonical pacing plan. It does not create a second plan,
-- curriculum registry, lesson-preparation store, or calendar implementation.
-- Department plans are the shared subject/grade/year plan; a class plan remains
-- available only as an explicit pacing variant in the pre-existing model.

alter table public.pacing_plan_items
  add column if not exists academic_term_id uuid
    references public.academic_terms(id) on delete restrict,
  add column if not exists completed_on date;

create index if not exists pacing_plan_items_term_sequence_idx
  on public.pacing_plan_items(academic_term_id, sequence_number)
  where academic_term_id is not null;

create table if not exists public.pacing_plan_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  pacing_plan_id uuid not null references public.pacing_plans(id) on delete cascade,
  academic_term_id uuid references public.academic_terms(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  notes text check (notes is null or char_length(notes) <= 2000),
  starts_on date not null,
  ends_on date not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index if not exists pacing_plan_events_plan_date_idx
  on public.pacing_plan_events(pacing_plan_id, starts_on, ends_on);

alter table public.pacing_plan_events enable row level security;

-- A shared plan is visible to every currently allocated teacher for the
-- offering, regardless of which class their allocation names. That is the
-- database expression of Subject + Grade + Academic Year plan identity.
create or replace function app_private.can_access_subject_grade_plan(
  p_school_id uuid,
  p_subject_offering_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or (
      app_private.user_current_school_matches((select auth.uid()), p_school_id)
      and not app_private.has_platform_role(array['platform_support'])
      and (
        app_private.has_school_role(
          p_school_id,
          array['school_admin','principal','deputy_principal']
        )
        or exists (
          select 1
          from public.subject_offerings so
          where so.id = p_subject_offering_id
            and so.school_id = p_school_id
            and app_private.hod_responsible_for_subject(p_school_id, so.subject_id)
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
           and sm.role_key in ('teacher','class_teacher')
           and sm.active_from <= current_date
           and (sm.active_to is null or sm.active_to >= current_date)
          where ta.subject_offering_id = p_subject_offering_id
            and ta.school_id = p_school_id
            and ta.active_from <= current_date
            and (ta.active_to is null or ta.active_to >= current_date)
            and app_private.staff_member_has_school_assignment(
              ta.staff_member_id,
              p_school_id,
              current_date
            )
        )
      )
    );
$$;

revoke all on function app_private.can_access_subject_grade_plan(uuid,uuid)
  from public, anon;
grant execute on function app_private.can_access_subject_grade_plan(uuid,uuid)
  to authenticated;

comment on function app_private.can_access_subject_grade_plan(uuid,uuid) is
'Current-school read boundary for a shared subject + grade + academic-year plan: school leaders, responsible HOD, or a current effective teacher allocation for any class on the offering. Platform Support is excluded.';

-- Preserve leader/HOD rules and add allocated teachers only for the shared
-- department layer. Teachers cannot create arbitrary class variants or a
-- national baseline.
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
      and not app_private.has_platform_role(array['platform_support'])
      and (
        app_private.has_school_role(
          p_school_id,
          array['school_admin','principal','deputy_principal']
        )
        or (
          exists (
            select 1
            from public.subject_offerings so
            where so.id = p_subject_offering_id
              and so.school_id = p_school_id
              and app_private.hod_responsible_for_subject(p_school_id, so.subject_id)
          )
        )
        or (
          p_plan_level = 'department'
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
             and sm.role_key in ('teacher','class_teacher')
             and sm.active_from <= current_date
             and (sm.active_to is null or sm.active_to >= current_date)
            where ta.subject_offering_id = p_subject_offering_id
              and ta.school_id = p_school_id
              and ta.active_from <= current_date
              and (ta.active_to is null or ta.active_to >= current_date)
              and app_private.staff_member_has_school_assignment(
                ta.staff_member_id,
                p_school_id,
                current_date
              )
          )
        )
      )
    );
$$;

revoke all on function app_private.can_author_teaching_plan(uuid,uuid,text)
  from public, anon;
grant execute on function app_private.can_author_teaching_plan(uuid,uuid,text)
  to authenticated;

comment on function app_private.can_author_teaching_plan(uuid,uuid,text) is
'Teaching plan authoring: Platform Admin; current-school school leaders; responsible HOD; or a current effective allocated teacher for the shared department plan only. Class plans are explicit leader/HOD variants; national baselines remain platform-authored.';

drop policy if exists "scoped academic staff can read pacing plans"
  on public.pacing_plans;
create policy "scoped academic staff can read pacing plans"
on public.pacing_plans for select to authenticated
using (
  app_private.can_access_subject_grade_plan(school_id, subject_offering_id)
  or app_private.can_access_teaching_plan(school_id, teacher_allocation_id)
);

drop policy if exists "scoped academic staff can read pacing items"
  on public.pacing_plan_items;
create policy "scoped academic staff can read pacing items"
on public.pacing_plan_items for select to authenticated
using (
  exists (
    select 1 from public.pacing_plans pp
    where pp.id = pacing_plan_items.pacing_plan_id
      and (
        app_private.can_access_subject_grade_plan(pp.school_id, pp.subject_offering_id)
        or app_private.can_access_teaching_plan(pp.school_id, pp.teacher_allocation_id)
      )
  )
);

create policy "scoped academic staff can read pacing events"
on public.pacing_plan_events for select to authenticated
using (
  exists (
    select 1 from public.pacing_plans pp
    where pp.id = pacing_plan_events.pacing_plan_id
      and app_private.can_access_subject_grade_plan(pp.school_id, pp.subject_offering_id)
  )
);

create policy "planning authors can create pacing events"
on public.pacing_plan_events for insert to authenticated
with check (
  created_by_user_id = (select auth.uid())
  and app_private.can_author_pacing_plan_item(pacing_plan_id)
);

create policy "planning authors can update pacing events"
on public.pacing_plan_events for update to authenticated
using (app_private.can_author_pacing_plan_item(pacing_plan_id))
with check (app_private.can_author_pacing_plan_item(pacing_plan_id));

create policy "planning authors can delete pacing events"
on public.pacing_plan_events for delete to authenticated
using (app_private.can_author_pacing_plan_item(pacing_plan_id));

-- Parent scope, term placement and academic-year date validation stay at the
-- database boundary. Calendar impact is intentionally absent: these are plan
-- annotations and never become school_day_overrides or timetable-day logic.
create or replace function app_private.enforce_pacing_plan_calendar_context()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan record;
  v_term record;
  v_year record;
begin
  select tenant_id, school_id, academic_year
    into v_plan
    from public.pacing_plans
   where id = new.pacing_plan_id;
  if not found then raise exception 'Pacing plan does not exist'; end if;

  if new.tenant_id is distinct from v_plan.tenant_id
     or new.school_id is distinct from v_plan.school_id then
    raise exception 'Planning calendar context scope mismatch';
  end if;

  select id, starts_on, ends_on
    into v_year
    from public.academic_years
   where school_id = v_plan.school_id and year = v_plan.academic_year;

  if new.academic_term_id is not null then
    select at.id, at.starts_on, at.ends_on
      into v_term
      from public.academic_terms at
     where at.id = new.academic_term_id
       and at.school_id = v_plan.school_id
       and at.academic_year_id = v_year.id;
    if not found then raise exception 'Academic term is outside the pacing plan year'; end if;
  end if;

  if tg_table_name = 'pacing_plan_items' then
    if new.planned_start_on is not null and new.academic_term_id is not null
       and (v_term.starts_on is null or v_term.ends_on is null
         or new.planned_start_on < v_term.starts_on or new.planned_start_on > v_term.ends_on) then
      raise exception 'Planned date is outside the selected academic term';
    end if;
    if new.planned_end_on is not null and new.academic_term_id is not null
       and (v_term.starts_on is null or v_term.ends_on is null
         or new.planned_end_on < v_term.starts_on or new.planned_end_on > v_term.ends_on) then
      raise exception 'Planned end date is outside the selected academic term';
    end if;
    if new.completed_on is not null and v_year.id is not null
       and (v_year.starts_on is null or v_year.ends_on is null
         or new.completed_on < v_year.starts_on or new.completed_on > v_year.ends_on) then
      raise exception 'Completed date is outside the pacing plan academic year';
    end if;
  else
    if new.academic_term_id is not null
       and (v_term.starts_on is null or v_term.ends_on is null
         or new.starts_on < v_term.starts_on or new.ends_on > v_term.ends_on) then
      raise exception 'Planning event dates are outside the selected academic term';
    end if;
  end if;

  if tg_table_name = 'pacing_plan_events' then
    if tg_op = 'UPDATE' and (
      new.tenant_id is distinct from old.tenant_id
      or new.school_id is distinct from old.school_id
      or new.pacing_plan_id is distinct from old.pacing_plan_id
      or new.created_by_user_id is distinct from old.created_by_user_id
      or new.created_at is distinct from old.created_at
    ) then
      raise exception 'Planning event provenance is immutable';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_pacing_plan_calendar_context()
  from public, anon, authenticated;

drop trigger if exists pacing_plan_item_calendar_context_trg
  on public.pacing_plan_items;
create trigger pacing_plan_item_calendar_context_trg
before insert or update of academic_term_id, planned_start_on, planned_end_on, completed_on
on public.pacing_plan_items
for each row execute function app_private.enforce_pacing_plan_calendar_context();

drop trigger if exists pacing_plan_event_calendar_context_trg
  on public.pacing_plan_events;
create trigger pacing_plan_event_calendar_context_trg
before insert or update on public.pacing_plan_events
for each row execute function app_private.enforce_pacing_plan_calendar_context();

comment on table public.pacing_plan_events is
'Teacher-local Year Planner annotations attached to the canonical pacing plan. They do not alter the authoritative school calendar or timetable-day resolution.';
