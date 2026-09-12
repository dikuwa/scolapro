-- Promotion evaluation is a learner-sensitive SECURITY DEFINER read path. Keep the
-- existing evaluation implementation intact, but place a deterministic current-school
-- and current/effective-enrolment authorization boundary in front of it.

alter function public.evaluate_promotion_recommendation(uuid,uuid)
  rename to evaluate_promotion_recommendation_scoped_engine;

revoke all on function public.evaluate_promotion_recommendation_scoped_engine(uuid,uuid)
  from public, anon, authenticated;

create or replace function public.evaluate_promotion_recommendation(
  p_enrolment_id uuid,
  p_promotion_rule_set_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_enrolment public.enrolments%rowtype;
  v_rules public.promotion_rule_sets%rowtype;
  v_today date := (now() at time zone 'Africa/Windhoek')::date;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_enrolment
  from public.enrolments
  where id=p_enrolment_id;

  select * into v_rules
  from public.promotion_rule_sets
  where id=p_promotion_rule_set_id;

  if v_enrolment.id is null or v_rules.id is null then
    raise exception 'Enrolment or promotion rule set not found';
  end if;

  if v_enrolment.school_id<>v_rules.school_id
     or v_enrolment.grade_id<>v_rules.grade_id
     or v_enrolment.academic_year<>v_rules.academic_year then
    raise exception 'Promotion rule set does not match enrolment scope';
  end if;

  if not app_private.has_school_local_role(
    v_rules.school_id,
    array['school_admin','principal','deputy_principal','hod']
  ) then
    raise exception 'Permission denied';
  end if;

  if v_enrolment.status<>'current'
     or v_enrolment.enrolled_from>v_today
     or (v_enrolment.enrolled_to is not null and v_enrolment.enrolled_to<v_today) then
    raise exception 'Only a current effective enrolment can be evaluated for progression';
  end if;

  return public.evaluate_promotion_recommendation_scoped_engine(
    p_enrolment_id,
    p_promotion_rule_set_id
  );
end;
$$;

revoke all on function public.evaluate_promotion_recommendation(uuid,uuid)
  from public, anon;
grant execute on function public.evaluate_promotion_recommendation(uuid,uuid)
  to authenticated;

comment on function public.evaluate_promotion_recommendation(uuid,uuid) is
'Promotion recommendation boundary: learner-sensitive evaluation is restricted to the actor deterministic current school and a current/effective enrolment; the existing versioned rule engine remains unchanged behind this wrapper.';

comment on function public.evaluate_promotion_recommendation_scoped_engine(uuid,uuid) is
'Internal promotion evaluation implementation retained unchanged. Direct authenticated execution is revoked; use evaluate_promotion_recommendation().';