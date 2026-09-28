-- Issue #857: AEC statutory template/version foundation.
-- Extends the existing statutory form registry. This does not create a second
-- statutory engine, code registry, school profile, or AEC workflow.

create table if not exists public.statutory_form_sections (
  id uuid primary key default gen_random_uuid(),
  form_version_id uuid not null references public.statutory_form_versions(id) on delete restrict,
  section_key text not null check (btrim(section_key) <> ''),
  display_name text not null check (btrim(display_name) <> ''),
  description text,
  sort_order integer not null default 0 check (sort_order >= 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (form_version_id, section_key),
  unique (id, form_version_id)
);

create table if not exists public.statutory_form_fields (
  id uuid primary key default gen_random_uuid(),
  form_version_id uuid not null references public.statutory_form_versions(id) on delete restrict,
  section_id uuid not null,
  field_key text not null check (btrim(field_key) <> ''),
  label text not null check (btrim(label) <> ''),
  sort_order integer not null default 0 check (sort_order >= 0),
  source_mode text not null default 'unresolved'
    check (source_mode in ('derived','manual','hybrid','unresolved')),
  resolver_type text,
  resolver_config jsonb not null default '{}'::jsonb check (jsonb_typeof(resolver_config) = 'object'),
  required boolean not null default false,
  validation_schema jsonb not null default '{}'::jsonb check (jsonb_typeof(validation_schema) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (form_version_id, field_key),
  foreign key (section_id, form_version_id)
    references public.statutory_form_sections(id, form_version_id)
    on delete restrict
);

create index if not exists statutory_form_sections_version_order_idx
  on public.statutory_form_sections(form_version_id, sort_order, section_key);

create index if not exists statutory_form_fields_section_order_idx
  on public.statutory_form_fields(section_id, sort_order, field_key);

create index if not exists statutory_form_fields_version_key_idx
  on public.statutory_form_fields(form_version_id, field_key);

alter table public.statutory_form_sections enable row level security;
alter table public.statutory_form_fields enable row level security;

create policy "authenticated users can read finalized statutory sections"
on public.statutory_form_sections for select to authenticated
using (
  exists (
    select 1
    from public.statutory_form_versions v
    where v.id = statutory_form_sections.form_version_id
      and v.status in ('approved','published','superseded')
  )
  or app_private.has_platform_role(array['platform_admin'])
);

create policy "platform admins can manage statutory sections"
on public.statutory_form_sections for all to authenticated
using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));

create policy "authenticated users can read finalized statutory fields"
on public.statutory_form_fields for select to authenticated
using (
  exists (
    select 1
    from public.statutory_form_versions v
    where v.id = statutory_form_fields.form_version_id
      and v.status in ('approved','published','superseded')
  )
  or app_private.has_platform_role(array['platform_admin'])
);

create policy "platform admins can manage statutory fields"
on public.statutory_form_fields for all to authenticated
using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));

create or replace function app_private.enforce_statutory_form_structure_finality()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $body$
declare
  v_old_status text;
  v_new_status text;
begin
  if tg_op in ('UPDATE','DELETE') then
    select status into v_old_status
    from public.statutory_form_versions
    where id = old.form_version_id;

    if v_old_status is null then
      raise exception 'Statutory form version not found';
    end if;

    if v_old_status <> 'draft' then
      raise exception 'Finalized statutory form structure is immutable; create a new form version';
    end if;
  end if;

  if tg_op in ('INSERT','UPDATE') then
    select status into v_new_status
    from public.statutory_form_versions
    where id = new.form_version_id;

    if v_new_status is null then
      raise exception 'Statutory form version not found';
    end if;

    if v_new_status <> 'draft' then
      raise exception 'Finalized statutory form structure is immutable; create a new form version';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$body$;

revoke all on function app_private.enforce_statutory_form_structure_finality()
from public, anon, authenticated;

drop trigger if exists statutory_form_sections_finality_trg
on public.statutory_form_sections;
create trigger statutory_form_sections_finality_trg
before insert or update or delete on public.statutory_form_sections
for each row execute function app_private.enforce_statutory_form_structure_finality();

drop trigger if exists statutory_form_fields_finality_trg
on public.statutory_form_fields;
create trigger statutory_form_fields_finality_trg
before insert or update or delete on public.statutory_form_fields
for each row execute function app_private.enforce_statutory_form_structure_finality();

create or replace function app_private.statutory_form_template_payload(p_form_version_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'form',
    jsonb_build_object(
      'id', d.id,
      'form_key', d.form_key,
      'display_name', d.display_name,
      'authority', d.authority,
      'description', d.description,
      'active', d.active
    ),
    'version',
    jsonb_build_object(
      'id', v.id,
      'version_key', v.version_key,
      'effective_from', v.effective_from,
      'effective_to', v.effective_to,
      'source_reference', v.source_reference,
      'status', v.status,
      'field_schema', v.field_schema,
      'mapping_schema', v.mapping_schema,
      'validation_schema', v.validation_schema
    ),
    'sections',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'section_key', s.section_key,
          'display_name', s.display_name,
          'description', s.description,
          'sort_order', s.sort_order,
          'metadata', s.metadata,
          'fields',
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', f.id,
                'field_key', f.field_key,
                'label', f.label,
                'sort_order', f.sort_order,
                'source_mode', f.source_mode,
                'resolver_type', f.resolver_type,
                'resolver_config', f.resolver_config,
                'required', f.required,
                'validation_schema', f.validation_schema,
                'metadata', f.metadata
              )
              order by f.sort_order, f.field_key, f.id
            )
            from public.statutory_form_fields f
            where f.form_version_id = v.id
              and f.section_id = s.id
          ), '[]'::jsonb)
        )
        order by s.sort_order, s.section_key, s.id
      )
      from public.statutory_form_sections s
      where s.form_version_id = v.id
    ), '[]'::jsonb)
  )
  from public.statutory_form_versions v
  join public.statutory_form_definitions d on d.id = v.form_definition_id
  where v.id = p_form_version_id;
$$;

revoke all on function app_private.statutory_form_template_payload(uuid)
from public, anon, authenticated;

create or replace function public.resolve_statutory_form_template(
  p_form_key text,
  p_effective_on date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_version_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(coalesce(p_form_key,'')), '') is null then
    raise exception 'Form key is required';
  end if;
  if p_effective_on is null then raise exception 'Effective date is required'; end if;

  select v.id into v_version_id
  from public.statutory_form_versions v
  join public.statutory_form_definitions d on d.id = v.form_definition_id
  where d.form_key = btrim(p_form_key)
    and d.active = true
    and v.status in ('approved','published')
    and v.effective_from <= p_effective_on
    and (v.effective_to is null or v.effective_to >= p_effective_on)
  order by
    v.effective_from desc,
    case v.status when 'published' then 0 else 1 end,
    v.version_key desc,
    v.id
  limit 1;

  if v_version_id is null then return null; end if;
  return app_private.statutory_form_template_payload(v_version_id);
end;
$$;

create or replace function public.get_statutory_form_template_version_by_id(
  p_form_version_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select status into v_status
  from public.statutory_form_versions
  where id = p_form_version_id;

  if v_status is null then return null; end if;

  if v_status = 'draft'
     and not app_private.has_platform_role(array['platform_admin']) then
    return null;
  end if;

  if v_status not in ('draft','approved','published','superseded','withdrawn') then
    return null;
  end if;

  return app_private.statutory_form_template_payload(p_form_version_id);
end;
$$;

create or replace function public.get_statutory_form_template_version_by_key(
  p_form_key text,
  p_version_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_version_id uuid;
  v_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(coalesce(p_form_key,'')), '') is null then
    raise exception 'Form key is required';
  end if;
  if nullif(btrim(coalesce(p_version_key,'')), '') is null then
    raise exception 'Version key is required';
  end if;

  select v.id, v.status into v_version_id, v_status
  from public.statutory_form_versions v
  join public.statutory_form_definitions d on d.id = v.form_definition_id
  where d.form_key = btrim(p_form_key)
    and v.version_key = btrim(p_version_key)
  limit 1;

  if v_version_id is null then return null; end if;

  if v_status = 'draft'
     and not app_private.has_platform_role(array['platform_admin']) then
    return null;
  end if;

  return app_private.statutory_form_template_payload(v_version_id);
end;
$$;

revoke all on function public.resolve_statutory_form_template(text,date)
from public, anon;
grant execute on function public.resolve_statutory_form_template(text,date)
to authenticated;

revoke all on function public.get_statutory_form_template_version_by_id(uuid)
from public, anon;
grant execute on function public.get_statutory_form_template_version_by_id(uuid)
to authenticated;

revoke all on function public.get_statutory_form_template_version_by_key(text,text)
from public, anon;
grant execute on function public.get_statutory_form_template_version_by_key(text,text)
to authenticated;

comment on table public.statutory_form_sections is
'Ordered sections belonging to one immutable-after-finalization statutory form version.';

comment on table public.statutory_form_fields is
'Ordered statutory field definitions and resolver metadata. Operational learner/staff values are never stored here.';

comment on function public.resolve_statutory_form_template(text,date) is
'Deterministically resolves the active approved/published statutory template effective on a date. Superseded/withdrawn versions are excluded from active resolution.';

comment on function public.get_statutory_form_template_version_by_id(uuid) is
'Returns an exact statutory template version, including historical superseded/withdrawn versions. Draft visibility is platform-admin only.';

comment on function public.get_statutory_form_template_version_by_key(text,text) is
'Returns an exact statutory template version by stable form/version keys without re-resolving current effectiveness.';
