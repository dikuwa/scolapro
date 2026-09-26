-- Issue #684: syllabus-derived assessment scheme configuration with three-term support.
-- Extends the canonical assessment_schemes / assessment_components lifecycle.

alter table public.assessment_schemes
  add column if not exists academic_year integer check (academic_year between 2000 and 2200),
  add column if not exists curriculum_version_id uuid references public.curriculum_versions(id) on delete restrict,
  add column if not exists term_numbers smallint[] not null default array[1,2,3]::smallint[],
  add column if not exists source_provenance jsonb not null default '{}'::jsonb,
  add column if not exists verified_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists verified_at timestamptz;

alter table public.assessment_components
  add column if not exists term_numbers smallint[] not null default array[1,2,3]::smallint[],
  add column if not exists calculation_method text not null default 'weighted'
    check (calculation_method in ('weighted','raw_total','direct')),
  add column if not exists moderation_required boolean not null default false,
  add column if not exists moderation_metadata jsonb not null default '{}'::jsonb;

create table if not exists public.assessment_scheme_candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  subject_offering_id uuid not null references public.subject_offerings(id) on delete cascade,
  curriculum_version_id uuid not null references public.curriculum_versions(id) on delete restrict,
  curriculum_source_id uuid references public.curriculum_sources(id) on delete restrict,
  source_kind text not null check (source_kind in ('curriculum_metadata','manual')),
  source_snapshot jsonb not null default '{}'::jsonb,
  candidate jsonb not null default '{}'::jsonb,
  status text not null default 'candidate'
    check (status in ('candidate','verified','rejected','published')),
  extracted_by_user_id uuid references auth.users(id) on delete set null,
  verified_by_user_id uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  verification_note text,
  published_scheme_id uuid references public.assessment_schemes(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assessment_scheme_candidates_scope_idx
  on public.assessment_scheme_candidates(school_id,subject_offering_id,academic_year,status,created_at desc);
create index if not exists assessment_schemes_curriculum_version_idx
  on public.assessment_schemes(curriculum_version_id,academic_year,status);

alter table public.assessment_scheme_candidates enable row level security;

create policy "academic staff can read assessment scheme candidates"
on public.assessment_scheme_candidates for select to authenticated
using (
  app_private.has_school_role(
    school_id,
    array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']
  )
);

create policy "academic leaders can manage assessment scheme candidates"
on public.assessment_scheme_candidates for all to authenticated
using (
  app_private.has_school_role(
    school_id,
    array['school_admin','principal','deputy_principal','hod']
  )
)
with check (
  app_private.has_school_role(
    school_id,
    array['school_admin','principal','deputy_principal','hod']
  )
);

create or replace function app_private.valid_three_term_array(p_terms smallint[])
returns boolean
language sql immutable
as $$
  select coalesce(array_length(p_terms,1),0) > 0
    and not exists (
      select 1 from unnest(p_terms) term_number
      where term_number not between 1 and 3
    )
    and cardinality(p_terms)=cardinality(array(select distinct x from unnest(p_terms) x));
$$;

revoke all on function app_private.valid_three_term_array(smallint[]) from public,anon,authenticated;

alter table public.assessment_schemes
  drop constraint if exists assessment_schemes_three_term_check,
  add constraint assessment_schemes_three_term_check
    check (app_private.valid_three_term_array(term_numbers));

alter table public.assessment_components
  drop constraint if exists assessment_components_three_term_check,
  add constraint assessment_components_three_term_check
    check (app_private.valid_three_term_array(term_numbers));

create or replace function app_private.enforce_assessment_scheme_curriculum_binding()
returns trigger
language plpgsql security definer
set search_path=pg_catalog,public
as $$
declare
  v_offering record;
begin
  select so.tenant_id,so.school_id,so.academic_year,so.curriculum_version_id
    into v_offering
    from public.subject_offerings so
   where so.id=new.subject_offering_id;

  if v_offering.tenant_id is null then
    raise exception 'Assessment scheme subject offering does not exist';
  end if;

  if row(new.tenant_id,new.school_id)
     is distinct from row(v_offering.tenant_id,v_offering.school_id) then
    raise exception 'Assessment scheme scope mismatch: subject offering does not belong to school';
  end if;

  if new.academic_year is null then new.academic_year:=v_offering.academic_year; end if;
  if new.curriculum_version_id is null then new.curriculum_version_id:=v_offering.curriculum_version_id; end if;

  if new.academic_year is distinct from v_offering.academic_year then
    raise exception 'Assessment scheme academic year does not match subject offering';
  end if;
  if v_offering.curriculum_version_id is not null
     and new.curriculum_version_id is distinct from v_offering.curriculum_version_id then
    raise exception 'Assessment scheme curriculum version does not match subject offering';
  end if;

  if tg_op='UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.subject_offering_id is distinct from old.subject_offering_id
    or new.academic_year is distinct from old.academic_year
    or new.curriculum_version_id is distinct from old.curriculum_version_id
  ) then
    raise exception 'Assessment scheme subject/grade/version provenance is immutable';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_assessment_scheme_curriculum_binding() from public,anon,authenticated;

drop trigger if exists assessment_scheme_curriculum_binding_trg on public.assessment_schemes;
create trigger assessment_scheme_curriculum_binding_trg
before insert or update on public.assessment_schemes
for each row execute function app_private.enforce_assessment_scheme_curriculum_binding();

create or replace function app_private.enforce_assessment_scheme_candidate_integrity()
returns trigger
language plpgsql security definer
set search_path=pg_catalog,public
as $$
declare
  v_offering record;
  v_source_id uuid;
begin
  select so.tenant_id,so.school_id,so.academic_year,so.curriculum_version_id,cv.source_id
    into v_offering
    from public.subject_offerings so
    join public.curriculum_versions cv on cv.id=so.curriculum_version_id
   where so.id=new.subject_offering_id;

  if v_offering.tenant_id is null then
    raise exception 'Assessment candidate requires a subject offering with curriculum version';
  end if;
  if row(new.tenant_id,new.school_id,new.academic_year,new.curriculum_version_id)
     is distinct from
     row(v_offering.tenant_id,v_offering.school_id,v_offering.academic_year,v_offering.curriculum_version_id) then
    raise exception 'Assessment candidate scope/version does not match subject offering';
  end if;

  v_source_id:=v_offering.source_id;
  if new.curriculum_source_id is null then new.curriculum_source_id:=v_source_id; end if;
  if v_source_id is not null and new.curriculum_source_id is distinct from v_source_id then
    raise exception 'Assessment candidate curriculum source does not match version provenance';
  end if;

  if tg_op='UPDATE' and old.status in ('published','rejected') and new is distinct from old then
    raise exception 'Final assessment candidate cannot be rewritten';
  end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_assessment_scheme_candidate_integrity() from public,anon,authenticated;

drop trigger if exists assessment_scheme_candidate_integrity_trg on public.assessment_scheme_candidates;
create trigger assessment_scheme_candidate_integrity_trg
before insert or update on public.assessment_scheme_candidates
for each row execute function app_private.enforce_assessment_scheme_candidate_integrity();

create or replace function public.extract_assessment_scheme_candidate(p_subject_offering_id uuid)
returns uuid
language plpgsql security definer
set search_path=pg_catalog,public,app_private,auth
as $$
declare
  v_offering record;
  v_version record;
  v_candidate jsonb;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select so.id,so.tenant_id,so.school_id,so.academic_year,so.curriculum_version_id
    into v_offering
    from public.subject_offerings so
   where so.id=p_subject_offering_id;
  if v_offering.id is null or v_offering.curriculum_version_id is null then
    raise exception 'Subject offering requires an authoritative curriculum version';
  end if;
  if not app_private.has_school_role(
      v_offering.school_id,array['school_admin','principal','deputy_principal','hod']
  ) then
    raise exception 'Academic leadership authority required';
  end if;

  select cv.id,cv.version_key,cv.source_id,cv.metadata,cv.status,cs.authority,cs.source_key,cs.title,cs.checksum
    into v_version
    from public.curriculum_versions cv
    left join public.curriculum_sources cs on cs.id=cv.source_id
   where cv.id=v_offering.curriculum_version_id;

  if v_version.status not in ('approved','published','superseded') then
    raise exception 'Curriculum version is not verified for assessment extraction';
  end if;

  v_candidate:=coalesce(v_version.metadata->'assessmentScheme',v_version.metadata->'assessment_scheme');
  if v_candidate is null or jsonb_typeof(v_candidate)<>'object' then
    raise exception 'No structured assessment configuration is available in this curriculum version';
  end if;

  insert into public.assessment_scheme_candidates(
    tenant_id,school_id,academic_year,subject_offering_id,curriculum_version_id,
    curriculum_source_id,source_kind,source_snapshot,candidate,extracted_by_user_id
  ) values(
    v_offering.tenant_id,v_offering.school_id,v_offering.academic_year,p_subject_offering_id,
    v_offering.curriculum_version_id,v_version.source_id,'curriculum_metadata',
    jsonb_build_object(
      'curriculumVersion',v_version.version_key,
      'sourceAuthority',v_version.authority,
      'sourceKey',v_version.source_key,
      'sourceTitle',v_version.title,
      'sourceChecksum',v_version.checksum
    ),
    v_candidate,auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.verify_assessment_scheme_candidate(
  p_candidate_id uuid,
  p_note text default null
)
returns boolean
language plpgsql security definer
set search_path=pg_catalog,public,app_private,auth
as $$
declare
  v_candidate public.assessment_scheme_candidates%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_candidate from public.assessment_scheme_candidates where id=p_candidate_id for update;
  if not found then raise exception 'Assessment candidate not found'; end if;
  if not app_private.has_school_role(
      v_candidate.school_id,array['school_admin','principal','deputy_principal','hod']
  ) then
    raise exception 'Academic leadership authority required';
  end if;
  if v_candidate.status<>'candidate' then raise exception 'Only candidate assessment configuration can be verified'; end if;

  update public.assessment_scheme_candidates
     set status='verified',verified_by_user_id=auth.uid(),verified_at=now(),
         verification_note=nullif(btrim(coalesce(p_note,'')),''),
         updated_at=now()
   where id=p_candidate_id;
  return true;
end;
$$;

create or replace function public.publish_assessment_scheme_candidate(p_candidate_id uuid)
returns uuid
language plpgsql security definer
set search_path=pg_catalog,public,app_private,auth
as $$
declare
  v_candidate public.assessment_scheme_candidates%rowtype;
  v_scheme_id uuid;
  v_capture_mode text;
  v_scheme_key text;
  v_version text;
  v_terms smallint[];
  v_component jsonb;
  v_index integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_candidate from public.assessment_scheme_candidates where id=p_candidate_id for update;
  if not found then raise exception 'Assessment candidate not found'; end if;
  if not app_private.has_school_role(
      v_candidate.school_id,array['school_admin','principal','deputy_principal','hod']
  ) then
    raise exception 'Academic leadership authority required';
  end if;
  if v_candidate.status<>'verified' or v_candidate.verified_by_user_id is null or v_candidate.verified_at is null then
    raise exception 'Human verification is required before assessment scheme publication';
  end if;

  v_capture_mode:=coalesce(v_candidate.candidate->>'captureMode',v_candidate.candidate->>'capture_mode','detailed');
  if v_capture_mode not in ('detailed','final_result') then raise exception 'Candidate capture mode is invalid'; end if;
  v_scheme_key:=coalesce(nullif(v_candidate.candidate->>'schemeKey',''),nullif(v_candidate.candidate->>'scheme_key',''),'curriculum');
  v_version:=coalesce(nullif(v_candidate.candidate->>'version',''),to_char(now(),'YYYYMMDDHH24MISS'));
  select coalesce(array_agg(value::smallint),'{}'::smallint[]) into v_terms
    from jsonb_array_elements_text(coalesce(v_candidate.candidate->'termNumbers',v_candidate.candidate->'term_numbers','[1,2,3]'::jsonb));
  if not app_private.valid_three_term_array(v_terms) then raise exception 'Candidate term applicability must use terms 1 to 3'; end if;

  update public.assessment_schemes
     set status='superseded',
         effective_to=case when effective_from<current_date then current_date-1 else effective_from end,
         updated_at=now()
   where subject_offering_id=v_candidate.subject_offering_id
     and scheme_key=v_scheme_key
     and status='active';

  insert into public.assessment_schemes(
    tenant_id,school_id,subject_offering_id,scheme_key,version,capture_mode,
    effective_from,status,configuration,created_by_user_id,academic_year,
    curriculum_version_id,term_numbers,source_provenance,verified_by_user_id,verified_at
  ) values(
    v_candidate.tenant_id,v_candidate.school_id,v_candidate.subject_offering_id,
    v_scheme_key,v_version,v_capture_mode,make_date(v_candidate.academic_year,1,1),
    'active',coalesce(v_candidate.candidate->'configuration','{}'::jsonb),auth.uid(),
    v_candidate.academic_year,v_candidate.curriculum_version_id,v_terms,
    v_candidate.source_snapshot,v_candidate.verified_by_user_id,v_candidate.verified_at
  ) returning id into v_scheme_id;

  for v_component in
    select value from jsonb_array_elements(coalesce(v_candidate.candidate->'components','[]'::jsonb))
  loop
    v_index:=v_index+1;
    insert into public.assessment_components(
      tenant_id,school_id,assessment_scheme_id,component_code,display_name,component_type,
      raw_max,weight,contributes_to_report,required,sort_order,configuration,
      term_numbers,calculation_method,moderation_required,moderation_metadata
    ) values(
      v_candidate.tenant_id,v_candidate.school_id,v_scheme_id,
      coalesce(nullif(v_component->>'code',''),'component_'||v_index),
      coalesce(nullif(v_component->>'name',''),'Component '||v_index),
      coalesce(nullif(v_component->>'type',''),'other'),
      nullif(v_component->>'rawMax','')::numeric,
      nullif(v_component->>'weight','')::numeric,
      coalesce((v_component->>'contributesToReport')::boolean,true),
      coalesce((v_component->>'required')::boolean,true),
      coalesce((v_component->>'sortOrder')::integer,v_index*10),
      coalesce(v_component->'configuration','{}'::jsonb),
      coalesce(array(select value::smallint from jsonb_array_elements_text(coalesce(v_component->'termNumbers',to_jsonb(v_terms)))),v_terms),
      coalesce(nullif(v_component->>'calculationMethod',''),'weighted'),
      coalesce((v_component->>'moderationRequired')::boolean,false),
      coalesce(v_component->'moderationMetadata','{}'::jsonb)
    );
  end loop;

  if v_capture_mode='detailed'
     and not exists(select 1 from public.assessment_components where assessment_scheme_id=v_scheme_id) then
    raise exception 'Detailed assessment scheme requires at least one verified component';
  end if;

  update public.assessment_scheme_candidates
     set status='published',published_scheme_id=v_scheme_id,updated_at=now()
   where id=p_candidate_id;

  return v_scheme_id;
end;
$$;

revoke all on function public.extract_assessment_scheme_candidate(uuid) from public,anon;
grant execute on function public.extract_assessment_scheme_candidate(uuid) to authenticated;
revoke all on function public.verify_assessment_scheme_candidate(uuid,text) from public,anon;
grant execute on function public.verify_assessment_scheme_candidate(uuid,text) to authenticated;
revoke all on function public.publish_assessment_scheme_candidate(uuid) from public,anon;
grant execute on function public.publish_assessment_scheme_candidate(uuid) to authenticated;

comment on table public.assessment_scheme_candidates is
'Human-verifiable candidate assessment configurations bound to one subject offering and authoritative curriculum version. Extraction never publishes automatically.';
comment on column public.assessment_schemes.term_numbers is
'Applicable Namibia school terms for this scheme. Current governed configuration is restricted to terms 1-3.';

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
  if not (p_term_number = any(v_scheme.term_numbers)) then raise exception 'Assessment scheme is not applicable to term %', p_term_number; end if;

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
      and p_term_number = any(ac.term_numbers)
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

    if v_component.calculation_method='direct' then
      v_raw_max:=coalesce(v_component.instance_raw_max,v_component.raw_max,100);
      v_contribution:=(v_mark.numeric_mark/v_raw_max)*coalesce(v_component.weight,100);
    else
      v_raw_max:=coalesce(v_component.instance_raw_max,v_component.raw_max);
      if v_raw_max is null or v_raw_max<=0 then raise exception 'Contributing component % has no valid raw maximum',v_component.component_code; end if;
      if v_component.weight is null then raise exception 'Contributing component % has no configured weight',v_component.component_code; end if;
      v_contribution:=(v_mark.numeric_mark/v_raw_max)*v_component.weight;
    end if;

    v_total:=v_total+v_contribution;
    v_weight_total:=v_weight_total+coalesce(v_component.weight,100);
    v_inputs:=v_inputs || jsonb_build_array(jsonb_build_object(
      'component',v_component.component_code,
      'assessment_instance_id',v_component.instance_id,
      'raw_mark',v_mark.numeric_mark,
      'raw_max',v_raw_max,
      'weight',coalesce(v_component.weight,100),
      'calculation_method',v_component.calculation_method,
      'contribution',v_contribution
    ));
  end loop;

  if jsonb_array_length(v_missing)>0 then
    return jsonb_build_object('complete',false,'result_status','incomplete','missing',v_missing,'non_numeric',v_non_numeric,'inputs',v_inputs,'weight_total',v_weight_total);
  end if;
  if v_weight_total<=0 then
    return jsonb_build_object('complete',false,'result_status','incomplete','missing',jsonb_build_array(jsonb_build_object('reason','no_contributing_weight')),'inputs',v_inputs);
  end if;

  v_final:=(v_total/v_weight_total)*100;
  return jsonb_build_object(
    'complete',true,
    'result_value',v_final,
    'weight_total',v_weight_total,
    'inputs',v_inputs,
    'assessment_scheme_key',v_scheme.scheme_key,
    'assessment_scheme_version',v_scheme.version,
    'curriculum_version_id',v_scheme.curriculum_version_id,
    'term_number',p_term_number
  );
end;
$$;

revoke all on function public.calculate_subject_result(uuid,uuid,smallint) from public,anon;
grant execute on function public.calculate_subject_result(uuid,uuid,smallint) to authenticated;

