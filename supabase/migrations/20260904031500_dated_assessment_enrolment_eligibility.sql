-- For assessments with an explicit assessment_date, mark capture and submission
-- completeness must use the learner population whose enrolment covered that date.
-- Undated/term-based assessments intentionally retain the existing current-status
-- behavior until subject-registration readiness becomes a blocking workflow by design.

create or replace function app_private.enforce_learner_mark_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_instance record;
  v_enrolment record;
  v_replaced record;
begin
  select tenant_id,school_id,academic_year,register_class_id,assessment_date
    into v_instance
    from public.assessment_instances
   where id=new.assessment_instance_id;
  if not found then
    raise exception 'Learner mark assessment instance does not exist';
  end if;
  if (new.tenant_id,new.school_id)
     is distinct from (v_instance.tenant_id,v_instance.school_id) then
    raise exception 'Learner mark scope mismatch: assessment instance belongs to another school';
  end if;

  select tenant_id,school_id,academic_year,register_class_id,learner_id,
         enrolled_from,enrolled_to
    into v_enrolment
    from public.enrolments
   where id=new.enrolment_id;
  if not found then
    raise exception 'Learner mark enrolment does not exist';
  end if;
  if (new.tenant_id,new.school_id,v_instance.academic_year,
      v_instance.register_class_id,new.learner_id)
     is distinct from (v_enrolment.tenant_id,v_enrolment.school_id,
                       v_enrolment.academic_year,v_enrolment.register_class_id,
                       v_enrolment.learner_id) then
    raise exception 'Learner mark scope mismatch: enrolment or learner does not belong to the assessment class and year';
  end if;

  if v_instance.assessment_date is not null
    and (
      v_enrolment.enrolled_from>v_instance.assessment_date
      or (v_enrolment.enrolled_to is not null
          and v_enrolment.enrolled_to<v_instance.assessment_date)
    ) then
    raise exception 'Learner mark scope mismatch: learner was not enrolled in the assessment class on the assessment date';
  end if;

  if new.replaces_mark_id is not null then
    select tenant_id,school_id,assessment_instance_id,enrolment_id,learner_id
      into v_replaced
      from public.learner_marks
     where id=new.replaces_mark_id;
    if not found then
      raise exception 'Learner mark replacement target does not exist';
    end if;
    if (new.tenant_id,new.school_id,new.assessment_instance_id,new.enrolment_id,new.learner_id)
       is distinct from (v_replaced.tenant_id,v_replaced.school_id,
                         v_replaced.assessment_instance_id,v_replaced.enrolment_id,
                         v_replaced.learner_id) then
      raise exception 'Learner mark scope mismatch: replacement target belongs to another learner or assessment';
    end if;
  end if;

  if tg_op='UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.assessment_instance_id is distinct from old.assessment_instance_id
    or new.enrolment_id is distinct from old.enrolment_id
    or new.learner_id is distinct from old.learner_id
    or new.replaces_mark_id is distinct from old.replaces_mark_id
    or new.recorded_by_user_id is distinct from old.recorded_by_user_id
    or new.recorded_at is distinct from old.recorded_at
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Learner mark scope and provenance are immutable';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_learner_mark_scope_integrity()
from public,anon,authenticated;

create or replace function public.submit_assessment_for_review(
  p_assessment_instance_id uuid,
  p_calculation_version text default 'weighted-v1'
)
returns uuid
language plpgsql
security definer
set search_path=public
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
  if not app_private.can_access_assessment_instance(v_instance.id) then
    raise exception 'Permission denied';
  end if;
  if v_instance.status not in ('open','returned') then
    raise exception 'Assessment is not open for submission';
  end if;

  if v_instance.assessment_date is not null then
    select count(*) into v_expected
    from public.enrolments e
    where e.school_id=v_instance.school_id
      and e.register_class_id=v_instance.register_class_id
      and e.academic_year=v_instance.academic_year
      and e.enrolled_from<=v_instance.assessment_date
      and (e.enrolled_to is null or e.enrolled_to>=v_instance.assessment_date);

    select count(*) into v_captured
    from public.learner_marks_current lm
    join public.enrolments e on e.id=lm.enrolment_id
    where lm.assessment_instance_id=v_instance.id
      and e.enrolled_from<=v_instance.assessment_date
      and (e.enrolled_to is null or e.enrolled_to>=v_instance.assessment_date);
  else
    select count(*) into v_expected
    from public.enrolments e
    where e.school_id=v_instance.school_id
      and e.register_class_id=v_instance.register_class_id
      and e.academic_year=v_instance.academic_year
      and e.status='current';

    select count(*) into v_captured
    from public.learner_marks_current lm
    join public.enrolments e on e.id=lm.enrolment_id
    where lm.assessment_instance_id=v_instance.id
      and e.status='current';
  end if;

  if v_expected=0 then raise exception 'Assessment class has no eligible learners'; end if;
  if v_captured<v_expected then
    raise exception 'Marks are incomplete: % of % learners captured',v_captured,v_expected;
  end if;

  insert into public.mark_submissions(
    tenant_id,school_id,assessment_instance_id,submitted_by_user_id,
    completeness,calculation_version
  ) values(
    v_instance.tenant_id,v_instance.school_id,v_instance.id,auth.uid(),
    jsonb_build_object(
      'expected',v_expected,
      'captured',v_captured,
      'eligibility_reference_date',v_instance.assessment_date
    ),
    p_calculation_version
  ) returning id into v_submission_id;

  update public.assessment_instances
  set status='review',updated_at=now()
  where id=v_instance.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_instance.tenant_id,v_instance.school_id,auth.uid(),
    'assessment.submitted','assessment_instance',v_instance.id,
    jsonb_build_object(
      'submission_id',v_submission_id,
      'expected',v_expected,
      'captured',v_captured,
      'eligibility_reference_date',v_instance.assessment_date
    )
  );

  return v_submission_id;
end;
$$;

revoke all on function public.submit_assessment_for_review(uuid,text)
from public,anon;
grant execute on function public.submit_assessment_for_review(uuid,text)
to authenticated;

comment on function app_private.enforce_learner_mark_scope_integrity() is
'Learner mark integrity binds learner/enrolment to the assessment class and year and, for dated assessments, requires the enrolment to cover the assessment date.';
comment on function public.submit_assessment_for_review(uuid,text) is
'Assessment submission validates completeness against enrolments effective on an explicit assessment date; undated assessments retain current-status class completeness semantics.';
