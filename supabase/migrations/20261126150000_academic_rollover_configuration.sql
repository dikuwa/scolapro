-- Academic rollover configuration/readiness over the canonical grade, register-class
-- and promotion-rule records. No grade thresholds or statutory outcomes are inferred.

create or replace function public.get_academic_rollover_readiness(
  p_school_id uuid,
  p_academic_year integer
)
returns table(
  source_grade_id uuid,
  source_grade_code text,
  source_grade_name text,
  next_academic_year integer,
  next_year_configured boolean,
  next_grade_count integer,
  next_register_class_count integer,
  active_rule_set_id uuid,
  active_rule_set_key text,
  active_rule_set_version text,
  ready boolean,
  blockers jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $rollover_readiness$
declare
  v_next_year integer := p_academic_year + 1;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_school_id is null or p_academic_year is null then raise exception 'School and academic year are required'; end if;
  if not app_private.has_school_local_role(p_school_id, array['school_admin','principal','deputy_principal']) then
    raise exception 'Permission denied';
  end if;

  return query
  with source_grades as (
    select g.id, g.grade_code, g.display_name
    from public.grades g
    where g.school_id = p_school_id and g.academic_year = p_academic_year
  ),
  next_counts as (
    select sg.id,
      count(distinct ng.id)::integer as grade_count,
      count(distinct rc.id)::integer as class_count
    from source_grades sg
    left join public.grades ng
      on ng.school_id = p_school_id and ng.academic_year = v_next_year
     and upper(ng.grade_code) = upper(sg.grade_code)
    left join public.register_classes rc on rc.school_id = p_school_id
      and rc.academic_year = v_next_year and rc.grade_id = ng.id
    group by sg.id
  ),
  active_rules as (
    select distinct on (prs.grade_id) prs.grade_id, prs.id, prs.rule_set_key, prs.version
    from public.promotion_rule_sets prs
    where prs.school_id = p_school_id and prs.academic_year = p_academic_year and prs.status = 'active'
    order by prs.grade_id, prs.updated_at desc, prs.id
  )
  select sg.id, sg.grade_code, sg.display_name, v_next_year,
    exists(select 1 from public.academic_years ay where ay.school_id=p_school_id and ay.year=v_next_year),
    nc.grade_count, nc.class_count, ar.id, ar.rule_set_key, ar.version,
    (exists(select 1 from public.academic_years ay where ay.school_id=p_school_id and ay.year=v_next_year)
      and nc.grade_count > 0 and nc.class_count > 0 and ar.id is not null),
    jsonb_path_query_array(jsonb_build_array(
      case when not exists(select 1 from public.academic_years ay where ay.school_id=p_school_id and ay.year=v_next_year)
        then jsonb_build_object('code','missing_next_academic_year','configuration_kind','academic_year','configuration_year',v_next_year) end,
      case when nc.grade_count = 0
        then jsonb_build_object('code','missing_next_grade','configuration_kind','grade','configuration_year',v_next_year,'source_grade_id',sg.id) end,
      case when nc.class_count = 0
        then jsonb_build_object('code','missing_next_register_class','configuration_kind','register_class','configuration_year',v_next_year,'source_grade_id',sg.id) end,
      case when ar.id is null
        then jsonb_build_object('code','missing_active_promotion_rule_set','configuration_kind','promotion_rule_set','configuration_year',p_academic_year,'source_grade_id',sg.id) end
    ), '$[*] ? (@ != null)')
  from source_grades sg
  join next_counts nc on nc.id=sg.id
  left join active_rules ar on ar.grade_id=sg.id
  order by sg.grade_code;
end;
$rollover_readiness$;

revoke all on function public.get_academic_rollover_readiness(uuid,integer) from public, anon;
grant execute on function public.get_academic_rollover_readiness(uuid,integer) to authenticated;

create or replace function public.create_promotion_rule_set_version(
  p_school_id uuid,
  p_academic_year integer,
  p_grade_id uuid,
  p_rule_set_key text,
  p_version text,
  p_result_term_number smallint,
  p_pass_outcome text,
  p_fail_outcome text,
  p_source_reference text,
  p_effective_from date,
  p_effective_to date default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $create_rule_version$
declare
  v_school public.schools%rowtype;
  v_grade public.grades%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_school_local_role(p_school_id, array['school_admin','principal','deputy_principal','hod']) then raise exception 'Permission denied'; end if;
  if nullif(btrim(coalesce(p_rule_set_key,'')),'') is null or nullif(btrim(coalesce(p_version,'')),'') is null then raise exception 'Rule-set key and version are required'; end if;
  select * into v_school from public.schools where id=p_school_id and status='active';
  select * into v_grade from public.grades where id=p_grade_id and school_id=p_school_id and academic_year=p_academic_year;
  if v_school.id is null or v_grade.id is null then raise exception 'Grade does not match school and academic year'; end if;
  if p_effective_to is not null and p_effective_to < p_effective_from then raise exception 'Effective period is invalid'; end if;

  insert into public.promotion_rule_sets(
    tenant_id,school_id,academic_year,grade_id,rule_set_key,version,result_term_number,
    pass_outcome,fail_outcome,source_reference,effective_from,effective_to,status,created_by_user_id
  ) values (
    v_school.tenant_id,p_school_id,p_academic_year,p_grade_id,btrim(p_rule_set_key),btrim(p_version),p_result_term_number,
    p_pass_outcome,p_fail_outcome,nullif(btrim(coalesce(p_source_reference,'')),''),p_effective_from,p_effective_to,'draft',auth.uid()
  ) returning id into v_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_school.tenant_id,p_school_id,auth.uid(),'promotion_rule_set.created','promotion_rule_set',v_id,
    jsonb_build_object('academic_year',p_academic_year,'grade_id',p_grade_id,'rule_set_key',btrim(p_rule_set_key),'version',btrim(p_version)));
  return v_id;
end;
$create_rule_version$;

revoke all on function public.create_promotion_rule_set_version(uuid,integer,uuid,text,text,smallint,text,text,text,date,date) from public, anon;
grant execute on function public.create_promotion_rule_set_version(uuid,integer,uuid,text,text,smallint,text,text,text,date,date) to authenticated;

create or replace function public.add_promotion_rule_condition(
  p_promotion_rule_set_id uuid,
  p_condition_code text,
  p_condition_type text,
  p_subject_code text default null,
  p_threshold numeric default null,
  p_required boolean default true,
  p_configuration jsonb default '{}'::jsonb,
  p_sort_order integer default 100
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $add_rule_condition$
declare
  v_rule public.promotion_rule_sets%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_rule from public.promotion_rule_sets where id=p_promotion_rule_set_id;
  if v_rule.id is null then raise exception 'Promotion rule set not found'; end if;
  if not app_private.has_school_local_role(v_rule.school_id, array['school_admin','principal','deputy_principal','hod']) then raise exception 'Permission denied'; end if;
  if v_rule.status <> 'draft' then raise exception 'Conditions can only be added to a draft promotion rule version'; end if;
  if nullif(btrim(coalesce(p_condition_code,'')),'') is null then raise exception 'Condition code is required'; end if;
  insert into public.promotion_rule_conditions(tenant_id,school_id,promotion_rule_set_id,condition_code,condition_type,subject_code,threshold,required,configuration,sort_order)
  values(v_rule.tenant_id,v_rule.school_id,v_rule.id,btrim(p_condition_code),p_condition_type,nullif(btrim(coalesce(p_subject_code,'')),''),p_threshold,p_required,coalesce(p_configuration,'{}'::jsonb),p_sort_order)
  returning id into v_id;
  return v_id;
end;
$add_rule_condition$;

revoke all on function public.add_promotion_rule_condition(uuid,text,text,text,numeric,boolean,jsonb,integer) from public, anon;
grant execute on function public.add_promotion_rule_condition(uuid,text,text,text,numeric,boolean,jsonb,integer) to authenticated;

drop policy if exists "academic leaders can manage promotion rule sets" on public.promotion_rule_sets;
drop policy if exists "academic leaders can manage promotion conditions" on public.promotion_rule_conditions;

create or replace function public.activate_promotion_rule_set(p_rule_set_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $activate_rule_set$
declare
  v_rule public.promotion_rule_sets%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_rule from public.promotion_rule_sets where id=p_rule_set_id for update;
  if v_rule.id is null then raise exception 'Promotion rule set not found'; end if;
  if not app_private.has_school_local_role(v_rule.school_id, array['school_admin','principal','deputy_principal']) then raise exception 'Permission denied'; end if;
  if v_rule.status <> 'draft' then raise exception 'Only draft promotion rule versions can be activated'; end if;
  if not exists(select 1 from public.promotion_rule_conditions where promotion_rule_set_id=v_rule.id) then raise exception 'At least one promotion rule condition is required'; end if;

  update public.promotion_rule_sets
  set status='superseded', updated_at=now()
  where school_id=v_rule.school_id and academic_year=v_rule.academic_year and grade_id=v_rule.grade_id
    and rule_set_key=v_rule.rule_set_key and status='active' and id<>v_rule.id;
  update public.promotion_rule_sets set status='active', updated_at=now() where id=v_rule.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_rule.tenant_id,v_rule.school_id,auth.uid(),'promotion_rule_set.activated','promotion_rule_set',v_rule.id,
    jsonb_build_object('rule_set_key',v_rule.rule_set_key,'version',v_rule.version,'academic_year',v_rule.academic_year,'grade_id',v_rule.grade_id));
  return true;
end;
$activate_rule_set$;

revoke all on function public.activate_promotion_rule_set(uuid) from public, anon;
grant execute on function public.activate_promotion_rule_set(uuid) to authenticated;

comment on function public.get_academic_rollover_readiness(uuid,integer) is 'Readiness projection for year-end rollover using configured next-year academic structure and active versioned promotion rules; blockers identify the canonical configuration record that must be supplied.';
comment on function public.activate_promotion_rule_set(uuid) is 'Governed promotion-rule activation: draft-only, condition-required, audited, and supersedes the prior active version for the same school/year/grade/key.';
