create or replace function app_private.enforce_curriculum_registry_identity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if to_jsonb(new)->'id' is distinct from to_jsonb(old)->'id'
     or to_jsonb(new)->'created_at' is distinct from to_jsonb(old)->'created_at' then
    raise exception '% identity and creation provenance are immutable', tg_table_name;
  end if;

  if tg_table_name = 'curriculum_sources' and (
    to_jsonb(new)->'source_key' is distinct from to_jsonb(old)->'source_key'
    or to_jsonb(new)->'authority' is distinct from to_jsonb(old)->'authority'
  ) then
    raise exception 'Curriculum source identity is immutable';
  elsif tg_table_name = 'curriculum_subjects' and (
    to_jsonb(new)->'curriculum_key' is distinct from to_jsonb(old)->'curriculum_key'
    or to_jsonb(new)->'authority' is distinct from to_jsonb(old)->'authority'
  ) then
    raise exception 'Curriculum subject identity is immutable';
  elsif tg_table_name = 'curriculum_versions' and (
    to_jsonb(new)->'curriculum_subject_id' is distinct from to_jsonb(old)->'curriculum_subject_id'
    or to_jsonb(new)->'version_key' is distinct from to_jsonb(old)->'version_key'
    or to_jsonb(new)->'source_id' is distinct from to_jsonb(old)->'source_id'
    or to_jsonb(new)->'effective_from_year' is distinct from to_jsonb(old)->'effective_from_year'
  ) then
    raise exception 'Curriculum version identity and source provenance are immutable';
  elsif tg_table_name = 'curriculum_units' and (
    to_jsonb(new)->'curriculum_version_id' is distinct from to_jsonb(old)->'curriculum_version_id'
    or to_jsonb(new)->'unit_code' is distinct from to_jsonb(old)->'unit_code'
  ) then
    raise exception 'Curriculum unit parent and code are immutable';
  elsif tg_table_name = 'curriculum_objectives' and
    to_jsonb(new)->'curriculum_unit_id' is distinct from to_jsonb(old)->'curriculum_unit_id' then
    raise exception 'Curriculum objective parent is immutable';
  elsif tg_table_name = 'curriculum_competencies' and
    to_jsonb(new)->'curriculum_unit_id' is distinct from to_jsonb(old)->'curriculum_unit_id' then
    raise exception 'Curriculum competency parent is immutable';
  elsif tg_table_name = 'curriculum_practicals' and
    to_jsonb(new)->'curriculum_unit_id' is distinct from to_jsonb(old)->'curriculum_unit_id' then
    raise exception 'Curriculum practical parent is immutable';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_curriculum_registry_identity() from public, anon, authenticated;

create or replace function app_private.enforce_curriculum_version_finality()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('approved','published','superseded') then
      raise exception 'Approved or published curriculum versions are immutable historical records';
    end if;
    return old;
  end if;

  if old.status in ('approved','published','superseded') and (
    new.metadata is distinct from old.metadata
    or new.approved_by_user_id is distinct from old.approved_by_user_id
    or new.approved_at is distinct from old.approved_at
    or new.curriculum_subject_id is distinct from old.curriculum_subject_id
    or new.version_key is distinct from old.version_key
    or new.source_id is distinct from old.source_id
    or new.effective_from_year is distinct from old.effective_from_year
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Approved or published curriculum version content and provenance are immutable';
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
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if tg_table_name = 'curriculum_units' then
    v_version_id := nullif(v_row->>'curriculum_version_id','')::uuid;
  else
    v_unit_id := nullif(v_row->>'curriculum_unit_id','')::uuid;
    select u.curriculum_version_id
      into v_version_id
      from public.curriculum_units u
     where u.id = v_unit_id;
  end if;

  select v.status into v_status
  from public.curriculum_versions v
  where v.id = v_version_id;

  if v_status in ('approved','published','superseded') then
    raise exception 'Approved or published curriculum content is immutable; create a new curriculum version';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_curriculum_child_finality() from public, anon, authenticated;

drop trigger if exists curriculum_sources_identity_integrity_trg on public.curriculum_sources;
create trigger curriculum_sources_identity_integrity_trg
before update of id, source_key, authority, created_at on public.curriculum_sources
for each row execute function app_private.enforce_curriculum_registry_identity();

drop trigger if exists curriculum_subjects_identity_integrity_trg on public.curriculum_subjects;
create trigger curriculum_subjects_identity_integrity_trg
before update of id, curriculum_key, authority, created_at on public.curriculum_subjects
for each row execute function app_private.enforce_curriculum_registry_identity();

drop trigger if exists curriculum_versions_identity_integrity_trg on public.curriculum_versions;
create trigger curriculum_versions_identity_integrity_trg
before update of id, curriculum_subject_id, version_key, source_id, effective_from_year, created_at on public.curriculum_versions
for each row execute function app_private.enforce_curriculum_registry_identity();

drop trigger if exists curriculum_versions_finality_trg on public.curriculum_versions;
create trigger curriculum_versions_finality_trg
before update or delete on public.curriculum_versions
for each row execute function app_private.enforce_curriculum_version_finality();

drop trigger if exists curriculum_units_identity_integrity_trg on public.curriculum_units;
create trigger curriculum_units_identity_integrity_trg
before update of id, curriculum_version_id, unit_code, created_at on public.curriculum_units
for each row execute function app_private.enforce_curriculum_registry_identity();

drop trigger if exists curriculum_units_finality_trg on public.curriculum_units;
create trigger curriculum_units_finality_trg
before insert or update or delete on public.curriculum_units
for each row execute function app_private.enforce_curriculum_child_finality();

drop trigger if exists curriculum_objectives_identity_integrity_trg on public.curriculum_objectives;
create trigger curriculum_objectives_identity_integrity_trg
before update of id, curriculum_unit_id, created_at on public.curriculum_objectives
for each row execute function app_private.enforce_curriculum_registry_identity();

drop trigger if exists curriculum_objectives_finality_trg on public.curriculum_objectives;
create trigger curriculum_objectives_finality_trg
before insert or update or delete on public.curriculum_objectives
for each row execute function app_private.enforce_curriculum_child_finality();

drop trigger if exists curriculum_competencies_identity_integrity_trg on public.curriculum_competencies;
create trigger curriculum_competencies_identity_integrity_trg
before update of id, curriculum_unit_id, created_at on public.curriculum_competencies
for each row execute function app_private.enforce_curriculum_registry_identity();

drop trigger if exists curriculum_competencies_finality_trg on public.curriculum_competencies;
create trigger curriculum_competencies_finality_trg
before insert or update or delete on public.curriculum_competencies
for each row execute function app_private.enforce_curriculum_child_finality();

drop trigger if exists curriculum_practicals_identity_integrity_trg on public.curriculum_practicals;
create trigger curriculum_practicals_identity_integrity_trg
before update of id, curriculum_unit_id, created_at on public.curriculum_practicals
for each row execute function app_private.enforce_curriculum_registry_identity();

drop trigger if exists curriculum_practicals_finality_trg on public.curriculum_practicals;
create trigger curriculum_practicals_finality_trg
before insert or update or delete on public.curriculum_practicals
for each row execute function app_private.enforce_curriculum_child_finality();
