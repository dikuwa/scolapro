-- Admission application status must agree with the real learner/enrolment it produced.
-- Accepted applications remain pre-enrolment records; only the governed completion RPC
-- may mark an application enrolled while linking the created learner and enrolment.

alter table public.admission_applications
  add column if not exists learner_id uuid references public.learners(id) on delete restrict,
  add column if not exists enrolment_id uuid references public.enrolments(id) on delete restrict,
  add column if not exists enrolled_at timestamptz;

create unique index if not exists admission_application_enrolment_uidx
on public.admission_applications(enrolment_id)
where enrolment_id is not null;

create or replace function app_private.guard_admission_enrolment_linkage()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_enrol public.enrolments%rowtype;
begin
  if new.status='enrolled' then
    if new.learner_id is null or new.enrolment_id is null or new.enrolled_at is null then
      raise exception 'Enrolled admission must link the created learner and enrolment';
    end if;
    select * into v_enrol from public.enrolments where id=new.enrolment_id;
    if not found
       or v_enrol.learner_id<>new.learner_id
       or v_enrol.school_id<>new.school_id
       or v_enrol.tenant_id<>new.tenant_id
       or v_enrol.academic_year<>new.academic_year then
      raise exception 'Admission learner/enrolment linkage is inconsistent';
    end if;
    if new.requested_grade_id is not null and v_enrol.grade_id<>new.requested_grade_id then
      raise exception 'Enrolment grade does not match the accepted admission grade';
    end if;
  else
    if new.enrolment_id is not null or new.enrolled_at is not null then
      raise exception 'Only enrolled admissions may carry enrolment completion provenance';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_admission_enrolment_linkage() from public,anon,authenticated;

drop trigger if exists admission_enrolment_linkage_guard on public.admission_applications;
create trigger admission_enrolment_linkage_guard
before insert or update on public.admission_applications
for each row execute function app_private.guard_admission_enrolment_linkage();

create or replace function public.enrol_accepted_admission(
  p_application_id uuid,
  p_register_class_id uuid,
  p_admission_number text default null,
  p_preferred_name text default null,
  p_sex text default 'unspecified',
  p_enrolled_from date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_application public.admission_applications%rowtype;
  v_created jsonb;
  v_learner_id uuid;
  v_enrolment_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_application
  from public.admission_applications
  where id=p_application_id
  for update;
  if not found then raise exception 'Admission application not found'; end if;
  if not app_private.has_school_role(v_application.school_id,array['school_admin']) then
    raise exception 'Permission denied';
  end if;
  if v_application.status<>'accepted' then
    raise exception 'Only accepted admission applications can be enrolled';
  end if;
  if v_application.requested_grade_id is null then
    raise exception 'Accepted admission must have a grade before enrolment';
  end if;
  if p_register_class_id is null then
    raise exception 'Register class is required for enrolment';
  end if;

  v_created:=public.create_learner_enrolment(
    v_application.school_id,
    v_application.academic_year,
    v_application.requested_grade_id,
    p_register_class_id,
    v_application.applicant_first_names,
    v_application.applicant_surname,
    p_preferred_name,
    v_application.date_of_birth,
    p_sex,
    p_admission_number,
    p_enrolled_from
  );

  v_learner_id:=(v_created->>'learner_id')::uuid;
  v_enrolment_id:=(v_created->>'enrolment_id')::uuid;

  update public.admission_applications
  set status='enrolled',
      learner_id=v_learner_id,
      enrolment_id=v_enrolment_id,
      enrolled_at=now(),
      reviewed_by_user_id=coalesce(reviewed_by_user_id,auth.uid()),
      reviewed_at=coalesce(reviewed_at,now()),
      updated_at=now()
  where id=v_application.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values (
    v_application.tenant_id,v_application.school_id,auth.uid(),
    'admission.enrolled','admission_application',v_application.id,
    jsonb_build_object('learner_id',v_learner_id,'enrolment_id',v_enrolment_id,'academic_year',v_application.academic_year)
  );

  return jsonb_build_object(
    'application_id',v_application.id,
    'learner_id',v_learner_id,
    'enrolment_id',v_enrolment_id
  );
end;
$$;
revoke all on function public.enrol_accepted_admission(uuid,uuid,text,text,text,date) from public,anon;
grant execute on function public.enrol_accepted_admission(uuid,uuid,text,text,text,date) to authenticated;

comment on column public.admission_applications.enrolment_id is
'Canonical enrolment created when an accepted application is completed. An application cannot be enrolled without this provenance.';
comment on function public.enrol_accepted_admission(uuid,uuid,text,text,text,date) is
'Atomically converts an accepted application into a real learner identity/current enrolment and records the linkage back on the application.';