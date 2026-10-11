-- Calendar governance refinement: metadata-only term corrections, append-only
-- operational event revisions/cancellations, scoped management reads and
-- semantic duplicate protection.

begin;

create or replace function public.correct_operational_term_calendar_source(
  p_academic_term_id uuid,
  p_source_label text default null,
  p_source_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_term public.academic_terms%rowtype;
  v_year public.academic_years%rowtype;
  v_profile public.academic_term_calendar_profiles%rowtype;
  v_profile_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_term from public.academic_terms where id=p_academic_term_id;
  if not found then raise exception 'Academic term not found'; end if;
  select * into v_year from public.academic_years where id=v_term.academic_year_id;
  if not found then raise exception 'Academic year not found'; end if;

  if not app_private.user_targets_current_school(auth.uid(),v_term.school_id)
     or not app_private.has_school_role(v_term.school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'Permission denied';
  end if;
  if v_year.status='closed' then raise exception 'Closed academic year is final'; end if;

  select * into v_profile
  from public.academic_term_calendar_profiles
  where academic_term_id=v_term.id;

  insert into public.academic_term_calendar_profiles(
    tenant_id,school_id,academic_term_id,teacher_starts_on,teacher_ends_on,
    official_learner_day_count,source_kind,source_label,source_reference,configured_by_user_id
  ) values(
    v_term.tenant_id,v_term.school_id,v_term.id,
    v_profile.teacher_starts_on,v_profile.teacher_ends_on,v_profile.official_learner_day_count,
    coalesce(v_profile.source_kind,'manual'),
    nullif(btrim(coalesce(p_source_label,'')),''),
    nullif(btrim(coalesce(p_source_reference,'')),''),auth.uid()
  )
  on conflict(academic_term_id) do update set
    source_label=excluded.source_label,
    source_reference=excluded.source_reference,
    configured_by_user_id=auth.uid(),
    updated_at=now()
  returning id into v_profile_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_term.tenant_id,v_term.school_id,auth.uid(),'calendar.term_source.corrected',
    'academic_term_calendar_profile',v_profile_id,
    jsonb_build_object(
      'academic_term_id',v_term.id,
      'term_status',v_term.status,
      'previous_source_label',v_profile.source_label,
      'previous_source_reference',v_profile.source_reference,
      'source_label',nullif(btrim(coalesce(p_source_label,'')),''),
      'source_reference',nullif(btrim(coalesce(p_source_reference,'')),'')
    )
  );
  return v_profile_id;
end;
$$;

revoke all on function public.correct_operational_term_calendar_source(uuid,text,text) from public,anon;
grant execute on function public.correct_operational_term_calendar_source(uuid,text,text) to authenticated;

create or replace function app_private.prevent_operational_calendar_duplicates()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if new.lifecycle_status<>'active' or new.scope_kind<>'school' then return new; end if;

  if exists(
    select 1
    from public.effective_learner_calendar_events learner_event
    where learner_event.academic_year=new.academic_year
      and (learner_event.event_scope='national' or learner_event.school_id=new.school_id)
      and lower(regexp_replace(btrim(learner_event.title),'\s+',' ','g'))=
          lower(regexp_replace(btrim(new.title),'\s+',' ','g'))
      and learner_event.starts_on=new.starts_on
      and learner_event.ends_on=new.ends_on
      and learner_event.id is distinct from (
        select prior.learner_calendar_event_id
        from public.operational_calendar_events prior
        where prior.id=new.supersedes_event_id
      )
  ) then
    raise exception 'This official calendar event already exists. Keep it in Official calendar & adjustments.';
  end if;

  if new.learner_day_effect<>'UNCHANGED' and exists(
    select 1
    from public.effective_operational_calendar_events event
    where event.school_id=new.school_id
      and event.scope_kind='school'
      and event.starts_on=new.starts_on
      and event.ends_on=new.ends_on
      and event.learner_day_effect=new.learner_day_effect
      and event.id is distinct from new.supersedes_event_id
  ) then
    raise exception 'A school event with the same date range and teaching impact already exists';
  end if;
  return new;
end;
$$;

revoke all on function app_private.prevent_operational_calendar_duplicates() from public,anon,authenticated;
drop trigger if exists operational_calendar_duplicate_guard_trg on public.operational_calendar_events;
create trigger operational_calendar_duplicate_guard_trg
before insert on public.operational_calendar_events
for each row execute function app_private.prevent_operational_calendar_duplicates();

create or replace function public.revise_operational_calendar_event(
  p_event_id uuid,
  p_event_kind text,
  p_title text,
  p_starts_on date,
  p_ends_on date,
  p_starts_at time default null,
  p_ends_at time default null,
  p_audience_scope text default 'all_school',
  p_target_staff_member_id uuid default null,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_prior public.operational_calendar_events%rowtype;
  v_new_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_prior from public.effective_operational_calendar_events where id=p_event_id;
  if not found then raise exception 'Calendar event not found or already superseded'; end if;
  if v_prior.learner_calendar_event_id is not null or v_prior.learner_day_effect<>'UNCHANGED' then
    raise exception 'Teaching-impact dates must be revised through Official calendar & adjustments';
  end if;

  select public.create_operational_calendar_event(
    v_prior.school_id,v_prior.academic_year,v_prior.scope_kind,p_event_kind,p_title,
    p_starts_on,p_ends_on,p_starts_at,p_ends_at,p_audience_scope,
    v_prior.department_head_staff_assignment_id,p_target_staff_member_id,p_description,
    'UNCHANGED',null,v_prior.linked_module,v_prior.linked_path,
    v_prior.source_kind,v_prior.source_reference,v_prior.source_intake_job_id,
    v_prior.id,'active'
  ) into v_new_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_prior.tenant_id,v_prior.school_id,auth.uid(),'calendar.operational_event.revised',
    'operational_calendar_event',v_new_id,jsonb_build_object('supersedes_event_id',v_prior.id));
  return v_new_id;
end;
$$;

revoke all on function public.revise_operational_calendar_event(uuid,text,text,date,date,time,time,text,uuid,text) from public,anon;
grant execute on function public.revise_operational_calendar_event(uuid,text,text,date,date,time,time,text,uuid,text) to authenticated;

create or replace function public.cancel_operational_calendar_event(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_prior public.operational_calendar_events%rowtype;
  v_new_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_prior from public.effective_operational_calendar_events where id=p_event_id;
  if not found then raise exception 'Calendar event not found or already superseded'; end if;
  if v_prior.learner_calendar_event_id is not null or v_prior.learner_day_effect<>'UNCHANGED' then
    raise exception 'Teaching-impact dates must be cancelled through Official calendar & adjustments';
  end if;

  select public.create_operational_calendar_event(
    v_prior.school_id,v_prior.academic_year,v_prior.scope_kind,v_prior.event_kind,v_prior.title,
    v_prior.starts_on,v_prior.ends_on,v_prior.starts_at,v_prior.ends_at,v_prior.audience_scope,
    v_prior.department_head_staff_assignment_id,v_prior.target_staff_member_id,v_prior.description,
    'UNCHANGED',null,v_prior.linked_module,v_prior.linked_path,
    v_prior.source_kind,v_prior.source_reference,v_prior.source_intake_job_id,
    v_prior.id,'cancelled'
  ) into v_new_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_prior.tenant_id,v_prior.school_id,auth.uid(),'calendar.operational_event.cancelled',
    'operational_calendar_event',v_new_id,jsonb_build_object('supersedes_event_id',v_prior.id));
  return v_new_id;
end;
$$;

revoke all on function public.cancel_operational_calendar_event(uuid) from public,anon;
grant execute on function public.cancel_operational_calendar_event(uuid) to authenticated;

create or replace function public.list_manageable_operational_calendar_events(
  p_school_id uuid,
  p_from date,
  p_to date,
  p_scope_kind text default null
)
returns table(
  event_id uuid,scope_kind text,event_kind text,title text,starts_on date,ends_on date,
  starts_at time,ends_at time,audience_scope text,description text,learner_day_effect text,
  department_head_staff_assignment_id uuid,department_label text,target_staff_member_id uuid,
  learner_calendar_event_id uuid,linked_path text,source_kind text,source_reference text,can_mutate boolean
)
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select e.id,e.scope_kind,e.event_kind,e.title,e.starts_on,e.ends_on,e.starts_at,e.ends_at,
    e.audience_scope,e.description,e.learner_day_effect,e.department_head_staff_assignment_id,
    case when e.scope_kind='department' then coalesce((
      select max(nullif(btrim(sdr.department_label),''))
      from public.subject_department_responsibilities sdr
      where sdr.school_id=e.school_id
        and sdr.department_head_staff_assignment_id=e.department_head_staff_assignment_id
        and sdr.effective_from<=e.ends_on
        and (sdr.effective_to is null or sdr.effective_to>=e.starts_on)
    ),'Department') else null end,
    e.target_staff_member_id,e.learner_calendar_event_id,e.linked_path,e.source_kind,e.source_reference,
    case when e.scope_kind='school'
      then app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
      else app_private.can_manage_department_calendar(p_school_id,e.department_head_staff_assignment_id)
    end
  from public.effective_operational_calendar_events e
  where auth.uid() is not null
    and app_private.user_targets_current_school(auth.uid(),p_school_id)
    and e.school_id=p_school_id
    and e.ends_on>=p_from and e.starts_on<=p_to
    and (p_scope_kind is null or e.scope_kind=p_scope_kind)
    and (
      (e.scope_kind='school' and app_private.has_school_access(p_school_id))
      or (e.scope_kind='department' and app_private.can_manage_department_calendar(p_school_id,e.department_head_staff_assignment_id))
    )
  order by e.starts_on,e.starts_at nulls first,e.title;
$$;

revoke all on function public.list_manageable_operational_calendar_events(uuid,date,date,text) from public,anon;
grant execute on function public.list_manageable_operational_calendar_events(uuid,date,date,text) to authenticated;

comment on function public.correct_operational_term_calendar_source(uuid,text,text) is
'Corrects only term source wording while leaving finalized boundaries, totals and lifecycle status unchanged.';
comment on function public.revise_operational_calendar_event(uuid,text,text,date,date,time,time,text,uuid,text) is
'Creates an append-only informational event revision under existing school/department authority.';
comment on function public.cancel_operational_calendar_event(uuid) is
'Creates a cancelled append-only successor; no operational event history is deleted.';

commit;
