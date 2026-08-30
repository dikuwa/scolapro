-- Close remaining SECURITY DEFINER scope gaps in sensitive school workflows.
-- Keep existing leadership/platform capabilities, while requiring relationship-aware
-- teacher access and governed identity/profile changes.

create or replace function app_private.can_calculate_subject_result(
  p_assessment_scheme_id uuid,
  p_enrolment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select exists(
    select 1
    from public.assessment_schemes s
    join public.enrolments e on e.id=p_enrolment_id
    where s.id=p_assessment_scheme_id
      and e.school_id=s.school_id
      and e.academic_year=s.academic_year
      and (
        app_private.has_platform_role(array['platform_admin'])
        or app_private.has_school_role(s.school_id,array['school_admin','principal','deputy_principal','hod'])
        or exists(
          select 1
          from public.school_memberships sm
          join public.staff_members staff on staff.id=sm.staff_member_id
          join public.teacher_allocations ta
            on ta.staff_member_id=staff.id
           and ta.school_id=s.school_id
           and ta.academic_year=s.academic_year
           and ta.subject_offering_id=s.subject_offering_id
           and ta.register_class_id=e.register_class_id
           and ta.active_from<=current_date
           and (ta.active_to is null or ta.active_to>=current_date)
          where sm.school_id=s.school_id
            and sm.user_id=(select auth.uid())
            and sm.role_key in ('teacher','class_teacher')
            and sm.active_from<=current_date
            and (sm.active_to is null or sm.active_to>=current_date)
            and staff.status='active'
        )
      )
  );
$$;

revoke all on function app_private.can_calculate_subject_result(uuid,uuid) from public,anon;
grant execute on function app_private.can_calculate_subject_result(uuid,uuid) to authenticated;

comment on function app_private.can_calculate_subject_result(uuid,uuid) is
'Teacher/class-teacher subject-result access requires an active teacher allocation for the exact subject offering and learner register class. Leadership and Platform Admin retain governed oversight.';

create or replace function public.calculate_subject_result(
  p_assessment_scheme_id uuid,
  p_enrolment_id uuid,
  p_term_number smallint
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,app_private
as $$
declare
  v_scheme public.assessment_schemes%rowtype;
  v_enrolment public.enrolments%rowtype;
  v_component record;
  v_mark record;
  v_total numeric := 0;
  v_weight_total numeric := 0;
  v_missing jsonb := '[]'::jsonb;
  v_non_numeric jsonb := '[]'::jsonb;
  v_inputs jsonb := '[]'::jsonb;
  v_raw_max numeric;
  v_contribution numeric;
  v_final numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_scheme from public.assessment_schemes where id=p_assessment_scheme_id;
  if not found then raise exception 'Assessment scheme not found'; end if;
  select * into v_enrolment from public.enrolments where id=p_enrolment_id;
  if not found or v_enrolment.school_id<>v_scheme.school_id then
    raise exception 'Enrolment is outside the assessment scheme school';
  end if;
  if not app_private.can_calculate_subject_result(v_scheme.id,v_enrolment.id) then
    raise exception 'Permission denied';
  end if;

  for v_component in
    select ac.*,ai.id as instance_id,ai.raw_max as instance_raw_max
    from public.assessment_components ac
    left join public.assessment_instances ai
      on ai.assessment_component_id=ac.id
     and ai.assessment_scheme_id=v_scheme.id
     and ai.register_class_id=v_enrolment.register_class_id
     and ai.term_number=p_term_number
     and ai.status<>'cancelled'
    where ac.assessment_scheme_id=v_scheme.id
      and ac.contributes_to_report=true
    order by ac.sort_order,ac.component_code
  loop
    if v_component.instance_id is null then
      if v_component.required then
        v_missing:=v_missing||jsonb_build_array(jsonb_build_object('component',v_component.component_code,'reason','assessment_instance_missing'));
      end if;
      continue;
    end if;
    select lm.numeric_mark,lm.mark_status,lm.recorded_at
      into v_mark
    from public.learner_marks_current lm
    where lm.assessment_instance_id=v_component.instance_id
      and lm.enrolment_id=v_enrolment.id;
    if v_mark.numeric_mark is null and v_mark.mark_status is null then
      if v_component.required then
        v_missing:=v_missing||jsonb_build_array(jsonb_build_object('component',v_component.component_code,'reason','mark_missing'));
      end if;
      continue;
    end if;
    if v_mark.mark_status is not null then
      v_non_numeric:=v_non_numeric||jsonb_build_array(jsonb_build_object('component',v_component.component_code,'status',v_mark.mark_status));
      if v_component.required then
        v_missing:=v_missing||jsonb_build_array(jsonb_build_object('component',v_component.component_code,'reason',v_mark.mark_status));
      end if;
      continue;
    end if;
    v_raw_max:=coalesce(v_component.instance_raw_max,v_component.raw_max);
    if v_raw_max is null or v_raw_max<=0 then raise exception 'Contributing component % has no valid raw maximum',v_component.component_code; end if;
    if v_component.weight is null then raise exception 'Contributing component % has no configured weight',v_component.component_code; end if;
    v_contribution:=(v_mark.numeric_mark/v_raw_max)*v_component.weight;
    v_total:=v_total+v_contribution;
    v_weight_total:=v_weight_total+v_component.weight;
    v_inputs:=v_inputs||jsonb_build_array(jsonb_build_object(
      'component',v_component.component_code,
      'assessment_instance_id',v_component.instance_id,
      'raw_mark',v_mark.numeric_mark,
      'raw_max',v_raw_max,
      'weight',v_component.weight,
      'contribution',v_contribution
    ));
  end loop;

  if jsonb_array_length(v_missing)>0 then
    return jsonb_build_object('complete',false,'result_status','incomplete','missing',v_missing,'non_numeric',v_non_numeric,'inputs',v_inputs,'weight_total',v_weight_total);
  end if;
  if v_weight_total<=0 then
    return jsonb_build_object('complete',false,'result_status','incomplete','missing',jsonb_build_array(jsonb_build_object('reason','no_contributing_weight')),'inputs',v_inputs);
  end if;
  v_final:=(v_total/v_weight_total)*100;
  return jsonb_build_object(
    'complete',true,
    'result_value',v_final,
    'weight_total',v_weight_total,
    'inputs',v_inputs,
    'assessment_scheme_key',v_scheme.scheme_key,
    'assessment_scheme_version',v_scheme.version,
    'term_number',p_term_number
  );
end;
$$;

-- Existing guardian identities can be reused, but linking a shared identity to another
-- learner must not silently rewrite the person's authoritative identity attributes.
-- Those corrections already have a reviewed profile-change workflow.
create or replace function public.upsert_guardian_relationship(
  p_learner_id uuid,
  p_guardian_id uuid default null,
  p_first_names text default null,
  p_surname text default null,
  p_preferred_name text default null,
  p_identity_number text default null,
  p_relationship_type text default 'guardian',
  p_is_legal_guardian boolean default false,
  p_is_emergency_contact boolean default false,
  p_is_pickup_authorized boolean default false,
  p_priority smallint default 1,
  p_contacts jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_learner public.learners%rowtype;
  v_guardian public.guardian_profiles%rowtype;
  v_contact jsonb;
  v_type text;
  v_value text;
  v_primary boolean;
  v_same_contact_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_learner from public.learners where id=p_learner_id;
  if not found then raise exception 'Learner not found'; end if;
  if not app_private.can_manage_guardians_for_learner(p_learner_id) then raise exception 'Permission denied'; end if;
  if btrim(coalesce(p_relationship_type,''))='' then raise exception 'Relationship type is required'; end if;
  if p_priority<1 or p_priority>20 then raise exception 'Priority must be between 1 and 20'; end if;
  if jsonb_typeof(coalesce(p_contacts,'[]'::jsonb))<>'array' then raise exception 'Contacts must be an array'; end if;

  if p_guardian_id is null then
    if btrim(coalesce(p_first_names,''))='' or btrim(coalesce(p_surname,''))='' then
      raise exception 'Guardian first names and surname are required';
    end if;
    insert into public.guardian_profiles(tenant_id,first_names,surname,preferred_name,identity_number)
    values(
      v_learner.tenant_id,
      btrim(p_first_names),
      btrim(p_surname),
      nullif(btrim(coalesce(p_preferred_name,'')),''),
      nullif(btrim(coalesce(p_identity_number,'')),'')
    ) returning * into v_guardian;
  else
    select * into v_guardian from public.guardian_profiles where id=p_guardian_id;
    if not found or v_guardian.tenant_id<>v_learner.tenant_id then raise exception 'Guardian not found in learner tenant'; end if;
    if (p_first_names is not null and nullif(btrim(p_first_names),'') is distinct from v_guardian.first_names)
       or (p_surname is not null and nullif(btrim(p_surname),'') is distinct from v_guardian.surname)
       or (p_preferred_name is not null and nullif(btrim(p_preferred_name),'') is distinct from v_guardian.preferred_name)
       or (p_identity_number is not null and nullif(btrim(p_identity_number),'') is distinct from v_guardian.identity_number) then
      raise exception 'Existing guardian identity changes require the reviewed profile-change workflow';
    end if;
  end if;

  insert into public.learner_guardians(
    tenant_id,learner_id,guardian_id,relationship_type,
    is_legal_guardian,is_emergency_contact,is_pickup_authorized,priority
  ) values(
    v_learner.tenant_id,v_learner.id,v_guardian.id,lower(btrim(p_relationship_type)),
    p_is_legal_guardian,p_is_emergency_contact,p_is_pickup_authorized,p_priority
  )
  on conflict (learner_id,guardian_id,relationship_type) where effective_to is null
  do update set
    is_legal_guardian=excluded.is_legal_guardian,
    is_emergency_contact=excluded.is_emergency_contact,
    is_pickup_authorized=excluded.is_pickup_authorized,
    priority=excluded.priority;

  for v_contact in select value from jsonb_array_elements(coalesce(p_contacts,'[]'::jsonb)) loop
    v_type:=lower(btrim(coalesce(v_contact->>'type','')));
    v_value:=btrim(coalesce(v_contact->>'value',''));
    v_primary:=coalesce((v_contact->>'primary')::boolean,false);
    if v_type not in ('email','mobile','phone','whatsapp','address') then raise exception 'Unsupported guardian contact type: %',v_type; end if;
    if v_value='' then continue; end if;
    select gc.id into v_same_contact_id
    from public.guardian_contacts gc
    where gc.guardian_id=v_guardian.id
      and gc.contact_type=v_type
      and lower(btrim(gc.contact_value))=lower(v_value)
      and gc.effective_to is null
    order by gc.effective_from desc,gc.created_at desc
    limit 1;
    if v_same_contact_id is not null then
      if v_primary then
        update public.guardian_contacts
        set is_primary=(id=v_same_contact_id)
        where guardian_id=v_guardian.id
          and contact_type=v_type
          and effective_to is null
          and (is_primary=true or id=v_same_contact_id);
      end if;
      v_same_contact_id:=null;
      continue;
    end if;
    if v_primary then
      update public.guardian_contacts
      set effective_to=greatest(effective_from,current_date-1)
      where guardian_id=v_guardian.id
        and contact_type=v_type
        and is_primary=true
        and effective_to is null;
    end if;
    insert into public.guardian_contacts(tenant_id,guardian_id,contact_type,label,contact_value,is_primary,created_by_user_id)
    values(v_learner.tenant_id,v_guardian.id,v_type,nullif(btrim(coalesce(v_contact->>'label','')),''),v_value,v_primary,auth.uid());
  end loop;

  insert into public.audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_learner.tenant_id,auth.uid(),'guardian.relationship.upserted','learner',v_learner.id,
    jsonb_build_object('guardian_id',v_guardian.id,'relationship_type',lower(btrim(p_relationship_type))));
  return v_guardian.id;
end;
$$;

-- Profile corrections have a proposer/reviewer boundary. Guardian-management scope is
-- sufficient to propose and maintain relationships, but not to approve authoritative
-- learner/guardian identity corrections.
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

-- Detention supervisors are school-scoped operational assignees, not any active staff
-- identity elsewhere in the same tenant.
create or replace function public.create_detention_session(
  p_school_id uuid,
  p_session_date date,
  p_starts_at time default null,
  p_ends_at time default null,
  p_supervisor_staff_member_id uuid default null,
  p_location text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_tenant_id uuid;
  v_session_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal']) then raise exception 'Permission denied'; end if;
  select tenant_id into v_tenant_id from public.schools where id=p_school_id;
  if v_tenant_id is null then raise exception 'School not found'; end if;
  if p_supervisor_staff_member_id is not null and not exists(
    select 1
    from public.staff_members staff
    where staff.id=p_supervisor_staff_member_id
      and staff.tenant_id=v_tenant_id
      and staff.status='active'
      and (
        exists(
          select 1 from public.staff_school_assignments ssa
          where ssa.school_id=p_school_id
            and ssa.staff_member_id=staff.id
            and ssa.effective_from<=p_session_date
            and (ssa.effective_to is null or ssa.effective_to>=p_session_date)
        )
        or exists(
          select 1 from public.school_memberships sm
          where sm.school_id=p_school_id
            and sm.staff_member_id=staff.id
            and sm.active_from<=p_session_date
            and (sm.active_to is null or sm.active_to>=p_session_date)
        )
      )
  ) then
    raise exception 'Detention supervisor is not actively assigned to this school on the session date';
  end if;
  insert into public.detention_sessions(
    tenant_id,school_id,session_date,starts_at,ends_at,supervisor_staff_member_id,location,notes,created_by_user_id
  ) values(
    v_tenant_id,p_school_id,p_session_date,p_starts_at,p_ends_at,p_supervisor_staff_member_id,
    nullif(btrim(p_location),''),nullif(btrim(p_notes),''),auth.uid()
  ) returning id into v_session_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_tenant_id,p_school_id,auth.uid(),'detention.session.created','detention_session',v_session_id,
    jsonb_build_object('session_date',p_session_date,'supervisor_staff_member_id',p_supervisor_staff_member_id));
  return v_session_id;
end;
$$;
