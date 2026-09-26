-- Issue #685: high-speed mark-grid and offline replay hardening.
-- Keeps learner_marks append-only and preserves the existing offline queue/RPC.

-- HOD assessment access follows the same effective subject-portfolio model as
-- teaching oversight; HOD role alone is not school-wide marks authority.
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
as $
  select (
    app_private.has_platform_role(array['platform_admin'])
    or (
      app_private.user_current_school_matches((select auth.uid()),p_school_id)
      and not app_private.has_platform_role(array['platform_support'])
      and (
        app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
        or exists(
          select 1
          from public.subject_offerings so
          where so.id=p_subject_offering_id
            and so.school_id=p_school_id
            and app_private.hod_responsible_for_subject(p_school_id,so.subject_id)
        )
        or exists(
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
            and sm.role_key in ('teacher','class_teacher','hod')
            and sm.active_from<=current_date
            and (sm.active_to is null or sm.active_to>=current_date)
            and app_private.staff_member_covers_school_period(
              staff.id,p_school_id,current_date,current_date
            )
        )
      )
    )
  );
$;

revoke all on function app_private.can_manage_assessment_instance_scope(uuid,integer,uuid,uuid,uuid)
from public,anon;
grant execute on function app_private.can_manage_assessment_instance_scope(uuid,integer,uuid,uuid,uuid)
to authenticated;

create or replace function public.review_mark_submission(
  p_submission_id uuid,
  p_decision text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, app_private
as $
declare
  v_submission public.mark_submissions%rowtype;
  v_instance public.assessment_instances%rowtype;
  v_subject_id uuid;
  v_authorized boolean:=false;
  v_new_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_decision not in ('return','verify') then raise exception 'Decision must be return or verify'; end if;

  select * into v_submission from public.mark_submissions where id=p_submission_id for update;
  if not found then raise exception 'Mark submission not found'; end if;
  select * into v_instance from public.assessment_instances where id=v_submission.assessment_instance_id for update;

  select so.subject_id into v_subject_id from public.subject_offerings so where so.id=v_instance.subject_offering_id;
  v_authorized :=
    app_private.has_platform_role(array['platform_admin'])
    or (
      app_private.user_current_school_matches((select auth.uid()),v_instance.school_id)
      and not app_private.has_platform_role(array['platform_support'])
      and (
        app_private.has_school_role(v_instance.school_id,array['school_admin','principal','deputy_principal'])
        or app_private.hod_responsible_for_subject(v_instance.school_id,v_subject_id)
      )
    );
  if not v_authorized then raise exception 'Permission denied'; end if;
  if v_submission.status<>'submitted' then raise exception 'Submission has already been reviewed'; end if;
  if p_decision='return' and nullif(btrim(coalesce(p_note,'')),'') is null then
    raise exception 'A return reason is required';
  end if;

  v_new_status:=case when p_decision='verify' then 'verified' else 'returned' end;
  update public.mark_submissions
     set status=v_new_status,reviewed_by_user_id=auth.uid(),reviewed_at=now(),
         review_note=nullif(btrim(coalesce(p_note,'')),'')
   where id=v_submission.id;
  update public.assessment_instances
     set status=case when p_decision='verify' then 'verified' else 'returned' end,
         updated_at=now()
   where id=v_instance.id;
  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_instance.tenant_id,v_instance.school_id,auth.uid(),'assessment.reviewed',
    'assessment_instance',v_instance.id,
    jsonb_build_object(
      'submission_id',v_submission.id,'decision',p_decision,
      'note',nullif(btrim(coalesce(p_note,'')),'')
    )
  );
  return true;
end;
$;


create or replace function public.submit_offline_assessment_mark(
  p_assessment_instance_id uuid,
  p_enrolment_id uuid,
  p_learner_id uuid,
  p_numeric_mark numeric default null,
  p_mark_status text default null,
  p_teacher_note text default null,
  p_expected_version uuid default null,
  p_client_mutation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_instance public.assessment_instances%rowtype;
  v_enrolment public.enrolments%rowtype;
  v_current public.learner_marks%rowtype;
  v_existing public.learner_marks%rowtype;
  v_new_id uuid;
  v_max numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_client_mutation_id is null then
    return jsonb_build_object('outcome','rejected','code','client_mutation_id_required');
  end if;

  select * into v_instance
  from public.assessment_instances
  where id=p_assessment_instance_id
  for update;
  if not found then return jsonb_build_object('outcome','rejected','code','assessment_not_found'); end if;
  if not app_private.can_access_assessment_instance(v_instance.id) then raise exception 'Permission denied'; end if;

  select * into v_existing
  from public.learner_marks
  where school_id=v_instance.school_id and client_mutation_id=p_client_mutation_id
  for update;
  if found then
    if v_existing.assessment_instance_id is distinct from p_assessment_instance_id
       or v_existing.enrolment_id is distinct from p_enrolment_id
       or v_existing.learner_id is distinct from p_learner_id
       or v_existing.numeric_mark is distinct from p_numeric_mark
       or v_existing.mark_status is distinct from p_mark_status
       or v_existing.teacher_note is distinct from p_teacher_note
       or v_existing.recorded_by_user_id is distinct from auth.uid() then
      return jsonb_build_object('outcome','rejected','code','idempotency_payload_mismatch');
    end if;
    return jsonb_build_object('outcome','success','mark_id',v_existing.id,'version',v_existing.id,'replayed',true);
  end if;

  if v_instance.status not in ('open','returned') then
    return jsonb_build_object('outcome','rejected','code','assessment_not_editable','status',v_instance.status);
  end if;

  select * into v_enrolment
  from public.enrolments
  where id=p_enrolment_id;
  if not found
     or v_enrolment.school_id is distinct from v_instance.school_id
     or v_enrolment.academic_year is distinct from v_instance.academic_year
     or v_enrolment.register_class_id is distinct from v_instance.register_class_id
     or v_enrolment.learner_id is distinct from p_learner_id
     or v_enrolment.status <> 'current' then
    return jsonb_build_object('outcome','rejected','code','learner_not_eligible');
  end if;

  -- Subject registration becomes authoritative when a record exists for this
  -- learner/year. Learners with no populated registration rows retain the
  -- legacy grade/class eligibility path during school reconciliation.
  if exists (
    select 1 from public.learner_subject_registrations lsr
    where lsr.enrolment_id=v_enrolment.id
  ) and not exists (
    select 1 from public.learner_subject_registrations lsr
    where lsr.enrolment_id=v_enrolment.id
      and lsr.subject_offering_id=v_instance.subject_offering_id
      and lsr.status='active'
  ) then
    return jsonb_build_object('outcome','rejected','code','learner_not_registered_for_subject');
  end if;

  if p_numeric_mark is not null and p_mark_status is not null then
    return jsonb_build_object('outcome','rejected','code','mark_value_and_status_are_mutually_exclusive');
  end if;
  if p_numeric_mark is not null and p_numeric_mark < 0 then
    return jsonb_build_object('outcome','rejected','code','negative_mark');
  end if;

  select coalesce(v_instance.raw_max,ac.raw_max)
    into v_max
    from public.assessment_components ac
   where ac.id=v_instance.assessment_component_id;
  if p_numeric_mark is not null and v_max is not null and p_numeric_mark>v_max then
    return jsonb_build_object('outcome','rejected','code','mark_exceeds_maximum','raw_max',v_max);
  end if;

  select * into v_current
  from public.learner_marks
  where assessment_instance_id=p_assessment_instance_id
    and enrolment_id=p_enrolment_id
  order by recorded_at desc,created_at desc
  limit 1
  for update;

  if v_current.id is distinct from p_expected_version then
    return jsonb_build_object('outcome','conflicted','code','stale_version','current_version',v_current.id);
  end if;

  insert into public.learner_marks(
    tenant_id,school_id,assessment_instance_id,enrolment_id,learner_id,
    numeric_mark,mark_status,teacher_note,recorded_by_user_id,
    client_mutation_id,replaces_mark_id
  ) values(
    v_instance.tenant_id,v_instance.school_id,p_assessment_instance_id,
    p_enrolment_id,p_learner_id,p_numeric_mark,p_mark_status,p_teacher_note,
    auth.uid(),p_client_mutation_id,v_current.id
  ) returning id into v_new_id;

  return jsonb_build_object('outcome','success','mark_id',v_new_id,'version',v_new_id,'replayed',false);
end;
$$;

comment on function public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid) is
'Offline-safe append-only working-mark replay for open or governed-returned assessments. Enforces current class/year/learner identity, populated subject registration, numeric bounds, optimistic versioning and finality.';


create or replace function public.submit_assessment_for_review(
  p_assessment_instance_id uuid,
  p_calculation_version text default 'weighted-v1'
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_instance public.assessment_instances%rowtype;
  v_expected integer;
  v_captured integer;
  v_submission_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_instance
  from public.assessment_instances
  where id=p_assessment_instance_id
  for update;
  if not found then raise exception 'Assessment instance not found'; end if;
  if not app_private.can_access_assessment_instance(v_instance.id) then raise exception 'Permission denied'; end if;
  if v_instance.status not in ('open','returned') then raise exception 'Assessment is not open for submission'; end if;

  select count(*) into v_expected
  from public.enrolments e
  where e.school_id=v_instance.school_id
    and e.register_class_id=v_instance.register_class_id
    and e.academic_year=v_instance.academic_year
    and e.status='current'
    and (
      not exists (
        select 1 from public.learner_subject_registrations any_lsr
        where any_lsr.enrolment_id=e.id
      )
      or exists (
        select 1 from public.learner_subject_registrations lsr
        where lsr.enrolment_id=e.id
          and lsr.subject_offering_id=v_instance.subject_offering_id
          and lsr.status='active'
      )
    );

  select count(*) into v_captured
  from public.learner_marks_current lm
  join public.enrolments e on e.id=lm.enrolment_id
  where lm.assessment_instance_id=v_instance.id
    and e.school_id=v_instance.school_id
    and e.register_class_id=v_instance.register_class_id
    and e.academic_year=v_instance.academic_year
    and e.status='current'
    and (
      not exists (
        select 1 from public.learner_subject_registrations any_lsr
        where any_lsr.enrolment_id=e.id
      )
      or exists (
        select 1 from public.learner_subject_registrations lsr
        where lsr.enrolment_id=e.id
          and lsr.subject_offering_id=v_instance.subject_offering_id
          and lsr.status='active'
      )
    );

  if v_expected=0 then raise exception 'Assessment class has no eligible learners'; end if;
  if v_captured<v_expected then
    raise exception 'Marks are incomplete: % of % eligible learners captured',v_captured,v_expected;
  end if;

  insert into public.mark_submissions(
    tenant_id,school_id,assessment_instance_id,submitted_by_user_id,
    completeness,calculation_version
  ) values(
    v_instance.tenant_id,v_instance.school_id,v_instance.id,auth.uid(),
    jsonb_build_object('expected',v_expected,'captured',v_captured,'eligibility','subject-registration-aware'),
    p_calculation_version
  ) returning id into v_submission_id;

  update public.assessment_instances
     set status='review',updated_at=now()
   where id=v_instance.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_instance.tenant_id,v_instance.school_id,auth.uid(),'assessment.submitted',
    'assessment_instance',v_instance.id,
    jsonb_build_object('submission_id',v_submission_id,'expected',v_expected,'captured',v_captured)
  );
  return v_submission_id;
end;
$$;

revoke all on function public.submit_assessment_for_review(uuid,text) from public,anon;
grant execute on function public.submit_assessment_for_review(uuid,text) to authenticated;
