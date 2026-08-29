-- Keep initials as a distinct identity attribute. Imported initials must never be
-- concatenated into legal first-name fields, because official school documents and
-- reconciliation need to preserve the source identity structure.

alter table public.learners
  add column if not exists initials text;

alter table public.staff_members
  add column if not exists initials text;

alter table public.guardian_profiles
  add column if not exists initials text;

alter table public.learners
  drop constraint if exists learners_initials_format_check,
  add constraint learners_initials_format_check
    check (initials is null or (initials = upper(initials) and initials ~ '^[A-Z]{1,12}$'));

alter table public.staff_members
  drop constraint if exists staff_members_initials_format_check,
  add constraint staff_members_initials_format_check
    check (initials is null or (initials = upper(initials) and initials ~ '^[A-Z]{1,12}$'));

alter table public.guardian_profiles
  drop constraint if exists guardian_profiles_initials_format_check,
  add constraint guardian_profiles_initials_format_check
    check (initials is null or (initials = upper(initials) and initials ~ '^[A-Z]{1,12}$'));

create or replace function app_private.apply_import_identity_initials()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_initials text;
begin
  if new.matched_entity_id is null or new.matched_entity_type is null then
    return new;
  end if;

  v_initials:=nullif(upper(regexp_replace(coalesce(new.normalized_data->>'initials',''),'[^A-Za-z]','','g')),'');
  if v_initials is null then return new; end if;
  v_initials:=left(v_initials,12);

  if new.matched_entity_type='learner' then
    update public.learners
    set initials=coalesce(initials,v_initials),updated_at=now()
    where id=new.matched_entity_id and tenant_id=new.tenant_id;
  elsif new.matched_entity_type='staff_member' then
    update public.staff_members
    set initials=coalesce(initials,v_initials),updated_at=now()
    where id=new.matched_entity_id and tenant_id=new.tenant_id;
  elsif new.matched_entity_type='guardian' then
    update public.guardian_profiles
    set initials=coalesce(initials,v_initials),updated_at=now()
    where id=new.matched_entity_id and tenant_id=new.tenant_id;
  end if;

  return new;
end;
$$;
revoke all on function app_private.apply_import_identity_initials() from public,anon,authenticated;

drop trigger if exists import_rows_apply_identity_initials on public.import_rows;
create trigger import_rows_apply_identity_initials
after insert or update of matched_entity_type,matched_entity_id,normalized_data on public.import_rows
for each row
when (new.matched_entity_id is not null)
execute function app_private.apply_import_identity_initials();

comment on column public.learners.initials is 'Official initials stored separately from legal first names; never inferred from names by the database.';
comment on column public.staff_members.initials is 'Staff initials stored separately from legal first names and separately from school staff_code.';
comment on column public.guardian_profiles.initials is 'Guardian initials stored separately from legal first names.';
