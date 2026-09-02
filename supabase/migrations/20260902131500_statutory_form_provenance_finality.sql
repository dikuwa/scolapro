create or replace function app_private.enforce_statutory_form_definition_provenance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    if exists (
      select 1 from public.statutory_form_versions v
      where v.form_definition_id = old.id
        and v.status in ('approved','published','superseded')
    ) then
      raise exception 'Statutory form definitions with approved or published history cannot be deleted';
    end if;
    return old;
  end if;

  if new.id is distinct from old.id
     or new.form_key is distinct from old.form_key
     or new.authority is distinct from old.authority
     or new.created_at is distinct from old.created_at then
    raise exception 'Statutory form definition identity and creation provenance are immutable';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_statutory_form_definition_provenance() from public, anon, authenticated;

create or replace function app_private.enforce_statutory_form_version_provenance_finality()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('approved','published','superseded') then
      raise exception 'Approved or published statutory form versions are immutable historical records';
    end if;
    return old;
  end if;

  if new.id is distinct from old.id
     or new.form_definition_id is distinct from old.form_definition_id
     or new.version_key is distinct from old.version_key
     or new.effective_from is distinct from old.effective_from
     or new.created_at is distinct from old.created_at then
    raise exception 'Statutory form version identity and creation provenance are immutable';
  end if;

  if old.status in ('approved','published','superseded') and (
    new.source_reference is distinct from old.source_reference
    or new.field_schema is distinct from old.field_schema
    or new.mapping_schema is distinct from old.mapping_schema
    or new.validation_schema is distinct from old.validation_schema
  ) then
    raise exception 'Approved or published statutory form schema is immutable; create a new form version';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_statutory_form_version_provenance_finality() from public, anon, authenticated;

drop trigger if exists statutory_form_definitions_provenance_trg on public.statutory_form_definitions;
create trigger statutory_form_definitions_provenance_trg
before update or delete on public.statutory_form_definitions
for each row execute function app_private.enforce_statutory_form_definition_provenance();

drop trigger if exists statutory_form_versions_provenance_finality_trg on public.statutory_form_versions;
create trigger statutory_form_versions_provenance_finality_trg
before update or delete on public.statutory_form_versions
for each row execute function app_private.enforce_statutory_form_version_provenance_finality();
