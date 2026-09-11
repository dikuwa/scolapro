-- Keep the absence-review SECURITY DEFINER resolver aligned with the deterministic
-- current-school boundary introduced by PR #411. A caller may retain multiple active
-- school memberships for account history/switching, but operational absence scope must
-- be resolved only for the one current school (active_from DESC, id ASC).
create or replace function public.resolve_absence_review_scope(
  p_school_id uuid,
  p_from date,
  p_to date
)
returns table(scope_kind text, scope_id uuid, register_class_id uuid)
language plpgsql
stable
security definer
set search_path = public, app_private
as $$
declare
  v_today date := (timezone('Africa/Windhoek', now()))::date;
  v_current_school_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_school_id is null or p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid absence review scope';
  end if;

  select sm.school_id
  into v_current_school_id
  from public.school_memberships sm
  where sm.user_id = auth.uid()
    and sm.active_from <= v_today
    and (sm.active_to is null or sm.active_to >= v_today)
  order by sm.active_from desc, sm.id asc
  limit 1;

  if v_current_school_id is null or p_school_id <> v_current_school_id then
    return;
  end if;

  -- School leadership has existing school-wide attendance authority, but only in
  -- the deterministic current school.
  if exists (
    select 1
    from public.school_memberships sm
    where sm.school_id = p_school_id
      and sm.user_id = auth.uid()
      and sm.role_key in ('school_admin','principal','deputy_principal')
      and sm.active_from <= v_today
      and (sm.active_to is null or sm.active_to >= v_today)
  ) then
    return query
      select 'daily_class'::text, rc.id, rc.id
      from public.register_classes rc
      where rc.school_id = p_school_id;

    return query
      select 'subject_slot'::text, ts.id, ts.register_class_id
      from public.timetable_slots ts
      join public.teacher_allocations ta on ta.id = ts.teacher_allocation_id
      where ts.school_id = p_school_id
        and ts.status = 'active'
        and ta.school_id = p_school_id
        and ta.active_from <= p_to
        and (ta.active_to is null or ta.active_to >= p_from);
    return;
  end if;

  -- A class teacher receives daily/register awareness only for the register class
  -- explicitly assigned to their effective school membership staff identity.
  return query
    select 'daily_class'::text, rc.id, rc.id
    from public.school_memberships sm
    join public.staff_members staff on staff.id = sm.staff_member_id
    join public.register_classes rc
      on rc.school_id = sm.school_id
     and rc.register_teacher_staff_id = staff.id
    where sm.school_id = p_school_id
      and sm.user_id = auth.uid()
      and sm.role_key = 'class_teacher'
      and sm.active_from <= v_today
      and (sm.active_to is null or sm.active_to >= v_today)
      and staff.user_id = auth.uid()
      and staff.status = 'active';

  -- Subject-period awareness follows explicit teaching/timetable allocation only.
  -- HOD has no inferred department-wide scope because the current schema has no
  -- canonical HOD-to-department ownership relation. Counsellor/review authority does
  -- not enter this branch at all.
  return query
    select distinct 'subject_slot'::text, ts.id, ts.register_class_id
    from public.school_memberships sm
    join public.staff_members staff on staff.id = sm.staff_member_id
    join public.teacher_allocations ta
      on ta.school_id = sm.school_id
     and ta.staff_member_id = staff.id
     and ta.active_from <= p_to
     and (ta.active_to is null or ta.active_to >= p_from)
    join public.timetable_slots ts
      on ts.school_id = sm.school_id
     and ts.teacher_allocation_id = ta.id
     and ts.status = 'active'
    where sm.school_id = p_school_id
      and sm.user_id = auth.uid()
      and sm.role_key in ('teacher','class_teacher','hod')
      and sm.active_from <= v_today
      and (sm.active_to is null or sm.active_to >= v_today)
      and staff.user_id = auth.uid()
      and staff.status = 'active'
      and app_private.staff_member_has_school_assignment(staff.id, p_school_id, v_today);
end;
$$;

revoke all on function public.resolve_absence_review_scope(uuid,date,date) from public, anon;
grant execute on function public.resolve_absence_review_scope(uuid,date,date) to authenticated;

comment on function public.resolve_absence_review_scope(uuid,date,date) is
'Returns current-school-only daily-class and subject-slot visibility for absence review. Leadership is school-wide inside that school; class-teacher daily scope follows register assignment; teacher/class-teacher/HOD subject scope follows explicit allocations. Guardian review and evidence authority remain separate.';
