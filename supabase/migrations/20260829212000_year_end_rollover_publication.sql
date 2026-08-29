-- Publish locked year-end decisions into the next academic year without mutating
-- the locked progression record itself. The publication record is append-only and
-- preserves exactly which destination enrolment (if any) was created.

create table if not exists public.year_end_progression_publications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  progression_id uuid not null unique references public.year_end_progressions(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  source_enrolment_id uuid not null references public.enrolments(id) on delete restrict,
  source_academic_year integer not null check (source_academic_year between 2000 and 2200),
  outcome text not null check (outcome in ('promoted','not_promoted','condoned','completed')),
  destination_academic_year integer,
  destination_grade_id uuid references public.grades(id) on delete restrict,
  destination_register_class_id uuid references public.register_classes(id) on delete restrict,
  destination_enrolment_id uuid references public.enrolments(id) on delete restrict,
  effective_on date not null,
  published_by_user_id uuid not null references auth.users(id) on delete restrict,
  published_at timestamptz not null default now(),
  decision_snapshot jsonb not null,
  check (jsonb_typeof(decision_snapshot) = 'object'),
  check (
    (outcome = 'completed' and destination_academic_year is null and destination_grade_id is null and destination_register_class_id is null and destination_enrolment_id is null)
    or
    (outcome in ('promoted','not_promoted','condoned') and destination_academic_year is not null and destination_grade_id is not null and destination_enrolment_id is not null)
  )
);

create index if not exists year_end_progression_publications_school_year_idx
  on public.year_end_progression_publications(school_id, source_academic_year, published_at desc);
create index if not exists year_end_progression_publications_learner_idx
  on public.year_end_progression_publications(learner_id, source_academic_year desc);

alter table public.year_end_progression_publications enable row level security;

create policy "academic leaders can read rollover publications"
on public.year_end_progression_publications for select to authenticated
using (
  app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod'])
  or app_private.has_platform_role(array['platform_admin'])
);

create or replace function app_private.guard_year_end_progression_publication_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Year-end progression publications are immutable';
end;
$$;

drop trigger if exists year_end_progression_publication_immutability_guard on public.year_end_progression_publications;
create trigger year_end_progression_publication_immutability_guard
before update or delete on public.year_end_progression_publications
for each row execute function app_private.guard_year_end_progression_publication_immutability();

create or replace function public.publish_year_end_progression(
  p_progression_id uuid,
  p_destination_register_class_id uuid default null,
  p_effective_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_progression public.year_end_progressions%rowtype;
  v_source_enrolment public.enrolments%rowtype;
  v_source_grade public.grades%rowtype;
  v_destination_grade public.grades%rowtype;
  v_destination_class public.register_classes%rowtype;
  v_destination_year public.academic_years%rowtype;
  v_destination_enrolment_id uuid;
  v_publication_id uuid;
  v_effective_on date;
  v_destination_grade_code text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_progression
  from public.year_end_progressions
  where id = p_progression_id
  for update;

  if not found then raise exception 'Progression decision not found'; end if;
  if not app_private.has_school_role(v_progression.school_id, array['school_admin','principal','deputy_principal'])
     and not app_private.has_platform_role(array['platform_admin']) then
    raise exception 'Permission denied';
  end if;
  if v_progression.status <> 'locked' then
    raise exception 'Only locked progression decisions can be published';
  end if;
  if v_progression.outcome not in ('promoted','not_promoted','condoned','completed') then
    raise exception 'This progression outcome is completed through another governed workflow';
  end if;

  select id into v_publication_id
  from public.year_end_progression_publications
  where progression_id = v_progression.id;
  if v_publication_id is not null then return v_publication_id; end if;

  select * into v_source_enrolment
  from public.enrolments
  where id = v_progression.enrolment_id
  for update;

  if not found
     or v_source_enrolment.learner_id <> v_progression.learner_id
     or v_source_enrolment.school_id <> v_progression.school_id
     or v_source_enrolment.academic_year <> v_progression.academic_year then
    raise exception 'Progression source enrolment does not match the locked decision';
  end if;

  select * into v_source_grade from public.grades where id = v_progression.source_grade_id;
  if not found or v_source_grade.school_id <> v_progression.school_id or v_source_grade.academic_year <> v_progression.academic_year then
    raise exception 'Progression source grade does not match the locked decision';
  end if;

  v_effective_on := coalesce(p_effective_on, make_date(v_progression.academic_year, 12, 31));
  if v_effective_on < v_source_enrolment.enrolled_from then
    raise exception 'Rollover effective date cannot be before the source enrolment';
  end if;

  if v_progression.outcome = 'completed' then
    if p_destination_register_class_id is not null then
      raise exception 'Completed learners do not receive a destination class';
    end if;

    update public.enrolments
    set status = 'completed', enrolled_to = coalesce(enrolled_to, v_effective_on), updated_at = now()
    where id = v_source_enrolment.id
      and status = 'current';
  else
    select * into v_destination_year
    from public.academic_years
    where school_id = v_progression.school_id
      and year = v_progression.academic_year + 1;
    if not found then raise exception 'Configure the next academic year before publishing progression'; end if;

    v_destination_grade_code := case
      when v_progression.outcome = 'not_promoted' then v_source_grade.grade_code
      else nullif(btrim(coalesce(v_progression.destination_grade_code, '')), '')
    end;
    if v_destination_grade_code is null then
      raise exception 'Approved progression does not identify a destination grade';
    end if;

    select * into v_destination_grade
    from public.grades
    where school_id = v_progression.school_id
      and academic_year = v_progression.academic_year + 1
      and upper(grade_code) = upper(v_destination_grade_code);
    if not found then raise exception 'Destination grade is not configured for the next academic year'; end if;

    if p_destination_register_class_id is not null then
      select * into v_destination_class
      from public.register_classes
      where id = p_destination_register_class_id;
      if not found
         or v_destination_class.school_id <> v_progression.school_id
         or v_destination_class.academic_year <> v_progression.academic_year + 1
         or v_destination_class.grade_id <> v_destination_grade.id then
        raise exception 'Destination register class does not match the next-year grade';
      end if;
    end if;

    if exists (
      select 1 from public.enrolments
      where school_id = v_progression.school_id
        and learner_id = v_progression.learner_id
        and academic_year = v_progression.academic_year + 1
    ) then
      raise exception 'Learner already has an enrolment for the destination academic year';
    end if;

    insert into public.enrolments(
      tenant_id, school_id, learner_id, academic_year, grade_id, register_class_id,
      admission_number, enrolled_from, status
    ) values (
      v_progression.tenant_id, v_progression.school_id, v_progression.learner_id,
      v_progression.academic_year + 1, v_destination_grade.id, v_destination_class.id,
      v_source_enrolment.admission_number,
      coalesce(v_destination_year.starts_on, make_date(v_progression.academic_year + 1, 1, 1)),
      'current'
    ) returning id into v_destination_enrolment_id;

    update public.enrolments
    set status = 'completed', enrolled_to = coalesce(enrolled_to, v_effective_on), updated_at = now()
    where id = v_source_enrolment.id
      and status = 'current';
  end if;

  insert into public.year_end_progression_publications(
    tenant_id, school_id, progression_id, learner_id, source_enrolment_id,
    source_academic_year, outcome, destination_academic_year, destination_grade_id,
    destination_register_class_id, destination_enrolment_id, effective_on,
    published_by_user_id, decision_snapshot
  ) values (
    v_progression.tenant_id,
    v_progression.school_id,
    v_progression.id,
    v_progression.learner_id,
    v_progression.enrolment_id,
    v_progression.academic_year,
    v_progression.outcome,
    case when v_progression.outcome = 'completed' then null else v_progression.academic_year + 1 end,
    v_destination_grade.id,
    v_destination_class.id,
    v_destination_enrolment_id,
    v_effective_on,
    auth.uid(),
    jsonb_build_object(
      'progression_id', v_progression.id,
      'outcome', v_progression.outcome,
      'source_grade_id', v_progression.source_grade_id,
      'destination_grade_code', v_progression.destination_grade_code,
      'rule_set_key', v_progression.rule_set_key,
      'rule_set_version', v_progression.rule_set_version,
      'rationale', v_progression.rationale,
      'decided_by_user_id', v_progression.decided_by_user_id,
      'decided_at', v_progression.decided_at,
      'locked_at', v_progression.locked_at
    )
  ) returning id into v_publication_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_progression.tenant_id,
    v_progression.school_id,
    auth.uid(),
    'progression.published',
    'year_end_progression_publication',
    v_publication_id,
    jsonb_build_object(
      'progression_id', v_progression.id,
      'outcome', v_progression.outcome,
      'destination_enrolment_id', v_destination_enrolment_id,
      'destination_academic_year', case when v_progression.outcome='completed' then null else v_progression.academic_year + 1 end
    )
  );

  return v_publication_id;
end;
$$;

revoke all on public.year_end_progression_publications from anon, authenticated;
grant select on public.year_end_progression_publications to authenticated;
revoke all on function public.publish_year_end_progression(uuid,uuid,date) from public, anon;
grant execute on function public.publish_year_end_progression(uuid,uuid,date) to authenticated;

comment on table public.year_end_progression_publications is 'Immutable publication receipt connecting a locked year-end decision to the exact next-year enrolment, or to terminal completion.';
comment on function public.publish_year_end_progression(uuid,uuid,date) is 'Publishes one locked progression decision exactly once. It never invents promotion rules or destination grades.';