-- Profile corrections have a proposer/reviewer separation. Guardian/counselling scope
-- may propose corrections, but authoritative learner/guardian identity changes require
-- school leadership or Platform Admin review.

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
  if not app_private.has_school_role(v_request.school_id,array['school_admin','principal','deputy_principal'])
     and not app_private.has_platform_role(array['platform_admin']) then
    raise exception 'Permission denied';
  end if;
  if not app_private.profile_change_target_is_valid(v_request.learner_id,v_request.target_type,v_request.target_id) then
    raise exception 'Change-request target is no longer linked to this learner';
  end if;

  if p_decision='approved' then
    if v_request.field_key='initials' then
      v_initials:=nullif(upper(regexp_replace(coalesce(v_request.proposed_value,''),'[^A-Za-z]','','g')),'');
      if v_initials is null or char_length(v_initials)>12 then raise exception 'Stored initials proposal is invalid'; end if;
    end if;
    if v_request.target_type='learner' then
      select case v_request.field_key
        when 'first_names' then first_names when 'initials' then initials when 'surname' then surname
        when 'preferred_name' then preferred_name when 'date_of_birth' then date_of_birth::text
        when 'sex' then sex when 'national_id' then national_id when 'birth_certificate_number' then birth_certificate_number end
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
        updated_at=now()
      where id=v_request.target_id;
    elsif v_request.target_type='guardian' then
      select case v_request.field_key when 'first_names' then first_names when 'initials' then initials when 'surname' then surname when 'preferred_name' then preferred_name end
      into v_current from public.guardian_profiles where id=v_request.target_id for update;
      if v_current is distinct from v_request.current_value then raise exception 'Authoritative value changed after this request was submitted; review again'; end if;
      update public.guardian_profiles set
        first_names=case when v_request.field_key='first_names' then btrim(v_request.proposed_value) else first_names end,
        initials=case when v_request.field_key='initials' then v_initials else initials end,
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

  update public.profile_change_requests set
    status=p_decision,
    reviewed_by_user_id=auth.uid(),
    reviewed_at=now(),
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

comment on function public.review_profile_change_request(uuid,text,text) is
'Authoritative learner/guardian profile correction review. Proposers may have operational guardian/counselling scope; approval/rejection requires school leadership or Platform Admin.';
