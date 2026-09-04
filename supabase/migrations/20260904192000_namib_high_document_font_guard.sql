-- Enforce the Namib High School-only Old English document treatment at the data
-- boundary. UI/server actions already hide/normalize this option, but this trigger
-- prevents stale imports, manual SQL or future clients from leaking it to another
-- school tenant.

create or replace function app_private.guard_school_document_font()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_school_name text;
begin
  if new.setting_key <> 'document_profile' then
    return new;
  end if;

  select lower(trim(s.name))
  into v_school_name
  from public.schools s
  where s.id = new.school_id;

  if coalesce(v_school_name, '') <> 'namib high school'
     and lower(coalesce(new.setting_value ->> 'school_name_font', 'default')) = 'old_english' then
    new.setting_value := jsonb_set(
      coalesce(new.setting_value, '{}'::jsonb),
      '{school_name_font}',
      '"default"'::jsonb,
      true
    );
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_school_document_font()
from public, anon, authenticated;

drop trigger if exists school_document_font_guard_trg on public.school_settings;
create trigger school_document_font_guard_trg
before insert or update of setting_value, setting_key, school_id
on public.school_settings
for each row
execute function app_private.guard_school_document_font();

comment on function app_private.guard_school_document_font() is
  'Forces school_name_font=default outside Namib High School so the school-specific Old English treatment cannot leak across tenants.';
