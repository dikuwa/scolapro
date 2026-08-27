create or replace function app_private.has_school_role(target_school_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_platform_role(array['platform_admin','platform_support'])
    or exists (
      select 1
      from public.school_memberships sm
      where sm.school_id = target_school_id
        and sm.user_id = auth.uid()
        and sm.role_key = any(allowed_roles)
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
    );
$$;

grant execute on function app_private.has_school_role(uuid,text[]) to authenticated;

create or replace function app_private.can_view_operational_learners(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_school_role(
    target_school_id,
    array['school_admin','principal','deputy_principal','hod','teacher','class_teacher','counsellor','librarian']
  );
$$;

grant execute on function app_private.can_view_operational_learners(uuid) to authenticated;

create or replace function app_private.can_view_audit(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_platform_role(array['platform_admin','platform_support'])
    or app_private.has_school_role(
      target_school_id,
      array['school_admin','principal','deputy_principal']
    );
$$;

grant execute on function app_private.can_view_audit(uuid) to authenticated;

drop policy if exists "members can read enrolled learners" on public.learners;
create policy "authorized staff can read enrolled learners"
on public.learners for select
to authenticated
using (
  exists (
    select 1
    from public.enrolments e
    where e.learner_id = learners.id
      and app_private.can_view_operational_learners(e.school_id)
  )
);

drop policy if exists "members can read school enrolments" on public.enrolments;
create policy "authorized staff can read school enrolments"
on public.enrolments for select
to authenticated
using (app_private.can_view_operational_learners(school_id));

drop policy if exists "members can read school audit events" on public.audit_events;
create policy "authorized leaders can read school audit events"
on public.audit_events for select
to authenticated
using (school_id is not null and app_private.can_view_audit(school_id));

drop policy if exists "school members can read attendance events" on public.attendance_events;
create policy "authorized staff can read attendance events"
on public.attendance_events for select
to authenticated
using (app_private.can_view_operational_learners(school_id));

drop policy if exists "school members can read register submissions" on public.attendance_register_submissions;
create policy "authorized staff can read register submissions"
on public.attendance_register_submissions for select
to authenticated
using (app_private.can_view_operational_learners(school_id));

comment on function app_private.has_school_role(uuid,text[]) is 'Role-aware school authorization helper. General school membership must not be treated as permission to view learner or audit data.';
