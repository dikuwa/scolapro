-- Bind operational profile-change review to the deterministic current school and
-- enforce proposer/reviewer separation without changing the existing correction workflow.

create or replace function app_private.user_can_review_profile_change_request(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
      select 1
      from public.platform_memberships pm
      where pm.user_id=p_user_id
        and pm.role_key='platform_admin'
        and pm.active_from<=current_date
        and (pm.active_to is null or pm.active_to>=current_date)
    )
    or p_school_id = (
      select sm.school_id
      from public.school_memberships sm
      where sm.user_id=p_user_id
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
      order by sm.active_from desc, sm.id asc
      limit 1
    )
    and exists (
      select 1
      from public.school_memberships sm
      where sm.school_id=p_school_id
        and sm.user_id=p_user_id
        and sm.role_key in ('school_admin','principal','deputy_principal')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    );
$$;

revoke all on function app_private.user_can_review_profile_change_request(uuid,uuid)
from public, anon, authenticated;

comment on function app_private.user_can_review_profile_change_request(uuid,uuid) is
'Profile-correction review authority: active Platform Admin, or school leadership only in the actor deterministic current school. Platform Support is excluded.';

create or replace function app_private.enforce_profile_change_request_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op='INSERT' then
    if not exists (
      select 1 from public.enrolments e
      where e.school_id=new.school_id and e.learner_id=new.learner_id
        and e.status='current'
        and (e.enrolled_to is null or e.enrolled_to>=current_date)
    ) then raise exception 'Profile change request learner is not currently enrolled at request school'; end if;
    if new.status<>'pending' or new.reviewed_by_user_id is not null or new.reviewed_at is not null
       or new.review_note is not null or new.applied_at is not null then
      raise exception 'Profile change requests must be created pending without review provenance';
    end if;
    if auth.uid() is not null and new.requested_by_user_id is distinct from auth.uid() then
      raise exception 'Profile change requester must match authenticated actor';
    end if;
    if not app_private.user_can_submit_profile_change_request(new.requested_by_user_id,new.school_id,new.learner_id) then
      raise exception 'Profile change requester is not authorized for learner';
    end if;
    return new;
  end if;

  if old.status in ('approved','rejected','cancelled') then
    if new.status is distinct from old.status or new.reviewed_by_user_id is distinct from old.reviewed_by_user_id
       or new.reviewed_at is distinct from old.reviewed_at or new.review_note is distinct from old.review_note
       or new.applied_at is distinct from old.applied_at then
      raise exception 'Final profile change request lifecycle provenance is immutable';
    end if;
    return new;
  end if;

  if new.status='pending' then
    if new.reviewed_by_user_id is not null or new.reviewed_at is not null or new.review_note is not null or new.applied_at is not null then
      raise exception 'Pending profile change request cannot carry review provenance';
    end if;
    return new;
  end if;

  if new.status='cancelled' then
    if new.reviewed_by_user_id is not null or new.reviewed_at is not null or new.review_note is not null or new.applied_at is not null then
      raise exception 'Cancelled profile change request cannot carry review provenance';
    end if;
    if auth.uid() is null or auth.uid() is distinct from old.requested_by_user_id then
      raise exception 'Only the authenticated requester can cancel a profile change request';
    end if;
    return new;
  end if;

  if new.status not in ('approved','rejected') then raise exception 'Invalid profile change request lifecycle transition'; end if;
  if new.reviewed_by_user_id is null or new.reviewed_at is null then raise exception 'Reviewed profile change request requires reviewer provenance'; end if;
  if new.reviewed_by_user_id = old.requested_by_user_id then raise exception 'Profile change requester cannot review own request'; end if;
  if new.status='approved' and new.applied_at is null then raise exception 'Approved profile change request requires applied timestamp'; end if;
  if new.status='rejected' and new.applied_at is not null then raise exception 'Rejected profile change request cannot carry applied timestamp'; end if;
  if auth.uid() is not null and new.reviewed_by_user_id is distinct from auth.uid() then
    raise exception 'Profile change reviewer must match authenticated actor';
  end if;
  if not app_private.user_can_review_profile_change_request(new.reviewed_by_user_id,new.school_id) then
    raise exception 'Profile change reviewer is not authorized for school';
  end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_profile_change_request_actor_integrity() from public, anon, authenticated;

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
  v_initials text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected'; end if;
  select * into v_request from public.profile_change_requests where id=p_request_id for update;
  if not found then raise exception 'Change request not found'; end if;
  if v_request.status<>'pending' then raise exception 'Only pending change requests can be reviewed'; end if;
  if v_request.requested_by_user_id=auth.uid() then raise exception 'Profile change requester cannot review own request'; end if;
  if not app_private.user_can_review_profile_change_request(auth.uid(),v_request.school_id) then raise exception 'Permission denied'; end if;
  if not app_private.profile_change_target_is_valid(v_request.learner_id,v_request.target_type,v_request.target_id) then
    raise exception 'Change-request target is no longer linked to this learner';
  end if;

  if p_decision='approved' then
    if v_request.field_key='initials' then
      v_initials:=nullif(upper(regexp_replace(coalesce(v_request.proposed_value,''),'[^A-Za-z]','','g')),'');
      if v_initials is null or char_length(v_initials)>12 then raise exception 'Stored initials proposal is invalid'; end if;
    end if;
    if v_request.target_type='learner' then
      select case v_request.field_key when 'first_names' then first_names when 'initials' then initials when 'surname' then surname
        when 'preferred_name' then preferred_name when 'date_of_birth' then date_of_birth::text when 'sex' then sex
        when 'national_id' then national_id when 'birth_certificate_number' then birth_certificate_number end
      into v_current from public.learners where id=v_request.target_id for update;
      if v_current is distinct from v_request.current_value then raise exception 'Authoritative value changed after this request was submitted; review again'; end if;
      update public.learners set
        first_names=case when v_request.field_key='first_names' then btrim(v_request.proposed_value) else first_names end,
        initials=case when v_request.field_key='initials' then v_initials else initials end,
        surname=case when v_request.field_key='surname' then btrim(v_request.proposed_value) else surname end,
        preferred_name=case when v_request.field_key='preferred_name' then nullif(btrim(v_request.proposed_value),'') else preferred_name end,
        date_of_birth=case when v_request.field_key='date_of_birth' then nullif(btrim(v_request.proposed_value),'')::date else date_of_birth end,
        sex=case when v_request.field_key='sex' then nullif(btrim(v_request.proposed_value),'') else sex end,
        national_id=case when v_request.field_key='national_id' then nullif(btrim(v_request.proposed_value),'') else national_id end,
        birth_certificate_number=case when v_request.field_key='birth_certificate_number' then nullif(btrim(v_request.proposed_value),'') else birth_certificate_number end,
        updated_at=now() where id=v_request.target_id;
    elsif v_request.target_type='guardian' then
      select case v_request.field_key when 'first_names' then first_names when 'initials' then initials when 'surname' then surname when 'preferred_name' then preferred_name end
      into v_current from public.guardian_profiles where id=v_request.target_id for update;
      if v_current is distinct from v_request.current_value then raise exception 'Authoritative value changed after this request was submitted; review again'; end if;
      update public.guardian_profiles set
        first_names=case when v_request.field_key='first_names' then btrim(v_request.proposed_value) else first_names end,
        initials=case when v_request.field_key='initials' then v_initials else initials end,
        surname=case when v_request.field_key='surname' then btrim(v_request.proposed_value) else surname end,
        preferred_name=case when v_request.field_key='preferred_name' then nullif(btrim(v_request.proposed_value),'') else preferred_name end,
        updated_at=now() where id=v_request.target_id;
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

  update public.profile_change_requests set status=p_decision,reviewed_by_user_id=auth.uid(),reviewed_at=now(),
    review_note=nullif(btrim(coalesce(p_review_note,'')),''),applied_at=case when p_decision='approved' then now() else null end,updated_at=now()
  where id=v_request.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_request.tenant_id,v_request.school_id,auth.uid(),'profile_change.'||p_decision,'profile_change_request',v_request.id,
    jsonb_build_object('learner_id',v_request.learner_id,'target_type',v_request.target_type,'field_key',v_request.field_key));
  return true;
end;
$$;

comment on function public.review_profile_change_request(uuid,text,text) is
'Authoritative reviewed identity correction. Requires a distinct reviewer and, for school leadership, the request school must be the reviewer deterministic current school; Platform Support has no operational authority.';
