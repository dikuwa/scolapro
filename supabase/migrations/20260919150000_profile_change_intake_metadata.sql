-- Issue #566: add source/evidence metadata to the canonical reviewed
-- profile-change workflow. No second correction system is introduced.

alter table public.profile_change_requests
  add column if not exists source_category text not null default 'teacher_observation',
  add column if not exists evidence_reference text;

alter table public.profile_change_requests
  drop constraint if exists profile_change_requests_source_category_check;

alter table public.profile_change_requests
  add constraint profile_change_requests_source_category_check
  check (source_category in (
    'parent_guardian_report','learner_report','teacher_observation',
    'admin_detected_error','verified_document','other'
  ));

create or replace function app_private.is_current_guardian_user_for_learner(
  p_user_id uuid,
  p_school_id uuid,
  p_learner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists (
    select 1
    from public.learner_guardians lg
    join public.guardian_user_links gul on gul.guardian_id=lg.guardian_id
    join public.guardian_profiles gp on gp.id=lg.guardian_id
    join public.enrolments e on e.learner_id=lg.learner_id
    where gul.user_id=p_user_id
      and lg.learner_id=p_learner_id
      and e.school_id=p_school_id
      and gp.status='active'
      and lg.effective_from<=current_date
      and (lg.effective_to is null or lg.effective_to>=current_date)
      and e.status='current'
      and e.enrolled_from<=current_date
      and (e.enrolled_to is null or e.enrolled_to>=current_date)
  );
$$;

revoke all on function app_private.is_current_guardian_user_for_learner(uuid,uuid,uuid)
from public,anon,authenticated;

create or replace function app_private.user_can_submit_profile_change_request(
  p_user_id uuid,
  p_school_id uuid,
  p_learner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.is_current_guardian_user_for_learner(p_user_id,p_school_id,p_learner_id)
    or exists (
      select 1 from public.platform_memberships pm
      where pm.user_id=p_user_id and pm.role_key='platform_admin'
        and pm.active_from<=current_date and (pm.active_to is null or pm.active_to>=current_date)
    )
    or exists (
      select 1
      from public.enrolments e
      join public.school_memberships sm on sm.school_id=e.school_id
        and sm.user_id=p_user_id
        and sm.role_key in ('school_admin','principal','deputy_principal','counsellor','class_teacher')
        and sm.active_from<=current_date and (sm.active_to is null or sm.active_to>=current_date)
      where e.school_id=p_school_id and e.learner_id=p_learner_id
        and e.status='current' and e.enrolled_from<=current_date
        and (e.enrolled_to is null or e.enrolled_to>=current_date)
    )
    or exists (
      select 1
      from public.enrolments e
      join public.teacher_allocations ta on ta.school_id=e.school_id
        and ta.register_class_id=e.register_class_id
        and ta.academic_year=e.academic_year
        and ta.active_from<=current_date and (ta.active_to is null or ta.active_to>=current_date)
      join public.staff_members teacher_staff on teacher_staff.id=ta.staff_member_id
        and teacher_staff.user_id=p_user_id and teacher_staff.status='active'
      where e.school_id=p_school_id and e.learner_id=p_learner_id
        and e.status='current' and e.enrolled_from<=current_date
        and (e.enrolled_to is null or e.enrolled_to>=current_date)
    );
$$;

revoke all on function app_private.user_can_submit_profile_change_request(uuid,uuid,uuid)
from public,anon,authenticated;

create or replace function public.submit_profile_change_request(
  p_learner_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_field_key text,
  p_proposed_value text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_enrolment public.enrolments%rowtype;
  v_current text;
  v_request_id uuid;
  v_proposed text:=p_proposed_value;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_target_type not in ('learner','guardian','guardian_contact') then raise exception 'Unsupported change-request target'; end if;

  select * into v_enrolment
  from public.enrolments
  where learner_id=p_learner_id and status='current'
    and (enrolled_to is null or enrolled_to>=current_date)
  order by academic_year desc limit 1;
  if not found then raise exception 'Learner has no current enrolment'; end if;

  if not app_private.can_access_learner_observations(v_enrolment.school_id,p_learner_id)
     and not app_private.can_manage_guardians_for_learner(p_learner_id)
     and not app_private.is_current_guardian_user_for_learner(auth.uid(),v_enrolment.school_id,p_learner_id)
     and not app_private.has_platform_role(array['platform_admin']) then
    raise exception 'Permission denied';
  end if;
  if not app_private.profile_change_target_is_valid(p_learner_id,p_target_type,p_target_id) then
    raise exception 'Change-request target is not linked to this learner';
  end if;

  if p_field_key='initials' then
    v_proposed:=nullif(upper(regexp_replace(coalesce(p_proposed_value,''),'[^A-Za-z]','','g')),'');
    if v_proposed is null then raise exception 'Initials must contain at least one letter'; end if;
    if char_length(v_proposed)>12 then raise exception 'Initials cannot exceed 12 letters'; end if;
  end if;

  if p_target_type='learner' then
    if p_field_key not in ('first_names','initials','surname','preferred_name','date_of_birth','sex','national_id','birth_certificate_number') then
      raise exception 'Learner field is not eligible for reviewed correction';
    end if;
    select case p_field_key
      when 'first_names' then first_names
      when 'initials' then initials
      when 'surname' then surname
      when 'preferred_name' then preferred_name
      when 'date_of_birth' then date_of_birth::text
      when 'sex' then sex
      when 'national_id' then national_id
      when 'birth_certificate_number' then birth_certificate_number
    end into v_current from public.learners where id=p_target_id;
  elsif p_target_type='guardian' then
    if p_field_key not in ('first_names','initials','surname','preferred_name') then
      raise exception 'Guardian field is not eligible for reviewed correction';
    end if;
    select case p_field_key
      when 'first_names' then first_names
      when 'initials' then initials
      when 'surname' then surname
      when 'preferred_name' then preferred_name
    end into v_current from public.guardian_profiles where id=p_target_id;
  else
    if p_field_key not in ('contact_value','label') then
      raise exception 'Guardian contact field is not eligible for reviewed correction';
    end if;
    select case p_field_key when 'contact_value' then contact_value when 'label' then label end
    into v_current from public.guardian_contacts where id=p_target_id;
  end if;

  if nullif(btrim(coalesce(v_proposed,'')),'') is null and p_field_key in ('first_names','surname','contact_value','initials') then
    raise exception 'Proposed value cannot be blank';
  end if;
  if v_proposed is not distinct from v_current then raise exception 'Proposed value is unchanged'; end if;

  insert into public.profile_change_requests(
    tenant_id,school_id,learner_id,target_type,target_id,field_key,current_value,
    proposed_value,reason,requested_by_user_id
  ) values(
    v_enrolment.tenant_id,v_enrolment.school_id,p_learner_id,p_target_type,p_target_id,
    p_field_key,v_current,v_proposed,nullif(btrim(coalesce(p_reason,'')),''),auth.uid()
  ) returning id into v_request_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_enrolment.tenant_id,v_enrolment.school_id,auth.uid(),'profile_change.requested','profile_change_request',v_request_id,
    jsonb_build_object('learner_id',p_learner_id,'target_type',p_target_type,'field_key',p_field_key));

  return v_request_id;
end;
$$;


create or replace function public.submit_profile_change_request(
  p_learner_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_field_key text,
  p_proposed_value text,
  p_reason text,
  p_source_category text,
  p_evidence_reference text
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_request_id uuid;
begin
  if p_source_category not in (
    'parent_guardian_report','learner_report','teacher_observation',
    'admin_detected_error','verified_document','other'
  ) then raise exception 'Unsupported correction source category'; end if;

  v_request_id := public.submit_profile_change_request(
    p_learner_id,p_target_type,p_target_id,p_field_key,p_proposed_value,p_reason
  );

  update public.profile_change_requests
  set source_category=p_source_category,
      evidence_reference=nullif(btrim(coalesce(p_evidence_reference,'')),'')
  where id=v_request_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  select tenant_id,school_id,auth.uid(),'profile_change.source_recorded','profile_change_request',id,
    jsonb_build_object('source_category',source_category,'evidence_reference',evidence_reference)
  from public.profile_change_requests
  where id=v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.submit_profile_change_request(uuid,text,uuid,text,text,text,text,text)
from public,anon;
grant execute on function public.submit_profile_change_request(uuid,text,uuid,text,text,text,text,text)
to authenticated;

comment on column public.profile_change_requests.source_category is
'How the correction was reported; evidence requirements remain policy/configuration driven.';
comment on column public.profile_change_requests.evidence_reference is
'Optional human-readable evidence or reference pointer; governed file storage remains separate.';
