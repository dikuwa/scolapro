-- Issue #1003: post-merge remediation for #991.
-- Do not rewrite the merged #991 migration; harden the live contracts in-place.

create or replace function app_private.enforce_curriculum_version_finality()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('approved','published','superseded')
       or old.approved_at is not null then
      raise exception 'Approved or published curriculum versions are immutable historical records';
    end if;
    return old;
  end if;

  if (old.status in ('approved','published','superseded') or old.approved_at is not null) and (
    new.metadata is distinct from old.metadata
    or new.approved_by_user_id is distinct from old.approved_by_user_id
    or new.approved_at is distinct from old.approved_at
    or new.curriculum_subject_id is distinct from old.curriculum_subject_id
    or new.version_key is distinct from old.version_key
    or new.source_id is distinct from old.source_id
    or new.effective_from_year is distinct from old.effective_from_year
    or new.created_at is distinct from old.created_at
  ) then    raise exception 'Approved or published curriculum version content and provenance are immutable';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_curriculum_version_finality() from public, anon, authenticated;

create or replace function app_private.enforce_curriculum_child_finality()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row jsonb;
  v_unit_id uuid;
  v_version_id uuid;
  v_status text;
  v_approved_at timestamptz;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if tg_table_name = 'curriculum_units' then
    v_version_id := nullif(v_row->>'curriculum_version_id','')::uuid;
  else
    v_unit_id := nullif(v_row->>'curriculum_unit_id','')::uuid;
    select u.curriculum_version_id      into v_version_id
      from public.curriculum_units u
     where u.id = v_unit_id;
  end if;

  select v.status, v.approved_at
    into v_status, v_approved_at
  from public.curriculum_versions v
  where v.id = v_version_id;

  if v_status in ('approved','published','superseded')
     or v_approved_at is not null then
    raise exception 'Approved or published curriculum content is immutable; create a new curriculum version';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_curriculum_child_finality() from public, anon, authenticated;

create or replace function app_private.guard_school_subject_curriculum_mapping()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_subject_tenant uuid;
  v_subject_school uuid;
  v_protected_changed boolean:=false;
begin
  select tenant_id,school_id into v_subject_tenant,v_subject_school
  from public.subjects
  where id=new.subject_id;

  if v_subject_school is null
     or v_subject_school<>new.school_id
     or v_subject_tenant<>new.tenant_id then
    raise exception 'Curriculum mapping subject scope mismatch';
  end if;

  if tg_op='INSERT' then
    if auth.uid() is null or new.created_by_user_id<>auth.uid() then
      raise exception 'Curriculum mapping creator must match the authenticated actor';
    end if;

    if new.status='verified' then
      new.verified_by_user_id:=auth.uid();
      new.verified_at:=now();
    else
      new.verified_by_user_id:=null;
      new.verified_at:=null;
    end if;
    return new;
  end if;

  if new.created_by_user_id is distinct from old.created_by_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Curriculum mapping creation provenance is immutable';
  end if;

  v_protected_changed :=
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.subject_id is distinct from old.subject_id
    or new.curriculum_subject_id is distinct from old.curriculum_subject_id
    or new.grade_code is distinct from old.grade_code
    or new.phase_code is distinct from old.phase_code
    or new.programme_code is distinct from old.programme_code
    or new.qualification_code is distinct from old.qualification_code
    or new.academic_regime is distinct from old.academic_regime
    or new.language_code is distinct from old.language_code
    or new.effective_from_year is distinct from old.effective_from_year
    or new.effective_to_year is distinct from old.effective_to_year
    or new.mapping_source is distinct from old.mapping_source
    or new.verified_by_user_id is distinct from old.verified_by_user_id
    or new.verified_at is distinct from old.verified_at;

  if old.status='archived' then    if new.status is distinct from old.status or v_protected_changed then
      raise exception 'Archived curriculum mappings are immutable historical records';
    end if;
    return new;
  end if;

  if old.status='verified' then
    if new.status not in ('verified','archived') or v_protected_changed then
      raise exception 'Verified curriculum mappings are immutable; archive and create a new mapping';
    end if;
    return new;
  end if;

  if new.status='verified' then
    new.verified_by_user_id:=auth.uid();
    new.verified_at:=now();
  elsif new.status='draft' then
    new.verified_by_user_id:=null;
    new.verified_at:=null;
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_school_subject_curriculum_mapping() from public,anon,authenticated;
create or replace function app_private.guard_subject_offering_curriculum_pin()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_adoption_offering_id text;
begin
  if old.curriculum_version_id is not null
     and new.curriculum_version_id is distinct from old.curriculum_version_id then
    raise exception 'Pinned subject-offering curriculum version is immutable; create a new offering/versioned academic record';
  end if;

  if old.curriculum_version_id is null
     and new.curriculum_version_id is not null then
    v_adoption_offering_id:=current_setting('app.curriculum_adoption_offering_id',true);

    if v_adoption_offering_id is distinct from new.id::text then
      raise exception 'Initial subject-offering curriculum pin must use the governed adoption workflow';
    end if;
  end if;

  return new;
end;
$$;
revoke all on function app_private.guard_subject_offering_curriculum_pin() from public,anon,authenticated;

create or replace function app_private.autolink_subject_offering_curriculum()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_grade_code text;
  v_state text;
  v_version_id uuid;
begin
  if new.curriculum_version_id is not null then
    raise exception 'Explicit curriculum pins are not accepted on subject-offering insert; use governed curriculum resolution';
  end if;

  select g.grade_code into v_grade_code
  from public.grades g
  where g.id=new.grade_id and g.school_id=new.school_id;

  if v_grade_code is null then
    return new;
  end if;

  select r.resolution_state,r.curriculum_version_id
    into v_state,v_version_id
  from app_private.resolve_curriculum_version_for_offering_fields(
    new.school_id,
    new.subject_id,
    v_grade_code,
    new.academic_year
  ) r;

  if v_state='matched' then
    new.curriculum_version_id:=v_version_id;
  end if;
  return new;
end;
$$;

revoke all on function app_private.autolink_subject_offering_curriculum() from public,anon,authenticated;

create or replace function public.adopt_curriculum_version_for_subject_offering(
  p_subject_offering_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_offering public.subject_offerings%rowtype;
  v_grade_code text;
  v_state text;
  v_version_id uuid;
  v_candidate_count integer;
  v_mapping_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select o.*
    into v_offering
  from public.subject_offerings o
  where o.id=p_subject_offering_id
  for update;

  if not found then
    raise exception 'Subject offering not found';
  end if;

  select g.grade_code
    into v_grade_code
  from public.grades g
  where g.id=v_offering.grade_id
    and g.school_id=v_offering.school_id;

  if v_grade_code is null then
    raise exception 'Subject offering grade scope is invalid';
  end if;
  if not (
    app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(
      v_offering.school_id,
      array['school_admin','principal','deputy_principal','hod']
    )
  ) then
    raise exception 'Permission denied';
  end if;

  if v_offering.curriculum_version_id is not null then
    return v_offering.curriculum_version_id;
  end if;
  select r.resolution_state,r.curriculum_version_id,r.candidate_count,r.mapping_id
    into v_state,v_version_id,v_candidate_count,v_mapping_id
  from app_private.resolve_curriculum_version_for_offering_fields(
    v_offering.school_id,
    v_offering.subject_id,
    v_grade_code,
    v_offering.academic_year
  ) r;

  if v_state='none' then
    raise exception 'No published curriculum version matches this subject offering';
  elsif v_state='ambiguous' then
    raise exception 'Multiple equally applicable published curriculum versions require platform review';
  end if;

  perform set_config('app.curriculum_adoption_offering_id',v_offering.id::text,true);

  update public.subject_offerings
  set curriculum_version_id=v_version_id,
      updated_at=now()
  where id=v_offering.id
    and curriculum_version_id is null;
  perform set_config('app.curriculum_adoption_offering_id','',true);

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  )
  values(
    v_offering.tenant_id,
    v_offering.school_id,
    auth.uid(),
    'curriculum.offering_version_adopted',
    'subject_offering',
    v_offering.id,
    jsonb_build_object(
      'curriculum_version_id',v_version_id,
      'mapping_id',v_mapping_id,
      'academic_year',v_offering.academic_year
    )
  );

  return v_version_id;
end;
$$;

revoke all on function public.adopt_curriculum_version_for_subject_offering(uuid) from public,anon;
grant execute on function public.adopt_curriculum_version_for_subject_offering(uuid) to authenticated;
comment on function app_private.guard_subject_offering_curriculum_pin() is
'Rejects replacement of historical curriculum pins and restricts first-time updates to the governed adoption RPC.';

comment on function app_private.guard_school_subject_curriculum_mapping() is
'Preserves creator and verification provenance. Verified mappings may only remain verified or transition to terminal archived state without changing the crosswalk.';