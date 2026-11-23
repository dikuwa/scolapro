-- #1316: authorized correction must reopen moderation for a new submission.
-- Previously mark correction set correction_pending but left a verified/locked
-- instance in its final state. The assigned teacher could edit under the
-- authorized window but could not submit corrected marks for HOD review.
-- Only the canonical bounded authorization function can effect this transition;
-- it retains original locked history and always requires re-verification.
create or replace function public.authorize_assessment_mark_correction(
  p_assessment_instance_id uuid,
  p_scope_kind text,
  p_enrolment_id uuid,
  p_reason text,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_requires_reverification boolean default true
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_instance public.assessment_instances%rowtype;
  v_subject_id uuid;
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_id uuid;
  v_is_school_leader boolean:=false;
  v_is_hod boolean:=false;
  v_effective_window jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_scope_kind not in ('learner','component','subject_class') then
    raise exception 'Correction scope must be learner, component, or subject_class';
  end if;
  if v_reason is null then raise exception 'A correction reason is required'; end if;
  if p_starts_at is null or p_expires_at is null or p_expires_at<=p_starts_at then
    raise exception 'Correction authorization requires a valid start and expiry';
  end if;
  if coalesce(p_requires_reverification,false)<>true then
    raise exception 'Correction authorization requires re-verification';
  end if;

  select * into v_instance
  from public.assessment_instances
  where id=p_assessment_instance_id
  for update;
  if not found then raise exception 'Assessment instance not found'; end if;

  select subject_id into v_subject_id
  from public.subject_offerings
  where id=v_instance.subject_offering_id;

  v_is_school_leader:=
    app_private.has_platform_role(array['platform_admin'])
    or (
      app_private.user_current_school_matches((select auth.uid()),v_instance.school_id)
      and not app_private.has_platform_role(array['platform_support'])
      and app_private.has_school_role(
        v_instance.school_id,
        array['school_admin','principal','deputy_principal']
      )
    );

  v_is_hod:=
    app_private.user_current_school_matches((select auth.uid()),v_instance.school_id)
    and not app_private.has_platform_role(array['platform_support'])
    and app_private.hod_responsible_for_subject(v_instance.school_id,v_subject_id);

  if p_scope_kind='subject_class' then
    if not v_is_school_leader then
      raise exception 'Subject-class correction requires school leadership authority';
    end if;
  elsif not (v_is_school_leader or v_is_hod) then
    raise exception 'Permission denied';
  end if;

  v_effective_window:=app_private.resolve_assessment_mark_entry_window(
    v_instance.id,
    case when p_scope_kind='learner' then p_enrolment_id else null end,
    now()
  );

  if not (
    v_instance.status in ('verified','locked')
    or (v_instance.status='returned' and v_instance.correction_pending)
    or (
      v_instance.status in ('not_open','open','returned')
      and coalesce(v_effective_window->>'state','') in ('locked','locked_again')
    )
  ) then
    raise exception 'Only an effectively locked assessment or already-open correction work can be authorized';
  end if;

  if p_scope_kind='learner' then
    if p_enrolment_id is null or not exists(
      select 1
      from public.enrolments enrolment
      where enrolment.id=p_enrolment_id
        and enrolment.tenant_id=v_instance.tenant_id
        and enrolment.school_id=v_instance.school_id
        and enrolment.academic_year=v_instance.academic_year
        and enrolment.register_class_id=v_instance.register_class_id
    ) then
      raise exception 'Learner correction scope is outside this assessment';
    end if;
  elsif p_enrolment_id is not null then
    raise exception 'Only learner correction scope accepts an enrolment';
  end if;

  insert into public.assessment_mark_reopen_authorizations(
    tenant_id,school_id,scope_kind,assessment_instance_id,enrolment_id,
    subject_offering_id,register_class_id,term_number,reason,starts_at,expires_at,
    requires_reverification,authorized_by_user_id
  ) values(
    v_instance.tenant_id,v_instance.school_id,p_scope_kind,
    case when p_scope_kind='subject_class' then null else v_instance.id end,
    case when p_scope_kind='learner' then p_enrolment_id else null end,
    v_instance.subject_offering_id,v_instance.register_class_id,v_instance.term_number,
    v_reason,p_starts_at,p_expires_at,true,auth.uid()
  )
  returning id into v_id;

  if p_scope_kind='subject_class' then
    update public.assessment_instances target
       set status=case when target.status in ('verified','locked') then 'returned' else target.status end,
           correction_pending=true,
           correction_started_at=coalesce(target.correction_started_at,p_starts_at),
           correction_completed_at=null,
           updated_at=now()
     where target.tenant_id=v_instance.tenant_id
       and target.school_id=v_instance.school_id
       and target.subject_offering_id=v_instance.subject_offering_id
       and target.register_class_id=v_instance.register_class_id
       and target.term_number is not distinct from v_instance.term_number
       and (
         target.status in ('verified','locked')
         or target.correction_pending
         or (
           target.status in ('not_open','open','returned')
           and coalesce(
             app_private.resolve_assessment_mark_entry_window(target.id,null,now())->>'state',
             ''
           ) in ('locked','locked_again')
         )
       );
  else
    update public.assessment_instances
       set status=case when status in ('verified','locked') then 'returned' else status end,
           correction_pending=true,
           correction_started_at=coalesce(correction_started_at,p_starts_at),
           correction_completed_at=null,
           updated_at=now()
     where id=v_instance.id;
  end if;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_instance.tenant_id,v_instance.school_id,auth.uid(),
    'assessment.mark_correction.authorized','assessment_mark_reopen_authorization',v_id,
    jsonb_build_object(
      'assessment_instance_id',v_instance.id,
      'scope_kind',p_scope_kind,
      'enrolment_id',p_enrolment_id,
      'subject_offering_id',v_instance.subject_offering_id,
      'register_class_id',v_instance.register_class_id,
      'term_number',v_instance.term_number,
      'reason',v_reason,
      'starts_at',p_starts_at,
      'expires_at',p_expires_at,
      'requires_reverification',coalesce(p_requires_reverification,true)
    )
  );

  return v_id;
end;
$$;

