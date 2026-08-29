-- Assigned staff may notice stale learner or guardian details, but observation does
-- not grant authority to rewrite identity/contact records. Capture proposed changes
-- and apply only a small, explicit field whitelist after authorized review.

create table if not exists public.profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  target_type text not null check (target_type in ('learner','guardian','guardian_contact')),
  target_id uuid not null,
  field_key text not null,
  current_value text,
  proposed_value text,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  reviewed_by_user_id uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (nullif(btrim(field_key),'') is not null),
  check (proposed_value is distinct from current_value)
);

create index if not exists profile_change_requests_school_status_idx
  on public.profile_change_requests(school_id,status,requested_at desc);
create index if not exists profile_change_requests_learner_idx
  on public.profile_change_requests(learner_id,requested_at desc);

alter table public.profile_change_requests enable row level security;

create policy "requesters and reviewers read profile change requests"
on public.profile_change_requests for select to authenticated
using (
  requested_by_user_id = (select auth.uid())
  or app_private.can_manage_guardians_for_learner(learner_id)
  or app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal'])
  or app_private.has_platform_role(array['platform_admin'])
);

create or replace function app_private.profile_change_target_is_valid(
  p_learner_id uuid,
  p_target_type text,
  p_target_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select case p_target_type
    when 'learner' then p_target_id = p_learner_id
    when 'guardian' then exists(
      select 1 from public.learner_guardians lg
      where lg.learner_id=p_learner_id and lg.guardian_id=p_target_id
        and lg.effective_from<=current_date
        and (lg.effective_to is null or lg.effective_to>=current_date)
    )
    when 'guardian_contact' then exists(
      select 1
      from public.guardian_contacts gc
      join public.learner_guardians lg on lg.guardian_id=gc.guardian_id
      where lg.learner_id=p_learner_id and gc.id=p_target_id
        and lg.effective_from<=current_date
        and (lg.effective_to is null or lg.effective_to>=current_date)
        and gc.effective_from<=current_date
        and (gc.effective_to is null or gc.effective_to>=current_date)
    )
    else false
  end;
$$;

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
     and not app_private.has_platform_role(array['platform_admin']) then
    raise exception 'Permission denied';
  end if;
  if not app_private.profile_change_target_is_valid(p_learner_id,p_target_type,p_target_id) then
    raise exception 'Change-request target is not linked to this learner';
  end if;

  if p_target_type='learner' then
    if p_field_key not in ('first_names','surname','preferred_name','date_of_birth','sex','national_id','birth_certificate_number') then
      raise exception 'Learner field is not eligible for reviewed correction';
    end if;
    select case p_field_key
      when 'first_names' then first_names
      when 'surname' then surname
      when 'preferred_name' then preferred_name
      when 'date_of_birth' then date_of_birth::text
      when 'sex' then sex
      when 'national_id' then national_id
      when 'birth_certificate_number' then birth_certificate_number
    end into v_current from public.learners where id=p_target_id;
  elsif p_target_type='guardian' then
    if p_field_key not in ('first_names','surname','preferred_name') then
      raise exception 'Guardian field is not eligible for reviewed correction';
    end if;
    select case p_field_key
      when 'first_names' then first_names
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

  if nullif(btrim(coalesce(p_proposed_value,'')),'') is null and p_field_key in ('first_names','surname','contact_value') then
    raise exception 'Proposed value cannot be blank';
  end if;
  if p_proposed_value is not distinct from v_current then raise exception 'Proposed value is unchanged'; end if;

  insert into public.profile_change_requests(
    tenant_id,school_id,learner_id,target_type,target_id,field_key,current_value,
    proposed_value,reason,requested_by_user_id
  ) values(
    v_enrolment.tenant_id,v_enrolment.school_id,p_learner_id,p_target_type,p_target_id,
    p_field_key,v_current,p_proposed_value,nullif(btrim(coalesce(p_reason,'')),''),auth.uid()
  ) returning id into v_request_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_enrolment.tenant_id,v_enrolment.school_id,auth.uid(),'profile_change.requested','profile_change_request',v_request_id,
    jsonb_build_object('learner_id',p_learner_id,'target_type',p_target_type,'field_key',p_field_key));

  return v_request_id;
end;
$$;

create or replace function public.review_profile_change_request(
  p_request_id uuid,
  p_decision text,
  p_review_note text default null
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_request public.profile_change_requests%rowtype;
  v_current text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected'; end if;

  select * into v_request from public.profile_change_requests where id=p_request_id for update;
  if not found then raise exception 'Change request not found'; end if;
  if v_request.status<>'pending' then raise exception 'Only pending change requests can be reviewed'; end if;
  if not app_private.can_manage_guardians_for_learner(v_request.learner_id)
     and not app_private.has_school_role(v_request.school_id,array['school_admin','principal','deputy_principal'])
     and not app_private.has_platform_role(array['platform_admin']) then
    raise exception 'Permission denied';
  end if;
  if not app_private.profile_change_target_is_valid(v_request.learner_id,v_request.target_type,v_request.target_id) then
    raise exception 'Change-request target is no longer linked to this learner';
  end if;

  if p_decision='approved' then
    if v_request.target_type='learner' then
      select case v_request.field_key
        when 'first_names' then first_names when 'surname' then surname when 'preferred_name' then preferred_name
        when 'date_of_birth' then date_of_birth::text when 'sex' then sex when 'national_id' then national_id
        when 'birth_certificate_number' then birth_certificate_number
      end into v_current from public.learners where id=v_request.target_id for update;
      if v_current is distinct from v_request.current_value then raise exception 'Authoritative value changed after this request was submitted; review again'; end if;
      update public.learners set
        first_names=case when v_request.field_key='first_names' then btrim(v_request.proposed_value) else first_names end,
        surname=case when v_request.field_key='surname' then btrim(v_request.proposed_value) else surname end,
        preferred_name=case when v_request.field_key='preferred_name' then nullif(btrim(v_request.proposed_value),'') else preferred_name end,
        date_of_birth=case when v_request.field_key='date_of_birth' then nullif(btrim(v_request.proposed_value),'')::date else date_of_birth end,
        sex=case when v_request.field_key='sex' then nullif(btrim(v_request.proposed_value),'') else sex end,
        national_id=case when v_request.field_key='national_id' then nullif(btrim(v_request.proposed_value),'') else national_id end,
        birth_certificate_number=case when v_request.field_key='birth_certificate_number' then nullif(btrim(v_request.proposed_value),'') else birth_certificate_number end,
        updated_at=now()
      where id=v_request.target_id;
    elsif v_request.target_type='guardian' then
      select case v_request.field_key when 'first_names' then first_names when 'surname' then surname when 'preferred_name' then preferred_name end
      into v_current from public.guardian_profiles where id=v_request.target_id for update;
      if v_current is distinct from v_request.current_value then raise exception 'Authoritative value changed after this request was submitted; review again'; end if;
      update public.guardian_profiles set
        first_names=case when v_request.field_key='first_names' then btrim(v_request.proposed_value) else first_names end,
        surname=case when v_request.field_key='surname' then btrim(v_request.proposed_value) else surname end,
        preferred_name=case when v_request.field_key='preferred_name' then nullif(btrim(v_request.proposed_value),'') else preferred_name end,
        updated_at=now()
      where id=v_request.target_id;
    else
      select case v_request.field_key when 'contact_value' then contact_value when 'label' then label end
      into v_current from public.guardian_contacts where id=v_request.target_id for update;
      if v_current is distinct from v_request.current_value then raise exception 'Authoritative value changed after this request was submitted; review again'; end if;
      update public.guardian_contacts set
        contact_value=case when v_request.field_key='contact_value' then btrim(v_request.proposed_value) else contact_value end,
        label=case when v_request.field_key='label' then nullif(btrim(v_request.proposed_value),'') else label end
      where id=v_request.target_id;
    end if;
  end if;

  update public.profile_change_requests
  set status=p_decision,reviewed_by_user_id=auth.uid(),reviewed_at=now(),
      review_note=nullif(btrim(coalesce(p_review_note,'')),''),
      applied_at=case when p_decision='approved' then now() else null end,
      updated_at=now()
  where id=v_request.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_request.tenant_id,v_request.school_id,auth.uid(),'profile_change.'||p_decision,'profile_change_request',v_request.id,
    jsonb_build_object('learner_id',v_request.learner_id,'target_type',v_request.target_type,'field_key',v_request.field_key));

  return true;
end;
$$;

create or replace function public.cancel_profile_change_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare v_request public.profile_change_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_request from public.profile_change_requests where id=p_request_id for update;
  if not found then raise exception 'Change request not found'; end if;
  if v_request.requested_by_user_id<>auth.uid() then raise exception 'Only the requester can cancel this request'; end if;
  if v_request.status<>'pending' then raise exception 'Only pending change requests can be cancelled'; end if;
  update public.profile_change_requests set status='cancelled',updated_at=now() where id=v_request.id;
  return true;
end;
$$;

revoke all on public.profile_change_requests from anon,authenticated;
grant select on public.profile_change_requests to authenticated;
revoke all on function app_private.profile_change_target_is_valid(uuid,text,uuid) from public,anon;
grant execute on function app_private.profile_change_target_is_valid(uuid,text,uuid) to authenticated;
revoke all on function public.submit_profile_change_request(uuid,text,uuid,text,text,text) from public,anon;
grant execute on function public.submit_profile_change_request(uuid,text,uuid,text,text,text) to authenticated;
revoke all on function public.review_profile_change_request(uuid,text,text) from public,anon;
grant execute on function public.review_profile_change_request(uuid,text,text) to authenticated;
revoke all on function public.cancel_profile_change_request(uuid) from public,anon;
grant execute on function public.cancel_profile_change_request(uuid) to authenticated;

comment on table public.profile_change_requests is 'Reviewed correction queue for learner and guardian data. Assigned staff propose; authorized reviewers apply a controlled field whitelist.';