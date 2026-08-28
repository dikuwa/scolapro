create table if not exists public.promotion_rule_sets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  grade_id uuid not null references public.grades(id) on delete restrict,
  rule_set_key text not null,
  version text not null,
  result_term_number smallint not null check (result_term_number between 1 and 6),
  pass_outcome text not null default 'promoted' check (pass_outcome in ('promoted','condoned','completed','pending')),
  fail_outcome text not null default 'not_promoted' check (fail_outcome in ('not_promoted','pending')),
  source_reference text,
  effective_from date not null,
  effective_to date,
  status text not null default 'draft' check (status in ('draft','active','superseded','archived')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, academic_year, grade_id, rule_set_key, version),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.promotion_rule_conditions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  promotion_rule_set_id uuid not null references public.promotion_rule_sets(id) on delete cascade,
  condition_code text not null,
  condition_type text not null check (condition_type in (
    'minimum_subject_result',
    'minimum_passed_subjects',
    'maximum_failed_subjects',
    'minimum_overall_average',
    'minimum_attendance_rate',
    'manual_review_required'
  )),
  subject_code text,
  threshold numeric(10,4),
  required boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  unique (promotion_rule_set_id, condition_code)
);

create index if not exists promotion_rule_sets_grade_year_idx on public.promotion_rule_sets(school_id, academic_year, grade_id, status);
create index if not exists promotion_rule_conditions_set_idx on public.promotion_rule_conditions(promotion_rule_set_id, sort_order);

alter table public.promotion_rule_sets enable row level security;
alter table public.promotion_rule_conditions enable row level security;

create policy "academic staff can read promotion rule sets"
on public.promotion_rule_sets for select to authenticated
using (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']));

create policy "academic leaders can manage promotion rule sets"
on public.promotion_rule_sets for all to authenticated
using (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod']))
with check (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod']));

create policy "academic staff can read promotion conditions"
on public.promotion_rule_conditions for select to authenticated
using (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']));

create policy "academic leaders can manage promotion conditions"
on public.promotion_rule_conditions for all to authenticated
using (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod']))
with check (app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod']));

drop trigger if exists promotion_conditions_scope_guard on public.promotion_rule_conditions;
create trigger promotion_conditions_scope_guard before insert or update on public.promotion_rule_conditions
for each row execute function app_private.enforce_parent_scope('promotion_rule_set_id','public.promotion_rule_sets','school_id','required');

create or replace function public.evaluate_promotion_recommendation(
  p_enrolment_id uuid,
  p_promotion_rule_set_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_enrolment public.enrolments%rowtype;
  v_rules public.promotion_rule_sets%rowtype;
  v_condition record;
  v_subject_result numeric;
  v_subject_count integer;
  v_pass_count integer;
  v_fail_count integer;
  v_avg numeric;
  v_attendance_rate numeric;
  v_expected_days integer;
  v_absent_days integer;
  v_failures jsonb := '[]'::jsonb;
  v_checks jsonb := '[]'::jsonb;
  v_pass boolean := true;
  v_condition_pass boolean;
  v_start date;
  v_end date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_enrolment from public.enrolments where id = p_enrolment_id;
  select * into v_rules from public.promotion_rule_sets where id = p_promotion_rule_set_id;
  if v_enrolment.id is null or v_rules.id is null then raise exception 'Enrolment or promotion rule set not found'; end if;
  if v_enrolment.school_id <> v_rules.school_id or v_enrolment.grade_id <> v_rules.grade_id or v_enrolment.academic_year <> v_rules.academic_year then raise exception 'Promotion rule set does not match enrolment scope'; end if;
  if not app_private.has_school_role(v_rules.school_id, array['school_admin','principal','deputy_principal','hod']) then raise exception 'Permission denied'; end if;
  if v_rules.status <> 'active' then raise exception 'Promotion rule set must be active'; end if;

  select count(*), count(*) filter (where coalesce(gsb.pass_classification,'neutral')='pass'), count(*) filter (where coalesce(gsb.pass_classification,'neutral')='fail'), avg(or1.result_value)
  into v_subject_count, v_pass_count, v_fail_count, v_avg
  from public.official_results or1
  left join public.grading_scales gs on gs.school_id=or1.school_id and gs.scale_key=or1.grading_scale_key and gs.version=or1.grading_scale_version
  left join public.grading_scale_bands gsb on gsb.grading_scale_id=gs.id and or1.result_value >= gsb.minimum_value and (gsb.maximum_value is null or or1.result_value <= gsb.maximum_value)
  where or1.enrolment_id=v_enrolment.id and or1.term_number=v_rules.result_term_number;

  for v_condition in select * from public.promotion_rule_conditions where promotion_rule_set_id=v_rules.id order by sort_order, condition_code loop
    v_condition_pass := true;
    if v_condition.condition_type='minimum_subject_result' then
      if nullif(btrim(coalesce(v_condition.subject_code,'')),'') is null or v_condition.threshold is null then raise exception 'Condition % is not fully configured', v_condition.condition_code; end if;
      select or1.result_value into v_subject_result
      from public.official_results or1
      join public.subject_offerings so on so.id=or1.subject_offering_id
      join public.subjects s on s.id=so.subject_id
      where or1.enrolment_id=v_enrolment.id and or1.term_number=v_rules.result_term_number and upper(s.subject_code)=upper(v_condition.subject_code)
      limit 1;
      v_condition_pass := v_subject_result is not null and v_subject_result >= v_condition.threshold;
    elsif v_condition.condition_type='minimum_passed_subjects' then
      if v_condition.threshold is null then raise exception 'Condition % has no threshold', v_condition.condition_code; end if;
      v_condition_pass := v_pass_count >= v_condition.threshold;
    elsif v_condition.condition_type='maximum_failed_subjects' then
      if v_condition.threshold is null then raise exception 'Condition % has no threshold', v_condition.condition_code; end if;
      v_condition_pass := v_fail_count <= v_condition.threshold;
    elsif v_condition.condition_type='minimum_overall_average' then
      if v_condition.threshold is null then raise exception 'Condition % has no threshold', v_condition.condition_code; end if;
      v_condition_pass := v_avg is not null and v_avg >= v_condition.threshold;
    elsif v_condition.condition_type='minimum_attendance_rate' then
      if v_condition.threshold is null then raise exception 'Condition % has no threshold', v_condition.condition_code; end if;
      v_start := coalesce(nullif(v_condition.configuration->>'starts_on','')::date, make_date(v_rules.academic_year,1,1));
      v_end := coalesce(nullif(v_condition.configuration->>'ends_on','')::date, make_date(v_rules.academic_year,12,31));
      select count(*) into v_expected_days from generate_series(v_start,v_end,interval '1 day') d where app_private.is_expected_school_day(v_rules.school_id,d::date);
      select count(distinct ae.attendance_date) into v_absent_days from public.attendance_events ae where ae.enrolment_id=v_enrolment.id and ae.attendance_date between v_start and v_end and ae.observation_type='daily_register' and ae.status='absent';
      v_attendance_rate := case when v_expected_days>0 then ((v_expected_days-v_absent_days)::numeric/v_expected_days)*100 else null end;
      v_condition_pass := v_attendance_rate is not null and v_attendance_rate >= v_condition.threshold;
    elsif v_condition.condition_type='manual_review_required' then
      v_condition_pass := false;
    end if;

    v_checks := v_checks || jsonb_build_array(jsonb_build_object('code',v_condition.condition_code,'type',v_condition.condition_type,'required',v_condition.required,'passed',v_condition_pass,'threshold',v_condition.threshold,'subject_code',v_condition.subject_code));
    if v_condition.required and not v_condition_pass then
      v_pass := false;
      v_failures := v_failures || jsonb_build_array(jsonb_build_object('code',v_condition.condition_code,'type',v_condition.condition_type));
    end if;
  end loop;

  if v_subject_count=0 then
    v_pass := false;
    v_failures := v_failures || jsonb_build_array(jsonb_build_object('code','no_official_results','type','data_readiness'));
  end if;

  return jsonb_build_object(
    'recommended_outcome', case when v_pass then v_rules.pass_outcome else v_rules.fail_outcome end,
    'passed', v_pass,
    'rule_set_key', v_rules.rule_set_key,
    'rule_set_version', v_rules.version,
    'result_term_number', v_rules.result_term_number,
    'subject_count', v_subject_count,
    'passed_subjects', v_pass_count,
    'failed_subjects', v_fail_count,
    'overall_average', v_avg,
    'attendance_rate', v_attendance_rate,
    'checks', v_checks,
    'failures', v_failures
  );
end;
$$;

create or replace function public.generate_year_end_progression(
  p_enrolment_id uuid,
  p_promotion_rule_set_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrolment public.enrolments%rowtype;
  v_rules public.promotion_rule_sets%rowtype;
  v_eval jsonb;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_enrolment from public.enrolments where id=p_enrolment_id;
  select * into v_rules from public.promotion_rule_sets where id=p_promotion_rule_set_id;
  if v_enrolment.id is null or v_rules.id is null then raise exception 'Enrolment or promotion rule set not found'; end if;
  if not app_private.has_school_role(v_enrolment.school_id,array['school_admin','principal','deputy_principal','hod']) then raise exception 'Permission denied'; end if;
  v_eval := public.evaluate_promotion_recommendation(v_enrolment.id,v_rules.id);

  insert into public.year_end_progressions (tenant_id,school_id,learner_id,enrolment_id,academic_year,source_grade_id,outcome,rule_set_key,rule_set_version,rationale,status,decided_by_user_id,decided_at)
  values (v_enrolment.tenant_id,v_enrolment.school_id,v_enrolment.learner_id,v_enrolment.id,v_enrolment.academic_year,v_enrolment.grade_id,(v_eval->>'recommended_outcome'),v_rules.rule_set_key,v_rules.version,v_eval,'reviewed',auth.uid(),now())
  on conflict (enrolment_id) do update
  set outcome=excluded.outcome,rule_set_key=excluded.rule_set_key,rule_set_version=excluded.rule_set_version,rationale=excluded.rationale,status='reviewed',decided_by_user_id=auth.uid(),decided_at=now(),updated_at=now()
  where public.year_end_progressions.status in ('draft','reviewed')
  returning id into v_id;

  if v_id is null then raise exception 'Progression is already approved or locked and cannot be regenerated'; end if;
  insert into public.audit_events (tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values (v_enrolment.tenant_id,v_enrolment.school_id,auth.uid(),'progression.generated','year_end_progression',v_id,v_eval);
  return v_id;
end;
$$;

revoke all on function public.evaluate_promotion_recommendation(uuid,uuid) from public, anon;
grant execute on function public.evaluate_promotion_recommendation(uuid,uuid) to authenticated;
revoke all on function public.generate_year_end_progression(uuid,uuid) from public, anon;
grant execute on function public.generate_year_end_progression(uuid,uuid) to authenticated;

comment on table public.promotion_rule_sets is 'Versioned promotion policy container. Exact Namibia rules must be configured from authoritative policy rather than inferred from grade numbers.';
comment on function public.evaluate_promotion_recommendation(uuid,uuid) is 'Explainable promotion recommendation over locked official results and configured conditions; it does not hard-code Namibia grade rules.';