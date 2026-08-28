create table if not exists public.grading_scales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  scale_key text not null,
  version text not null,
  display_name text not null,
  effective_from date not null,
  effective_to date,
  decimal_places smallint not null default 0 check (decimal_places between 0 and 4),
  status text not null default 'draft' check (status in ('draft','active','superseded','archived')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, scale_key, version),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.grading_scale_bands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  grading_scale_id uuid not null references public.grading_scales(id) on delete cascade,
  minimum_value numeric(10,4) not null,
  maximum_value numeric(10,4),
  symbol text not null,
  description text,
  points numeric(10,4),
  pass_classification text check (pass_classification in ('pass','fail','neutral')),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  check (maximum_value is null or maximum_value >= minimum_value)
);

alter table public.official_results
  add column if not exists grading_scale_key text,
  add column if not exists grading_scale_version text;

create index if not exists grading_scale_bands_scale_idx on public.grading_scale_bands(grading_scale_id, minimum_value desc);
create index if not exists grading_scales_school_effective_idx on public.grading_scales(school_id, status, effective_from desc);
create unique index if not exists assessment_instances_component_class_term_uidx
on public.assessment_instances(register_class_id, assessment_component_id, term_number)
where assessment_component_id is not null and status <> 'cancelled';

alter table public.grading_scales enable row level security;
alter table public.grading_scale_bands enable row level security;

create policy "academic staff can read grading scales"
on public.grading_scales for select to authenticated
using (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']));

create policy "academic leaders can create grading scales"
on public.grading_scales for insert to authenticated
with check (created_by_user_id = (select auth.uid()) and app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod']));

create policy "academic leaders can update grading scales"
on public.grading_scales for update to authenticated
using (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod']))
with check (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod']));

create policy "academic staff can read grading bands"
on public.grading_scale_bands for select to authenticated
using (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']));

create policy "academic leaders can manage grading bands"
on public.grading_scale_bands for all to authenticated
using (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod']))
with check (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod']));

drop trigger if exists grading_scale_bands_scope_guard on public.grading_scale_bands;
create trigger grading_scale_bands_scope_guard before insert or update on public.grading_scale_bands
for each row execute function app_private.enforce_parent_scope('grading_scale_id','public.grading_scales','school_id','required');

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
  select * into v_scheme from public.assessment_schemes where id = p_assessment_scheme_id;
  if not found then raise exception 'Assessment scheme not found'; end if;
  if not app_private.has_school_role(v_scheme.school_id, array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']) then raise exception 'Permission denied'; end if;
  select * into v_enrolment from public.enrolments where id = p_enrolment_id;
  if not found or v_enrolment.school_id <> v_scheme.school_id then raise exception 'Enrolment is outside the assessment scheme school'; end if;

  for v_component in
    select ac.*, ai.id as instance_id, ai.raw_max as instance_raw_max
    from public.assessment_components ac
    left join public.assessment_instances ai
      on ai.assessment_component_id = ac.id
      and ai.assessment_scheme_id = v_scheme.id
      and ai.register_class_id = v_enrolment.register_class_id
      and ai.term_number = p_term_number
      and ai.status <> 'cancelled'
    where ac.assessment_scheme_id = v_scheme.id
      and ac.contributes_to_report = true
    order by ac.sort_order, ac.component_code
  loop
    if v_component.instance_id is null then
      if v_component.required then v_missing := v_missing || jsonb_build_array(jsonb_build_object('component',v_component.component_code,'reason','assessment_instance_missing')); end if;
      continue;
    end if;

    select lm.numeric_mark, lm.mark_status, lm.recorded_at into v_mark
    from public.learner_marks_current lm
    where lm.assessment_instance_id = v_component.instance_id and lm.enrolment_id = v_enrolment.id;

    if v_mark.numeric_mark is null and v_mark.mark_status is null then
      if v_component.required then v_missing := v_missing || jsonb_build_array(jsonb_build_object('component',v_component.component_code,'reason','mark_missing')); end if;
      continue;
    end if;

    if v_mark.mark_status is not null then
      v_non_numeric := v_non_numeric || jsonb_build_array(jsonb_build_object('component',v_component.component_code,'status',v_mark.mark_status));
      if v_component.required then v_missing := v_missing || jsonb_build_array(jsonb_build_object('component',v_component.component_code,'reason',v_mark.mark_status)); end if;
      continue;
    end if;

    v_raw_max := coalesce(v_component.instance_raw_max, v_component.raw_max);
    if v_raw_max is null or v_raw_max <= 0 then raise exception 'Contributing component % has no valid raw maximum', v_component.component_code; end if;
    if v_component.weight is null then raise exception 'Contributing component % has no configured weight', v_component.component_code; end if;

    v_contribution := (v_mark.numeric_mark / v_raw_max) * v_component.weight;
    v_total := v_total + v_contribution;
    v_weight_total := v_weight_total + v_component.weight;
    v_inputs := v_inputs || jsonb_build_array(jsonb_build_object(
      'component', v_component.component_code,
      'assessment_instance_id', v_component.instance_id,
      'raw_mark', v_mark.numeric_mark,
      'raw_max', v_raw_max,
      'weight', v_component.weight,
      'contribution', v_contribution
    ));
  end loop;

  if jsonb_array_length(v_missing) > 0 then
    return jsonb_build_object('complete',false,'result_status','incomplete','missing',v_missing,'non_numeric',v_non_numeric,'inputs',v_inputs,'weight_total',v_weight_total);
  end if;
  if v_weight_total <= 0 then
    return jsonb_build_object('complete',false,'result_status','incomplete','missing',jsonb_build_array(jsonb_build_object('reason','no_contributing_weight')),'inputs',v_inputs);
  end if;

  -- Weights are normalized to a percentage even when a scheme intentionally totals less/more than 100.
  -- This preserves configured relative weighting without assuming a fixed number of components.
  v_final := (v_total / v_weight_total) * 100;
  return jsonb_build_object(
    'complete', true,
    'result_value', v_final,
    'weight_total', v_weight_total,
    'inputs', v_inputs,
    'assessment_scheme_key', v_scheme.scheme_key,
    'assessment_scheme_version', v_scheme.version,
    'term_number', p_term_number
  );
end;
$$;

revoke all on function public.calculate_subject_result(uuid,uuid,smallint) from public, anon;
grant execute on function public.calculate_subject_result(uuid,uuid,smallint) to authenticated;

create or replace function public.submit_assessment_for_review(
  p_assessment_instance_id uuid,
  p_calculation_version text default 'weighted-v1'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_instance public.assessment_instances%rowtype;
  v_expected integer;
  v_captured integer;
  v_submission_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_instance from public.assessment_instances where id = p_assessment_instance_id for update;
  if not found then raise exception 'Assessment instance not found'; end if;
  if not app_private.can_access_assessment_instance(v_instance.id) then raise exception 'Permission denied'; end if;
  if v_instance.status not in ('open','returned') then raise exception 'Assessment is not open for submission'; end if;

  select count(*) into v_expected from public.enrolments e
  where e.school_id = v_instance.school_id and e.register_class_id = v_instance.register_class_id and e.academic_year = v_instance.academic_year and e.status = 'current';
  select count(*) into v_captured from public.learner_marks_current lm
  join public.enrolments e on e.id = lm.enrolment_id
  where lm.assessment_instance_id = v_instance.id and e.status = 'current';
  if v_expected = 0 then raise exception 'Assessment class has no current learners'; end if;
  if v_captured < v_expected then raise exception 'Marks are incomplete: % of % learners captured', v_captured, v_expected; end if;

  insert into public.mark_submissions (tenant_id, school_id, assessment_instance_id, submitted_by_user_id, completeness, calculation_version)
  values (v_instance.tenant_id, v_instance.school_id, v_instance.id, auth.uid(), jsonb_build_object('expected',v_expected,'captured',v_captured), p_calculation_version)
  returning id into v_submission_id;

  update public.assessment_instances set status = 'review', updated_at = now() where id = v_instance.id;
  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_instance.tenant_id, v_instance.school_id, auth.uid(), 'assessment.submitted', 'assessment_instance', v_instance.id, jsonb_build_object('submission_id',v_submission_id,'expected',v_expected,'captured',v_captured));
  return v_submission_id;
end;
$$;

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
  select * into v_submission from public.mark_submissions where id = p_submission_id for update;
  if not found then raise exception 'Mark submission not found'; end if;
  select * into v_instance from public.assessment_instances where id = v_submission.assessment_instance_id for update;
  if not app_private.has_school_role(v_instance.school_id, array['school_admin','principal','deputy_principal','hod']) then raise exception 'Permission denied'; end if;
  if v_submission.status <> 'submitted' then raise exception 'Submission has already been reviewed'; end if;
  if p_decision = 'return' and nullif(btrim(coalesce(p_note,'')), '') is null then raise exception 'A return reason is required'; end if;

  v_new_status := case when p_decision = 'verify' then 'verified' else 'returned' end;
  update public.mark_submissions set status = v_new_status, reviewed_by_user_id = auth.uid(), reviewed_at = now(), review_note = nullif(btrim(coalesce(p_note,'')), '') where id = v_submission.id;
  update public.assessment_instances set status = case when p_decision='verify' then 'verified' else 'returned' end, updated_at = now() where id = v_instance.id;
  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_instance.tenant_id, v_instance.school_id, auth.uid(), 'assessment.reviewed', 'assessment_instance', v_instance.id, jsonb_build_object('submission_id',v_submission.id,'decision',p_decision,'note',nullif(btrim(coalesce(p_note,'')),'')));
  return true;
end;
$$;

create or replace function public.approve_official_subject_result(
  p_assessment_scheme_id uuid,
  p_enrolment_id uuid,
  p_term_number smallint,
  p_grading_scale_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scheme public.assessment_schemes%rowtype;
  v_enrolment public.enrolments%rowtype;
  v_scale public.grading_scales%rowtype;
  v_calc jsonb;
  v_result numeric;
  v_symbol text;
  v_id uuid;
  v_required integer;
  v_verified integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_scheme from public.assessment_schemes where id = p_assessment_scheme_id;
  select * into v_enrolment from public.enrolments where id = p_enrolment_id;
  select * into v_scale from public.grading_scales where id = p_grading_scale_id;
  if v_scheme.id is null or v_enrolment.id is null or v_scale.id is null then raise exception 'Scheme, enrolment or grading scale not found'; end if;
  if v_scheme.school_id <> v_enrolment.school_id or v_scale.school_id <> v_scheme.school_id then raise exception 'Academic scope mismatch'; end if;
  if not app_private.has_school_role(v_scheme.school_id, array['school_admin','principal','deputy_principal','hod']) then raise exception 'Permission denied'; end if;
  if v_scheme.status <> 'active' or v_scale.status <> 'active' then raise exception 'Assessment scheme and grading scale must be active'; end if;

  select count(*) into v_required
  from public.assessment_instances ai
  join public.assessment_components ac on ac.id = ai.assessment_component_id
  where ai.assessment_scheme_id = v_scheme.id and ai.register_class_id = v_enrolment.register_class_id and ai.term_number = p_term_number and ai.status <> 'cancelled' and ac.contributes_to_report = true and ac.required = true;
  select count(*) into v_verified
  from public.assessment_instances ai
  join public.assessment_components ac on ac.id = ai.assessment_component_id
  where ai.assessment_scheme_id = v_scheme.id and ai.register_class_id = v_enrolment.register_class_id and ai.term_number = p_term_number and ai.status in ('verified','locked') and ac.contributes_to_report = true and ac.required = true;
  if v_required = 0 or v_verified <> v_required then raise exception 'All required contributing assessments must be verified before official result approval'; end if;

  v_calc := public.calculate_subject_result(v_scheme.id, v_enrolment.id, p_term_number);
  if coalesce((v_calc ->> 'complete')::boolean,false) = false then raise exception 'Subject result is incomplete'; end if;
  v_result := round((v_calc ->> 'result_value')::numeric, v_scale.decimal_places);

  select gsb.symbol into v_symbol from public.grading_scale_bands gsb
  where gsb.grading_scale_id = v_scale.id and v_result >= gsb.minimum_value and (gsb.maximum_value is null or v_result <= gsb.maximum_value)
  order by gsb.minimum_value desc limit 1;
  if v_symbol is null then raise exception 'No grading band covers calculated result %', v_result; end if;

  insert into public.official_results (
    tenant_id, school_id, academic_year, enrolment_id, learner_id, subject_offering_id, term_number,
    result_value, symbol, assessment_scheme_key, assessment_scheme_version, grading_scale_key, grading_scale_version,
    calculation_snapshot, approved_by_user_id, approved_at, locked_at
  ) values (
    v_scheme.tenant_id, v_scheme.school_id, v_enrolment.academic_year, v_enrolment.id, v_enrolment.learner_id,
    v_scheme.subject_offering_id, p_term_number, v_result, v_symbol, v_scheme.scheme_key, v_scheme.version,
    v_scale.scale_key, v_scale.version, v_calc || jsonb_build_object('rounded_result',v_result,'symbol',v_symbol), auth.uid(), now(), now()
  )
  on conflict (enrolment_id, subject_offering_id, term_number) do nothing
  returning id into v_id;
  if v_id is null then raise exception 'An official result already exists for this learner, subject and term; use a governed correction workflow'; end if;

  update public.assessment_instances set status='locked', locked_at=coalesce(locked_at,now()), updated_at=now()
  where assessment_scheme_id=v_scheme.id and register_class_id=v_enrolment.register_class_id and term_number=p_term_number and status='verified';
  update public.mark_submissions ms set status='locked'
  where ms.assessment_instance_id in (select ai.id from public.assessment_instances ai where ai.assessment_scheme_id=v_scheme.id and ai.register_class_id=v_enrolment.register_class_id and ai.term_number=p_term_number)
    and ms.status='verified';

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_scheme.tenant_id, v_scheme.school_id, auth.uid(), 'official_result.approved', 'official_result', v_id,
    jsonb_build_object('enrolment_id',v_enrolment.id,'subject_offering_id',v_scheme.subject_offering_id,'term_number',p_term_number,'result',v_result,'symbol',v_symbol,'scheme_version',v_scheme.version,'grading_scale_version',v_scale.version));
  return v_id;
end;
$$;

revoke all on function public.submit_assessment_for_review(uuid,text) from public, anon;
grant execute on function public.submit_assessment_for_review(uuid,text) to authenticated;
revoke all on function public.review_mark_submission(uuid,text,text) from public, anon;
grant execute on function public.review_mark_submission(uuid,text,text) to authenticated;
revoke all on function public.approve_official_subject_result(uuid,uuid,smallint,uuid) from public, anon;
grant execute on function public.approve_official_subject_result(uuid,uuid,smallint,uuid) to authenticated;

comment on function public.calculate_subject_result(uuid,uuid,smallint) is 'Deterministic explainable weighted result calculation. Missing/non-numeric required evidence remains incomplete rather than becoming zero.';
comment on function public.approve_official_subject_result(uuid,uuid,smallint,uuid) is 'Creates one immutable ordinary official result only after required contributing assessment instances are verified; corrections require a separate governed workflow.';