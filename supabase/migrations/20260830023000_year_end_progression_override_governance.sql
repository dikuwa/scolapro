-- Preserve the promotion engine recommendation separately from any human ruling.
-- Manual exceptions remain possible, but must carry a reason and actor provenance.

alter table public.year_end_progressions
  add column if not exists recommended_outcome text,
  add column if not exists override_reason text,
  add column if not exists overridden_by_user_id uuid,
  add column if not exists overridden_at timestamptz;

update public.year_end_progressions
set recommended_outcome = outcome
where recommended_outcome is null;

create or replace function app_private.guard_year_end_progression_override_provenance()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
begin
  if new.recommended_outcome is null then
    new.recommended_outcome := new.outcome;
  end if;

  if tg_op = 'UPDATE' and current_user = 'authenticated' then
    if new.recommended_outcome is distinct from old.recommended_outcome
       or new.rule_set_key is distinct from old.rule_set_key
       or new.rule_set_version is distinct from old.rule_set_version
       or new.rationale is distinct from old.rationale then
      raise exception 'Promotion recommendation provenance may only be changed by the promotion engine';
    end if;
  end if;

  if new.outcome is distinct from new.recommended_outcome then
    if nullif(btrim(coalesce(new.override_reason,'')),'') is null then
      raise exception 'A reason is required when overriding the promotion recommendation';
    end if;
    if auth.uid() is null then
      raise exception 'Promotion overrides require an authenticated actor';
    end if;
    new.override_reason := btrim(new.override_reason);
    new.overridden_by_user_id := auth.uid();
    new.overridden_at := coalesce(new.overridden_at, now());
  else
    new.override_reason := null;
    new.overridden_by_user_id := null;
    new.overridden_at := null;
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_year_end_progression_override_provenance() from public,anon,authenticated;

drop trigger if exists year_end_progression_override_provenance_guard on public.year_end_progressions;
create trigger year_end_progression_override_provenance_guard
before insert or update on public.year_end_progressions
for each row execute function app_private.guard_year_end_progression_override_provenance();

create or replace function public.generate_year_end_progression(p_enrolment_id uuid, p_promotion_rule_set_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
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

  v_eval:=public.evaluate_promotion_recommendation(v_enrolment.id,v_rules.id);

  insert into public.year_end_progressions(
    tenant_id,school_id,learner_id,enrolment_id,academic_year,source_grade_id,
    outcome,recommended_outcome,rule_set_key,rule_set_version,rationale,status,
    decided_by_user_id,decided_at,override_reason,overridden_by_user_id,overridden_at
  ) values (
    v_enrolment.tenant_id,v_enrolment.school_id,v_enrolment.learner_id,v_enrolment.id,
    v_enrolment.academic_year,v_enrolment.grade_id,v_eval->>'recommended_outcome',
    v_eval->>'recommended_outcome',v_rules.rule_set_key,v_rules.version,v_eval,'reviewed',
    auth.uid(),now(),null,null,null
  )
  on conflict (enrolment_id) do update set
    outcome=excluded.outcome,
    recommended_outcome=excluded.recommended_outcome,
    rule_set_key=excluded.rule_set_key,
    rule_set_version=excluded.rule_set_version,
    rationale=excluded.rationale,
    status='reviewed',
    decided_by_user_id=auth.uid(),
    decided_at=now(),
    override_reason=null,
    overridden_by_user_id=null,
    overridden_at=null,
    updated_at=now()
  where public.year_end_progressions.status in ('draft','reviewed')
  returning id into v_id;

  if v_id is null then raise exception 'Progression is already approved or locked and cannot be regenerated'; end if;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_enrolment.tenant_id,v_enrolment.school_id,auth.uid(),'progression.generated','year_end_progression',v_id,v_eval);
  return v_id;
end;
$$;

create or replace function public.override_year_end_progression(
  p_progression_id uuid,
  p_outcome text,
  p_reason text,
  p_destination_grade_code text default null
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_progression public.year_end_progressions%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(coalesce(p_outcome,'')),'') is null then raise exception 'Override outcome is required'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Override reason is required'; end if;

  select * into v_progression from public.year_end_progressions where id=p_progression_id for update;
  if not found then raise exception 'Progression decision not found'; end if;
  if not app_private.has_school_role(v_progression.school_id,array['school_admin','principal','deputy_principal','hod']) then raise exception 'Permission denied'; end if;
  if v_progression.status<>'reviewed' then raise exception 'Only reviewed progression decisions can be overridden'; end if;
  if btrim(p_outcome)=coalesce(v_progression.recommended_outcome,v_progression.outcome)
     and nullif(btrim(coalesce(p_destination_grade_code,'')),'') is not distinct from nullif(btrim(coalesce(v_progression.destination_grade_code,'')),'') then
    raise exception 'Override must change the recommended outcome or destination';
  end if;

  update public.year_end_progressions
  set outcome=btrim(p_outcome),
      destination_grade_code=nullif(btrim(coalesce(p_destination_grade_code,'')),''),
      override_reason=btrim(p_reason),
      overridden_by_user_id=auth.uid(),
      overridden_at=now(),
      decided_by_user_id=auth.uid(),
      decided_at=now(),
      updated_at=now()
  where id=v_progression.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_progression.tenant_id,v_progression.school_id,auth.uid(),'progression.overridden','year_end_progression',v_progression.id,
    jsonb_build_object('recommended_outcome',coalesce(v_progression.recommended_outcome,v_progression.outcome),'override_outcome',btrim(p_outcome),'reason',btrim(p_reason),'destination_grade_code',nullif(btrim(coalesce(p_destination_grade_code,'')),'')));
  return true;
end;
$$;

revoke all on function public.override_year_end_progression(uuid,text,text,text) from public,anon;
grant execute on function public.override_year_end_progression(uuid,text,text,text) to authenticated;

create or replace function public.approve_year_end_progression(p_progression_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_progression public.year_end_progressions%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_progression from public.year_end_progressions where id=p_progression_id for update;
  if not found then raise exception 'Progression decision not found'; end if;
  if not app_private.has_school_role(v_progression.school_id,array['school_admin','principal','deputy_principal']) then raise exception 'Permission denied'; end if;
  if v_progression.status<>'reviewed' then raise exception 'Only reviewed progression decisions can be approved'; end if;

  if v_progression.outcome is distinct from coalesce(v_progression.recommended_outcome,v_progression.outcome) then
    if nullif(btrim(coalesce(v_progression.override_reason,'')),'') is null
       or v_progression.overridden_by_user_id is null
       or v_progression.overridden_at is null then
      raise exception 'Overridden progression decision is missing override provenance';
    end if;
  end if;

  update public.year_end_progressions
  set status='approved',decided_by_user_id=auth.uid(),decided_at=now(),updated_at=now()
  where id=v_progression.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_progression.tenant_id,v_progression.school_id,auth.uid(),'progression.approved','year_end_progression',v_progression.id,
    jsonb_build_object('outcome',v_progression.outcome,'recommended_outcome',coalesce(v_progression.recommended_outcome,v_progression.outcome),'rule_set_key',v_progression.rule_set_key,'rule_set_version',v_progression.rule_set_version,'override_reason',v_progression.override_reason,'overridden_by_user_id',v_progression.overridden_by_user_id,'overridden_at',v_progression.overridden_at));
  return true;
end;
$$;

comment on column public.year_end_progressions.recommended_outcome is 'Promotion-engine recommendation preserved independently from any authorized manual ruling.';
comment on column public.year_end_progressions.override_reason is 'Mandatory reason when the final working outcome differs from the engine recommendation.';
