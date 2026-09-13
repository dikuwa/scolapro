-- Assessment/marks are school-operational boundaries. Keep arbitrary-user
-- provenance predicates unchanged; harden only live authenticated authority.

create or replace function app_private.user_has_current_assessment_school_role(
  p_user_id uuid,
  p_school_id uuid,
  p_allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  with platform_flags as (
    select
      exists(
        select 1 from public.platform_memberships pm
        where pm.user_id=p_user_id
          and pm.role_key='platform_admin'
          and pm.active_from<=current_date
          and (pm.active_to is null or pm.active_to>=current_date)
      ) as is_admin,
      exists(
        select 1 from public.platform_memberships pm
        where pm.user_id=p_user_id
          and pm.role_key='platform_support'
          and pm.active_from<=current_date
          and (pm.active_to is null or pm.active_to>=current_date)
      ) as is_support
  ), current_school as (
    select sm.school_id
    from public.school_memberships sm
    where sm.user_id=p_user_id
      and sm.active_from<=current_date
      and (sm.active_to is null or sm.active_to>=current_date)
    order by sm.active_from desc, sm.id asc
    limit 1
  )
  select (select is_admin from platform_flags)
    or (
      not (select is_support from platform_flags)
      and exists(select 1 from current_school cs where cs.school_id=p_school_id)
      and exists(
        select 1
        from public.school_memberships sm
        where sm.user_id=p_user_id
          and sm.school_id=p_school_id
          and sm.role_key=any(p_allowed_roles)
          and sm.active_from<=current_date
          and (sm.active_to is null or sm.active_to>=current_date)
          and (
            sm.staff_member_id is null
            or (
              exists(
                select 1 from public.staff_members staff
                where staff.id=sm.staff_member_id
                  and staff.tenant_id=sm.tenant_id
                  and staff.status='active'
              )
              and app_private.staff_member_covers_school_period(
                sm.staff_member_id,p_school_id,current_date,current_date
              )
            )
          )
      )
    );
$$;

revoke all on function app_private.user_has_current_assessment_school_role(uuid,uuid,text[])
  from public, anon, authenticated;

create or replace function app_private.can_manage_current_assessment_school(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select (select auth.uid()) is not null
    and app_private.user_has_current_assessment_school_role(
      (select auth.uid()),p_school_id,
      array['school_admin','principal','deputy_principal','hod']
    );
$$;

revoke all on function app_private.can_manage_current_assessment_school(uuid) from public, anon;
grant execute on function app_private.can_manage_current_assessment_school(uuid) to authenticated;

create or replace function app_private.can_read_assessment_reference_school(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select (select auth.uid()) is not null
    and app_private.user_has_current_assessment_school_role(
      (select auth.uid()),p_school_id,
      array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']
    );
$$;

revoke all on function app_private.can_read_assessment_reference_school(uuid) from public, anon;
grant execute on function app_private.can_read_assessment_reference_school(uuid) to authenticated;

create or replace function app_private.can_manage_assessment_instance_scope(
  p_school_id uuid,
  p_academic_year integer,
  p_subject_offering_id uuid,
  p_register_class_id uuid,
  p_teacher_allocation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.can_manage_current_assessment_school(p_school_id)
    or (
      (select auth.uid()) is not null
      and not app_private.has_platform_role(array['platform_support'])
      and app_private.is_current_school(p_school_id)
      and exists(
        select 1
        from public.school_memberships sm
        join public.staff_members staff
          on staff.id=sm.staff_member_id
         and staff.tenant_id=sm.tenant_id
         and staff.status='active'
        join public.teacher_allocations ta
          on ta.id=p_teacher_allocation_id
         and ta.staff_member_id=staff.id
         and ta.tenant_id=sm.tenant_id
         and ta.school_id=p_school_id
         and ta.academic_year=p_academic_year
         and ta.subject_offering_id=p_subject_offering_id
         and ta.register_class_id=p_register_class_id
         and ta.active_from<=current_date
         and (ta.active_to is null or ta.active_to>=current_date)
        where sm.user_id=(select auth.uid())
          and sm.school_id=p_school_id
          and sm.role_key in ('teacher','class_teacher')
          and sm.active_from<=current_date
          and (sm.active_to is null or sm.active_to>=current_date)
          and app_private.staff_member_covers_school_period(
            staff.id,p_school_id,current_date,current_date
          )
      )
    );
$$;

revoke all on function app_private.can_manage_assessment_instance_scope(uuid,integer,uuid,uuid,uuid)
  from public, anon;
grant execute on function app_private.can_manage_assessment_instance_scope(uuid,integer,uuid,uuid,uuid)
  to authenticated;

create or replace function app_private.can_access_assessment_instance(target_instance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists(
    select 1 from public.assessment_instances ai
    where ai.id=target_instance_id
      and app_private.can_manage_assessment_instance_scope(
        ai.school_id,ai.academic_year,ai.subject_offering_id,
        ai.register_class_id,ai.teacher_allocation_id
      )
  );
$$;

revoke all on function app_private.can_access_assessment_instance(uuid) from public, anon;
grant execute on function app_private.can_access_assessment_instance(uuid) to authenticated;

create or replace function app_private.can_read_official_result(
  p_school_id uuid,
  p_enrolment_id uuid,
  p_subject_offering_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.can_manage_current_assessment_school(p_school_id)
    or (
      (select auth.uid()) is not null
      and not app_private.has_platform_role(array['platform_support'])
      and app_private.is_current_school(p_school_id)
      and exists(
        select 1
        from public.enrolments e
        join public.school_memberships sm
          on sm.school_id=e.school_id and sm.tenant_id=e.tenant_id
        join public.staff_members staff
          on staff.id=sm.staff_member_id
         and staff.tenant_id=sm.tenant_id
         and staff.status='active'
        join public.teacher_allocations ta
          on ta.staff_member_id=staff.id
         and ta.tenant_id=e.tenant_id
         and ta.school_id=e.school_id
         and ta.academic_year=e.academic_year
         and ta.register_class_id=e.register_class_id
         and ta.subject_offering_id=p_subject_offering_id
         and ta.active_from<=current_date
         and (ta.active_to is null or ta.active_to>=current_date)
        where e.id=p_enrolment_id
          and e.school_id=p_school_id
          and sm.user_id=(select auth.uid())
          and sm.role_key in ('teacher','class_teacher')
          and sm.active_from<=current_date
          and (sm.active_to is null or sm.active_to>=current_date)
          and app_private.staff_member_covers_school_period(
            staff.id,p_school_id,current_date,current_date
          )
      )
    );
$$;

revoke all on function app_private.can_read_official_result(uuid,uuid,uuid) from public, anon;
grant execute on function app_private.can_read_official_result(uuid,uuid,uuid) to authenticated;

-- Existing reference configuration remains school-wide to academic staff/leadership,
-- but only inside current operational authority.
drop policy if exists "academic staff can read assessment schemes" on public.assessment_schemes;
create policy "academic staff can read assessment schemes"
on public.assessment_schemes for select to authenticated
using (app_private.can_read_assessment_reference_school(school_id));

drop policy if exists "academic leaders can manage assessment schemes" on public.assessment_schemes;
create policy "academic leaders can manage assessment schemes"
on public.assessment_schemes for all to authenticated
using (app_private.can_manage_current_assessment_school(school_id))
with check (app_private.can_manage_current_assessment_school(school_id));

drop policy if exists "academic leaders can manage assessment schemes [insert]" on public.assessment_schemes;
create policy "academic leaders can manage assessment schemes [insert]"
on public.assessment_schemes for insert to authenticated
with check (
  created_by_user_id=(select auth.uid())
  and app_private.can_manage_current_assessment_school(school_id)
);

drop policy if exists "academic staff can read assessment components" on public.assessment_components;
create policy "academic staff can read assessment components"
on public.assessment_components for select to authenticated
using (app_private.can_read_assessment_reference_school(school_id));

drop policy if exists "academic leaders can manage assessment components" on public.assessment_components;
create policy "academic leaders can manage assessment components"
on public.assessment_components for all to authenticated
using (app_private.can_manage_current_assessment_school(school_id))
with check (app_private.can_manage_current_assessment_school(school_id));

-- SECURITY DEFINER review must not bypass current leadership authority.
create or replace function public.review_mark_submission(
  p_submission_id uuid,
  p_decision text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.mark_submissions%rowtype;
  v_instance public.assessment_instances%rowtype;
  v_new_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_decision not in ('return','verify') then raise exception 'Decision must be return or verify'; end if;
  select * into v_submission from public.mark_submissions where id=p_submission_id for update;
  if not found then raise exception 'Mark submission not found'; end if;
  select * into v_instance from public.assessment_instances where id=v_submission.assessment_instance_id for update;
  if not app_private.can_manage_current_assessment_school(v_instance.school_id) then raise exception 'Permission denied'; end if;
  if v_submission.status<>'submitted' then raise exception 'Submission has already been reviewed'; end if;
  if p_decision='return' and nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'A return reason is required'; end if;

  v_new_status := case when p_decision='verify' then 'verified' else 'returned' end;
  update public.mark_submissions
  set status=v_new_status,reviewed_by_user_id=auth.uid(),reviewed_at=now(),
      review_note=nullif(btrim(coalesce(p_note,'')),'')
  where id=v_submission.id;
  update public.assessment_instances
  set status=case when p_decision='verify' then 'verified' else 'returned' end,updated_at=now()
  where id=v_instance.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_instance.tenant_id,v_instance.school_id,auth.uid(),'assessment.reviewed','assessment_instance',v_instance.id,
    jsonb_build_object('submission_id',v_submission.id,'decision',p_decision,'note',nullif(btrim(coalesce(p_note,'')),'')));
  return true;
end;
$$;

-- Direct calculation is a learner-mark read surface. Use the same current
-- learner-specific leadership/teacher relationship as official-result reads.
create or replace function public.calculate_subject_result(
  p_assessment_scheme_id uuid,
  p_enrolment_id uuid,
  p_term_number smallint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
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
  if not found or v_enrolment.school_id<>v_scheme.school_id then raise exception 'Enrolment is outside the assessment scheme school'; end if;
  if not app_private.can_read_official_result(v_scheme.school_id,v_enrolment.id,v_scheme.subject_offering_id) then raise exception 'Permission denied'; end if;

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
      if v_component.required then v_missing:=v_missing||jsonb_build_array(jsonb_build_object('component',v_component.component_code,'reason','assessment_instance_missing')); end if;
      continue;
    end if;
    select lm.numeric_mark,lm.mark_status,lm.recorded_at into v_mark
    from public.learner_marks_current lm
    where lm.assessment_instance_id=v_component.instance_id and lm.enrolment_id=v_enrolment.id;
    if v_mark.numeric_mark is null and v_mark.mark_status is null then
      if v_component.required then v_missing:=v_missing||jsonb_build_array(jsonb_build_object('component',v_component.component_code,'reason','mark_missing')); end if;
      continue;
    end if;
    if v_mark.mark_status is not null then
      v_non_numeric:=v_non_numeric||jsonb_build_array(jsonb_build_object('component',v_component.component_code,'status',v_mark.mark_status));
      if v_component.required then v_missing:=v_missing||jsonb_build_array(jsonb_build_object('component',v_component.component_code,'reason',v_mark.mark_status)); end if;
      continue;
    end if;
    v_raw_max:=coalesce(v_component.instance_raw_max,v_component.raw_max);
    if v_raw_max is null or v_raw_max<=0 then raise exception 'Contributing component % has no valid raw maximum',v_component.component_code; end if;
    if v_component.weight is null then raise exception 'Contributing component % has no configured weight',v_component.component_code; end if;
    v_contribution:=(v_mark.numeric_mark/v_raw_max)*v_component.weight;
    v_total:=v_total+v_contribution;
    v_weight_total:=v_weight_total+v_component.weight;
    v_inputs:=v_inputs||jsonb_build_array(jsonb_build_object(
      'component',v_component.component_code,'assessment_instance_id',v_component.instance_id,
      'raw_mark',v_mark.numeric_mark,'raw_max',v_raw_max,'weight',v_component.weight,'contribution',v_contribution));
  end loop;
  if jsonb_array_length(v_missing)>0 then
    return jsonb_build_object('complete',false,'result_status','incomplete','missing',v_missing,'non_numeric',v_non_numeric,'inputs',v_inputs,'weight_total',v_weight_total);
  end if;
  if v_weight_total<=0 then
    return jsonb_build_object('complete',false,'result_status','incomplete','missing',jsonb_build_array(jsonb_build_object('reason','no_contributing_weight')),'inputs',v_inputs);
  end if;
  v_final:=(v_total/v_weight_total)*100;
  return jsonb_build_object('complete',true,'result_value',v_final,'weight_total',v_weight_total,'inputs',v_inputs,
    'assessment_scheme_key',v_scheme.scheme_key,'assessment_scheme_version',v_scheme.version,'term_number',p_term_number);
end;
$$;

-- Keep arbitrary-user approver provenance validation intact for historical/trusted
-- rows, while authenticated approvals must also hold current operational leadership.
create or replace function app_private.enforce_official_result_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_school_tenant uuid;
  v_enrolment record;
  v_offering record;
begin
  if tg_op='DELETE' then raise exception 'Official result cannot be deleted; use governed correction workflow'; end if;
  select tenant_id into v_school_tenant from public.schools where id=new.school_id;
  if v_school_tenant is null or new.tenant_id is distinct from v_school_tenant then raise exception 'Official result scope mismatch: school does not belong to tenant'; end if;
  select tenant_id,school_id,academic_year,learner_id into v_enrolment from public.enrolments where id=new.enrolment_id;
  if not found or (new.tenant_id,new.school_id,new.academic_year,new.learner_id) is distinct from (v_enrolment.tenant_id,v_enrolment.school_id,v_enrolment.academic_year,v_enrolment.learner_id) then raise exception 'Official result scope mismatch: enrolment identity differs'; end if;
  select tenant_id,school_id,academic_year into v_offering from public.subject_offerings where id=new.subject_offering_id;
  if not found or (new.tenant_id,new.school_id,new.academic_year) is distinct from (v_offering.tenant_id,v_offering.school_id,v_offering.academic_year) then raise exception 'Official result scope mismatch: subject offering differs'; end if;

  if tg_op='INSERT' then
    if auth.uid() is not null and new.approved_by_user_id is distinct from auth.uid() then raise exception 'Official result approver must match authenticated actor'; end if;
    if auth.uid() is not null and not app_private.can_manage_current_assessment_school(new.school_id) then raise exception 'Official result approver is not currently authorized for school'; end if;
    if not app_private.user_is_academic_leader(new.approved_by_user_id,new.school_id) then raise exception 'Official result approver is not authorized for school'; end if;
    return new;
  end if;

  if new.tenant_id is distinct from old.tenant_id
     or new.school_id is distinct from old.school_id
     or new.academic_year is distinct from old.academic_year
     or new.enrolment_id is distinct from old.enrolment_id
     or new.learner_id is distinct from old.learner_id
     or new.subject_offering_id is distinct from old.subject_offering_id
     or new.term_number is distinct from old.term_number
     or new.result_value is distinct from old.result_value
     or new.result_status is distinct from old.result_status
     or new.symbol is distinct from old.symbol
     or new.assessment_scheme_key is distinct from old.assessment_scheme_key
     or new.assessment_scheme_version is distinct from old.assessment_scheme_version
     or new.academic_rule_set_key is distinct from old.academic_rule_set_key
     or new.academic_rule_set_version is distinct from old.academic_rule_set_version
     or new.calculation_snapshot is distinct from old.calculation_snapshot
     or new.approved_by_user_id is distinct from old.approved_by_user_id
     or new.approved_at is distinct from old.approved_at
     or new.locked_at is distinct from old.locked_at
     or new.grading_scale_key is distinct from old.grading_scale_key
     or new.grading_scale_version is distinct from old.grading_scale_version
     or new.created_at is distinct from old.created_at then
    raise exception 'Official result calculation and approval provenance are immutable';
  end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_official_result_integrity() from public,anon,authenticated;

comment on function app_private.can_manage_current_assessment_school(uuid) is
'Live assessment leadership authority bound to deterministic current school, effective linked placement, and explicit Platform Support separation; Platform Admin override preserved.';
comment on function app_private.can_manage_assessment_instance_scope(uuid,integer,uuid,uuid,uuid) is
'Live marks/assessment scope: current-school leadership or effective teacher/class-teacher with exact current subject/class allocation and authoritative staff placement.';
