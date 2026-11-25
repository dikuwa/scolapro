-- #1306 Lane A: historical grading-definition provenance.
--
-- Official results recorded only the grading-scale (key, version) text. Because a
-- scale could previously be returned to draft before the governed-configuration
-- guard existed, a later correction could silently re-grade against a changed
-- band table while still looking "version-matched". This migration:
--
-- 1. records the exact grading definition (precision + ordered bands) used at
--    approval time on the official result, alongside a deterministic fingerprint;
-- 2. refuses a correction whose selected definition differs from the superseded
--    result, and fails closed for legacy results that predate the snapshot;
-- 3. makes a scale and its bands immutable once any approved result references
--    that (key, version), even if the row is still a legacy draft;
-- 4. refuses deletion of a scale referenced by approved results;
-- 5. restores the contributing-instance row locks and term lookup that #1318
--    accidentally dropped, and widens result precision to the configured scale.

drop view if exists public.official_results_current;

alter table public.official_results
  add column if not exists grading_definition_snapshot jsonb,
  add column if not exists grading_definition_fingerprint text;

alter table public.official_results
  add constraint official_results_grading_definition_pair
  check ((grading_definition_snapshot is null) = (grading_definition_fingerprint is null))
  not valid;

-- Precision may be configured up to 4 decimal places; numeric(10,2) silently
-- re-rounded the stored value after the symbol had already been resolved.
alter table public.official_results
  alter column result_value type numeric(10,4);

create view public.official_results_current
with (security_invoker=true)
as
select *
from public.official_results
where superseded_at is null;

revoke all on public.official_results_current from public,anon;
grant select on public.official_results_current to authenticated;

create or replace function app_private.enforce_official_result_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_school_tenant uuid;
  v_enrolment record;
  v_offering record;
begin
  if tg_op = 'DELETE' then
    raise exception 'Official result cannot be deleted; use governed correction workflow';
  end if;

  select tenant_id into v_school_tenant
  from public.schools
  where id = new.school_id;

  if v_school_tenant is null
     or new.tenant_id is distinct from v_school_tenant then
    raise exception 'Official result scope mismatch: school does not belong to tenant';
  end if;

  select tenant_id,school_id,academic_year,learner_id
    into v_enrolment
  from public.enrolments
  where id = new.enrolment_id;

  if not found
     or (new.tenant_id,new.school_id,new.academic_year,new.learner_id)
        is distinct from
        (v_enrolment.tenant_id,v_enrolment.school_id,v_enrolment.academic_year,v_enrolment.learner_id) then
    raise exception 'Official result scope mismatch: enrolment identity differs';
  end if;

  select tenant_id,school_id,academic_year
    into v_offering
  from public.subject_offerings
  where id = new.subject_offering_id;

  if not found
     or (new.tenant_id,new.school_id,new.academic_year)
        is distinct from
        (v_offering.tenant_id,v_offering.school_id,v_offering.academic_year) then
    raise exception 'Official result scope mismatch: subject offering differs';
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null
       and new.approved_by_user_id is distinct from auth.uid() then
      raise exception 'Official result approver must match authenticated actor';
    end if;

    if not app_private.user_is_academic_leader(
      new.approved_by_user_id,
      new.school_id
    ) then
      raise exception 'Official result approver is not authorized for school';
    end if;

    return new;
  end if;

  if new.tenant_id is distinct from old.tenant_id
     or new.school_id is distinct from old.school_id
     or new.academic_year is distinct from old.academic_year
     or new.enrolment_id is distinct from old.enrolment_id
     or new.learner_id is distinct from old.learner_id
     or new.subject_offering_id is distinct from old.subject_offering_id
     or new.term_number is distinct from old.term_number
     or new.result_value is distinct from old.result_value
     or new.result_status is distinct from old.result_status
     or new.symbol is distinct from old.symbol
     or new.assessment_scheme_key is distinct from old.assessment_scheme_key
     or new.assessment_scheme_version is distinct from old.assessment_scheme_version
     or new.academic_rule_set_key is distinct from old.academic_rule_set_key
     or new.academic_rule_set_version is distinct from old.academic_rule_set_version
     or new.calculation_snapshot is distinct from old.calculation_snapshot
     or new.approved_by_user_id is distinct from old.approved_by_user_id
     or new.approved_at is distinct from old.approved_at
     or new.locked_at is distinct from old.locked_at
     or new.grading_scale_key is distinct from old.grading_scale_key
     or new.grading_scale_version is distinct from old.grading_scale_version
     or new.grading_definition_snapshot is distinct from old.grading_definition_snapshot
     or new.grading_definition_fingerprint is distinct from old.grading_definition_fingerprint
     or new.created_at is distinct from old.created_at then
    raise exception 'Official result calculation and approval provenance are immutable';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_official_result_integrity()
  from public, anon, authenticated;

-- A version already used by an approved result is historical evidence: it must
-- never be returned to draft, edited, recreated or deleted, regardless of its
-- current status. This closes the legacy path where a used scale could be
-- returned to draft before the governed-configuration guard existed.
create or replace function app_private.guard_grading_scale_usage_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old_used boolean := false;
  v_new_used boolean := false;
begin
  if tg_op = 'INSERT' then
    select exists(
      select 1 from public.official_results r
      where r.school_id = new.school_id
        and r.grading_scale_key is not distinct from new.scale_key
        and r.grading_scale_version is not distinct from new.version
    ) into v_new_used;
    if v_new_used and new.status = 'draft' then
      raise exception 'A grading scale version already used by approved results cannot be recreated as a draft';
    end if;
    return new;
  end if;

  select exists(
    select 1 from public.official_results r
    where r.school_id = old.school_id
      and r.grading_scale_key is not distinct from old.scale_key
      and r.grading_scale_version is not distinct from old.version
  ) into v_old_used;

  if tg_op = 'DELETE' then
    if v_old_used then
      raise exception 'A grading scale used by approved results cannot be deleted';
    end if;
    return old;
  end if;

  select v_old_used or exists(
    select 1 from public.official_results r
    where r.school_id = new.school_id
      and r.grading_scale_key is not distinct from new.scale_key
      and r.grading_scale_version is not distinct from new.version
  ) into v_new_used;

  if v_new_used then
    if new.status = 'draft' and old.status is distinct from 'draft' then
      raise exception 'A grading scale used by approved results cannot return to draft';
    end if;
    if (new.scale_key,new.version,new.display_name,new.effective_from,new.effective_to,new.decimal_places)
       is distinct from
       (old.scale_key,old.version,old.display_name,old.effective_from,old.effective_to,old.decimal_places) then
      raise exception 'A grading scale used by approved results is immutable; create a new version';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_grading_scale_usage_integrity()
  from public, anon, authenticated;

drop trigger if exists grading_scale_usage_guard on public.grading_scales;
create trigger grading_scale_usage_guard
before insert or update or delete on public.grading_scales
for each row execute function app_private.guard_grading_scale_usage_integrity();

create or replace function app_private.guard_grading_band_usage_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_scale_id uuid;
  v_used boolean;
begin
  v_scale_id := case when tg_op='DELETE' then old.grading_scale_id else new.grading_scale_id end;
  select exists(
    select 1
    from public.grading_scales s
    join public.official_results r
      on r.school_id = s.school_id
     and r.grading_scale_key = s.scale_key
     and r.grading_scale_version = s.version
    where s.id = v_scale_id
  ) into v_used;
  if v_used then
    raise exception 'Bands of a grading scale used by approved results are immutable; create a new version';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

revoke all on function app_private.guard_grading_band_usage_integrity()
  from public, anon, authenticated;

drop trigger if exists grading_band_usage_guard on public.grading_scale_bands;
create trigger grading_band_usage_guard
before insert or update or delete on public.grading_scale_bands
for each row execute function app_private.guard_grading_band_usage_integrity();

-- Same governed approval boundary as #1317/#1318, with the historical
-- definition snapshot, restored mark-correction serialization, and the term
-- resolved from the enrolment's academic year (the year stamped on the result).
create or replace function public.approve_official_subject_result(
  p_assessment_scheme_id uuid,
  p_enrolment_id uuid,
  p_term_number smallint,
  p_grading_scale_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_scheme public.assessment_schemes%rowtype;
  v_enrolment public.enrolments%rowtype;
  v_scale public.grading_scales%rowtype;
  v_previous public.official_results%rowtype;
  v_calc jsonb;
  v_result numeric;
  v_symbol text;
  v_id uuid;
  v_required integer;
  v_verified integer;
  v_correction_authorization_id uuid;
  v_reissue_required boolean:=false;
  v_term_end date;
  v_definition jsonb;
  v_definition_fingerprint text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_scheme
  from public.assessment_schemes
  where id=p_assessment_scheme_id;
  select * into v_enrolment
  from public.enrolments
  where id=p_enrolment_id;
  select * into v_scale
  from public.grading_scales
  where id=p_grading_scale_id;

  if v_scheme.id is null or v_enrolment.id is null or v_scale.id is null then
    raise exception 'Scheme, enrolment or grading scale not found';
  end if;
  if v_scheme.school_id<>v_enrolment.school_id
     or v_scale.school_id<>v_scheme.school_id then
    raise exception 'Academic scope mismatch';
  end if;
  if v_scheme.academic_year is distinct from v_enrolment.academic_year then
    raise exception 'Assessment scheme and enrolment academic year differ';
  end if;
  if not app_private.can_manage_current_assessment_school(v_scheme.school_id) then
    raise exception 'Permission denied';
  end if;

  -- The governing date is the school-configured last day of the result's own
  -- academic year and term, never the approval action date.
  select t.ends_on into v_term_end
  from public.academic_terms t
  join public.academic_years y on y.id=t.academic_year_id
  where t.school_id=v_scheme.school_id
    and y.school_id=v_scheme.school_id
    and y.year=v_enrolment.academic_year
    and t.term_number=p_term_number;
  if v_term_end is null then
    raise exception 'Configure the academic term end date before approving official results';
  end if;
  if v_scale.effective_from>v_term_end
     or (v_scale.effective_to is not null and v_scale.effective_to<v_term_end) then
    raise exception 'The selected grading scale does not cover the academic term end date';
  end if;

  if v_scheme.status not in ('active','superseded') then
    raise exception 'Assessment scheme must be active or historical in-flight';
  end if;
  if not (p_term_number=any(v_scheme.term_numbers)) then
    raise exception 'Assessment scheme is not applicable to term %',p_term_number;
  end if;

  -- Serialize approval with mark corrections and new correction grants. Both
  -- submit_offline_assessment_mark() and authorize_assessment_mark_correction()
  -- lock the contributing instances before writing corrections.
  perform ai.id
  from public.assessment_instances ai
  join public.assessment_components ac on ac.id=ai.assessment_component_id
  where ai.assessment_scheme_id=v_scheme.id
    and ai.register_class_id=v_enrolment.register_class_id
    and ai.term_number=p_term_number
    and ai.status<>'cancelled'
    and ac.contributes_to_report=true
    and p_term_number=any(ac.term_numbers)
  order by ai.id
  for update of ai;

  select count(*) into v_required
  from public.assessment_instances ai
  join public.assessment_components ac on ac.id=ai.assessment_component_id
  where ai.assessment_scheme_id=v_scheme.id
    and ai.register_class_id=v_enrolment.register_class_id
    and ai.term_number=p_term_number
    and ai.status<>'cancelled'
    and ac.contributes_to_report=true
    and ac.required=true
    and p_term_number=any(ac.term_numbers);

  select count(*) into v_verified
  from public.assessment_instances ai
  join public.assessment_components ac on ac.id=ai.assessment_component_id
  where ai.assessment_scheme_id=v_scheme.id
    and ai.register_class_id=v_enrolment.register_class_id
    and ai.term_number=p_term_number
    and ai.status in ('verified','locked')
    and ai.correction_pending=false
    and ac.contributes_to_report=true
    and ac.required=true
    and p_term_number=any(ac.term_numbers);

  if v_required=0 or v_verified<>v_required then
    raise exception 'All required contributing assessments must be verified before official result approval';
  end if;

  if exists(
    select 1
    from public.assessment_instances ai
    join public.assessment_components ac on ac.id=ai.assessment_component_id
    where ai.assessment_scheme_id=v_scheme.id
      and ai.register_class_id=v_enrolment.register_class_id
      and ai.term_number=p_term_number
      and ai.status<>'cancelled'
      and ac.contributes_to_report=true
      and p_term_number=any(ac.term_numbers)
      and ai.correction_pending=true
  ) then
    raise exception 'Contributing assessment corrections require re-verification before official result approval';
  end if;

  v_calc:=public.calculate_subject_result(v_scheme.id,v_enrolment.id,p_term_number);
  if coalesce((v_calc->>'complete')::boolean,false)=false then
    raise exception 'Subject result is incomplete';
  end if;
  v_result:=round((v_calc->>'result_value')::numeric,v_scale.decimal_places);

  select gsb.symbol into v_symbol
  from public.grading_scale_bands gsb
  where gsb.grading_scale_id=v_scale.id
    and v_result>=gsb.minimum_value
    and (gsb.maximum_value is null or v_result<=gsb.maximum_value)
  order by gsb.minimum_value desc
  limit 1;
  if v_symbol is null then
    raise exception 'No grading band covers calculated result %',v_result;
  end if;

  -- Exact definition used for this decision: version identity, configured
  -- precision, effective period and the ordered band table.
  select jsonb_build_object(
    'scale_key',v_scale.scale_key,
    'version',v_scale.version,
    'decimal_places',v_scale.decimal_places,
    'effective_from',v_scale.effective_from,
    'effective_to',v_scale.effective_to,
    'bands',coalesce((
      select jsonb_agg(jsonb_build_object(
        'minimum',b.minimum_value,
        'maximum',b.maximum_value,
        'symbol',b.symbol,
        'classification',coalesce(b.pass_classification,'neutral')
      ) order by b.minimum_value)
      from public.grading_scale_bands b
      where b.grading_scale_id=v_scale.id
    ),'[]'::jsonb)
  ) into v_definition;
  v_definition_fingerprint:=md5(v_definition::text);

  select * into v_previous
  from public.official_results
  where enrolment_id=v_enrolment.id
    and subject_offering_id=v_scheme.subject_offering_id
    and term_number=p_term_number
    and superseded_at is null
  for update;

  if v_previous.id is null then
    if v_scale.status <> 'active' then
      raise exception 'Initial official approval requires an active grading scale';
    end if;
  else
    if v_scale.status not in ('active','superseded','archived')
       or v_scale.scale_key is distinct from v_previous.grading_scale_key
       or v_scale.version is distinct from v_previous.grading_scale_version then
      raise exception 'Corrected official result must reuse its original grading scale version';
    end if;
    -- Never silently re-grade against a changed band table. Legacy results that
    -- predate snapshots cannot prove their original definition, so they fail
    -- closed rather than accepting a potentially different scale.
    if v_previous.grading_definition_fingerprint is null then
      raise exception 'This historical official result predates grading-definition snapshots; the original grading definition cannot be verified for correction';
    end if;
    if v_previous.grading_definition_fingerprint is distinct from v_definition_fingerprint then
      raise exception 'Corrected official result must use its original grading definition';
    end if;
  end if;

  if v_previous.id is not null then
    select reopen.id
      into v_correction_authorization_id
    from public.learner_marks mark
    join public.assessment_instances instance
      on instance.id=mark.assessment_instance_id
    join public.assessment_components corrected_component
      on corrected_component.id=instance.assessment_component_id
    join public.assessment_mark_reopen_authorizations reopen
      on reopen.id=mark.correction_authorization_id
    where mark.enrolment_id=v_enrolment.id
      and instance.assessment_scheme_id=v_scheme.id
      and instance.register_class_id=v_enrolment.register_class_id
      and instance.term_number=p_term_number
      and instance.status in ('verified','locked')
      and instance.correction_pending=false
      and corrected_component.contributes_to_report=true
      and p_term_number=any(corrected_component.term_numbers)
      and reopen.requires_reverification=true
      and mark.recorded_at>v_previous.approved_at
    order by mark.recorded_at desc,mark.id desc
    limit 1;

    if v_correction_authorization_id is null then
      raise exception 'Existing official result requires a governed corrected mark and re-verification before replacement';
    end if;

    select exists(
      select 1
      from public.report_card_snapshots snapshot
      where snapshot.enrolment_id=v_enrolment.id
        and snapshot.term_number=p_term_number
        and snapshot.status='published'
    ) into v_reissue_required;

    update public.official_results
       set superseded_at=now()
     where id=v_previous.id;
  end if;

  insert into public.official_results(
    tenant_id,school_id,academic_year,enrolment_id,learner_id,
    subject_offering_id,term_number,result_value,symbol,
    assessment_scheme_key,assessment_scheme_version,
    grading_scale_key,grading_scale_version,
    grading_definition_snapshot,grading_definition_fingerprint,
    calculation_snapshot,approved_by_user_id,approved_at,locked_at,
    supersedes_result_id,correction_authorization_id
  ) values(
    v_scheme.tenant_id,v_scheme.school_id,v_enrolment.academic_year,
    v_enrolment.id,v_enrolment.learner_id,v_scheme.subject_offering_id,
    p_term_number,v_result,v_symbol,v_scheme.scheme_key,v_scheme.version,
    v_scale.scale_key,v_scale.version,
    v_definition,v_definition_fingerprint,
    v_calc||jsonb_build_object(
      'rounded_result',v_result,
      'symbol',v_symbol,
      'grading_scale_reference_date',v_term_end,
      'grading_scale_reference_basis','academic_term_end',
      'grading_definition_fingerprint',v_definition_fingerprint,
      'correction_authorization_id',v_correction_authorization_id,
      'supersedes_result_id',v_previous.id
    ),
    auth.uid(),now(),now(),
    v_previous.id,v_correction_authorization_id
  )
  returning id into v_id;

  if v_previous.id is not null then
    update public.official_results
       set superseded_by_result_id=v_id
     where id=v_previous.id;
  end if;

  update public.assessment_instances
     set status='locked',
         locked_at=coalesce(locked_at,now()),
         updated_at=now()
   where assessment_scheme_id=v_scheme.id
     and register_class_id=v_enrolment.register_class_id
     and term_number=p_term_number
     and status='verified';

  update public.mark_submissions ms
     set status='locked'
   where ms.assessment_instance_id in (
     select ai.id
     from public.assessment_instances ai
     where ai.assessment_scheme_id=v_scheme.id
       and ai.register_class_id=v_enrolment.register_class_id
       and ai.term_number=p_term_number
   )
     and ms.status='verified';

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_scheme.tenant_id,v_scheme.school_id,auth.uid(),
    case when v_previous.id is null then 'official_result.approved' else 'official_result.corrected' end,
    'official_result',v_id,
    jsonb_build_object(
      'enrolment_id',v_enrolment.id,
      'subject_offering_id',v_scheme.subject_offering_id,
      'term_number',p_term_number,
      'result',v_result,
      'symbol',v_symbol,
      'scheme_version',v_scheme.version,
      'grading_scale_version',v_scale.version,
      'grading_definition_fingerprint',v_definition_fingerprint,
      'grading_scale_reference_date',v_term_end,
      'grading_scale_reference_basis','academic_term_end',
      'supersedes_result_id',v_previous.id,
      'correction_authorization_id',v_correction_authorization_id,
      'report_reissue_required',v_reissue_required
    )
  );

  if v_reissue_required then
    insert into public.audit_events(
      tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
    ) values(
      v_scheme.tenant_id,v_scheme.school_id,auth.uid(),
      'report_card.reissue_required','official_result',v_id,
      jsonb_build_object(
        'enrolment_id',v_enrolment.id,
        'term_number',p_term_number,
        'superseded_result_id',v_previous.id,
        'corrected_result_id',v_id
      )
    );
  end if;

  return v_id;
end;
$$;

revoke all on function public.approve_official_subject_result(uuid,uuid,smallint,uuid)
  from public,anon;
grant execute on function public.approve_official_subject_result(uuid,uuid,smallint,uuid)
  to authenticated;

comment on function public.approve_official_subject_result(uuid,uuid,smallint,uuid) is
'Governed official-result approval and corrected reapproval. Records the exact grading definition used, refuses a correction that differs from the superseded definition, fails closed for legacy results without a snapshot, and serializes contributing marks.';
