-- Conduct and achievement observations belong to learner-facing staff who actually
-- work with the learner, not every role that can see an operational learner directory.
-- Also prevent learner/enrolment/school identifiers from being mixed across records.

create or replace function app_private.can_access_learner_observations(
  p_school_id uuid,
  p_learner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or exists(
      select 1
      from public.school_memberships sm
      where sm.school_id=p_school_id
        and sm.user_id=(select auth.uid())
        and sm.role_key in ('school_admin','principal','deputy_principal','counsellor')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    )
    or exists(
      select 1
      from public.enrolments e
      left join public.register_classes rc on rc.id=e.register_class_id
      left join public.staff_members register_staff on register_staff.id=rc.register_teacher_staff_id
      where e.school_id=p_school_id
        and e.learner_id=p_learner_id
        and e.status='current'
        and (
          (
            register_staff.user_id=(select auth.uid())
            and register_staff.status='active'
            and exists(
              select 1 from public.school_memberships sm
              where sm.school_id=p_school_id
                and sm.user_id=(select auth.uid())
                and sm.role_key='class_teacher'
                and sm.active_from<=current_date
                and (sm.active_to is null or sm.active_to>=current_date)
            )
          )
          or exists(
            select 1
            from public.teacher_allocations ta
            join public.staff_members teacher_staff on teacher_staff.id=ta.staff_member_id
            where ta.school_id=p_school_id
              and ta.register_class_id=e.register_class_id
              and ta.academic_year=e.academic_year
              and ta.active_from<=current_date
              and (ta.active_to is null or ta.active_to>=current_date)
              and teacher_staff.user_id=(select auth.uid())
              and teacher_staff.status='active'
          )
        )
    );
$$;
revoke all on function app_private.can_access_learner_observations(uuid,uuid) from public,anon,authenticated;

drop policy if exists "authorized staff can read conduct events" on public.conduct_events;
create policy "assigned staff read conduct events"
on public.conduct_events for select to authenticated
using (app_private.can_access_learner_observations(school_id,learner_id));

drop policy if exists "teaching staff can create conduct events" on public.conduct_events;
create policy "assigned staff create conduct events"
on public.conduct_events for insert to authenticated
with check (
  recorded_by_user_id=(select auth.uid())
  and app_private.can_access_learner_observations(school_id,learner_id)
);

drop policy if exists "authorized staff can read achievements" on public.achievement_events;
create policy "assigned staff read achievements"
on public.achievement_events for select to authenticated
using (app_private.can_access_learner_observations(school_id,learner_id));

drop policy if exists "teaching staff can create achievements" on public.achievement_events;
create policy "assigned staff create achievements"
on public.achievement_events for insert to authenticated
with check (
  recorded_by_user_id=(select auth.uid())
  and app_private.can_access_learner_observations(school_id,learner_id)
);

create or replace function app_private.enforce_learner_enrolment_record_scope()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_enrolment_id uuid;
  v_enrol public.enrolments%rowtype;
begin
  v_enrolment_id:=nullif(to_jsonb(new)->>tg_argv[0],'')::uuid;

  if v_enrolment_id is not null then
    select * into v_enrol from public.enrolments where id=v_enrolment_id;
    if not found then raise exception 'Referenced enrolment does not exist' using errcode='23503'; end if;
    if new.tenant_id<>v_enrol.tenant_id
      or new.school_id<>v_enrol.school_id
      or new.learner_id<>v_enrol.learner_id
    then raise exception 'Learner record does not match referenced enrolment scope' using errcode='23514'; end if;
  else
    if not exists(
      select 1 from public.enrolments e
      where e.learner_id=new.learner_id
        and e.tenant_id=new.tenant_id
        and e.school_id=new.school_id
    ) then raise exception 'Learner has no enrolment relationship with this school' using errcode='23514'; end if;
  end if;

  return new;
end;
$$;
revoke all on function app_private.enforce_learner_enrolment_record_scope() from public,anon,authenticated;

drop trigger if exists conduct_events_learner_scope_guard on public.conduct_events;
create trigger conduct_events_learner_scope_guard
before insert or update on public.conduct_events
for each row execute function app_private.enforce_learner_enrolment_record_scope('enrolment_id');

drop trigger if exists achievement_events_learner_scope_guard on public.achievement_events;
create trigger achievement_events_learner_scope_guard
before insert or update on public.achievement_events
for each row execute function app_private.enforce_learner_enrolment_record_scope('enrolment_id');

drop trigger if exists learner_support_cases_learner_scope_guard on public.learner_support_cases;
create trigger learner_support_cases_learner_scope_guard
before insert or update on public.learner_support_cases
for each row execute function app_private.enforce_learner_enrolment_record_scope('enrolment_id');

drop trigger if exists learner_support_interventions_case_scope_guard on public.learner_support_interventions;
create trigger learner_support_interventions_case_scope_guard
before insert or update on public.learner_support_interventions
for each row execute function app_private.enforce_parent_scope('support_case_id','public.learner_support_cases','school_id','required');

comment on function app_private.can_access_learner_observations(uuid,uuid) is
'Learner observation scope for leadership/counsellor or the learner current assigned register/subject teacher; generic school learner visibility is insufficient.';