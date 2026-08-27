create or replace function public.create_learner_enrolment(
  p_school_id uuid,
  p_academic_year integer,
  p_grade_id uuid,
  p_register_class_id uuid,
  p_first_names text,
  p_surname text,
  p_preferred_name text default null,
  p_date_of_birth date default null,
  p_sex text default 'unspecified',
  p_admission_number text default null,
  p_enrolled_from date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_tenant_id uuid;
  v_learner_id uuid;
  v_enrolment_id uuid;
begin
  if not app_private.has_school_role(p_school_id, array['school_admin']) then
    raise exception 'Not authorized to register learners for this school.' using errcode = '42501';
  end if;

  select s.tenant_id into v_tenant_id
  from public.schools s
  where s.id = p_school_id
    and s.status = 'active';

  if v_tenant_id is null then
    raise exception 'School is not available.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.grades g
    where g.id = p_grade_id
      and g.school_id = p_school_id
      and g.tenant_id = v_tenant_id
      and g.academic_year = p_academic_year
  ) then
    raise exception 'Grade does not belong to the selected school and academic year.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.register_classes rc
    where rc.id = p_register_class_id
      and rc.school_id = p_school_id
      and rc.tenant_id = v_tenant_id
      and rc.grade_id = p_grade_id
      and rc.academic_year = p_academic_year
  ) then
    raise exception 'Register class does not belong to the selected grade.' using errcode = '22023';
  end if;

  if nullif(btrim(p_first_names), '') is null or nullif(btrim(p_surname), '') is null then
    raise exception 'Learner first names and surname are required.' using errcode = '22023';
  end if;

  if p_sex not in ('female', 'male', 'other', 'unspecified') then
    raise exception 'Invalid learner sex value.' using errcode = '22023';
  end if;

  insert into public.learners (
    tenant_id,
    first_names,
    surname,
    preferred_name,
    date_of_birth,
    sex
  ) values (
    v_tenant_id,
    btrim(p_first_names),
    btrim(p_surname),
    nullif(btrim(p_preferred_name), ''),
    p_date_of_birth,
    p_sex
  ) returning id into v_learner_id;

  insert into public.enrolments (
    tenant_id,
    school_id,
    learner_id,
    academic_year,
    grade_id,
    register_class_id,
    admission_number,
    enrolled_from,
    status
  ) values (
    v_tenant_id,
    p_school_id,
    v_learner_id,
    p_academic_year,
    p_grade_id,
    p_register_class_id,
    nullif(btrim(p_admission_number), ''),
    p_enrolled_from,
    'current'
  ) returning id into v_enrolment_id;

  insert into public.audit_events (
    tenant_id,
    school_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  ) values (
    v_tenant_id,
    p_school_id,
    auth.uid(),
    'learner.registered',
    'learner',
    v_learner_id,
    jsonb_build_object(
      'enrolment_id', v_enrolment_id,
      'academic_year', p_academic_year,
      'grade_id', p_grade_id,
      'register_class_id', p_register_class_id
    )
  );

  return jsonb_build_object(
    'learner_id', v_learner_id,
    'enrolment_id', v_enrolment_id
  );
end;
$$;

revoke all on function public.create_learner_enrolment(uuid, integer, uuid, uuid, text, text, text, date, text, text, date) from public;
grant execute on function public.create_learner_enrolment(uuid, integer, uuid, uuid, text, text, text, date, text, text, date) to authenticated;

comment on function public.create_learner_enrolment is
  'Atomically creates learner identity, current school enrolment, and audit event after school-admin authorization.';
