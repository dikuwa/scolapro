-- Issue #858: AEC statutory code registry and canonical mapping foundation.
-- Statutory codes are output identifiers only. Canonical ScolaPro entity ids remain authoritative.

create table if not exists public.statutory_code_sets (
  id uuid primary key default gen_random_uuid(),
  set_key text not null,
  authority text not null,
  version_key text not null,
  effective_from date not null,
  effective_to date,
  status text not null default 'draft'
    check (status in ('draft','published','superseded','withdrawn')),
  source_reference text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (set_key, version_key),
  unique (set_key, effective_from),
  check (btrim(set_key) <> ''),
  check (btrim(authority) <> ''),
  check (btrim(version_key) <> ''),
  check (btrim(source_reference) <> ''),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.statutory_codes (
  id uuid primary key default gen_random_uuid(),
  code_set_id uuid not null references public.statutory_code_sets(id) on delete restrict,
  code text not null,
  label text not null,
  status text not null default 'active'
    check (status in ('active','inactive','superseded')),
  superseded_by_code_id uuid references public.statutory_codes(id) on delete restrict,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code_set_id, code),
  check (btrim(code) <> ''),
  check (btrim(label) <> ''),
  check (superseded_by_code_id is null or superseded_by_code_id <> id)
);

create table if not exists public.statutory_code_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  code_id uuid not null references public.statutory_codes(id) on delete restrict,
  target_type text not null
    check (target_type in ('school','subject','staff_member','school_room')),
  target_id uuid not null,
  effective_from date not null,
  effective_to date,
  status text not null default 'active'
    check (status in ('active','inactive','superseded')),
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code_id, target_type, target_id, school_id, effective_from),
  check (effective_to is null or effective_to >= effective_from)
);

create index if not exists statutory_code_sets_effective_idx
  on public.statutory_code_sets(set_key, status, effective_from desc, effective_to);
create index if not exists statutory_codes_set_status_idx
  on public.statutory_codes(code_set_id, status, code);
create index if not exists statutory_code_mappings_target_idx
  on public.statutory_code_mappings(school_id, target_type, target_id, effective_from desc);
create index if not exists statutory_code_mappings_code_idx
  on public.statutory_code_mappings(code_id, status, effective_from desc);

create or replace function app_private.can_read_statutory_code_registry()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select auth.uid() is not null
    and (
      app_private.has_platform_role(array['platform_admin'])
      or exists (
        select 1
        from public.school_memberships sm
        where sm.user_id = auth.uid()
          and sm.active_from <= current_date
          and (sm.active_to is null or sm.active_to >= current_date)
          and app_private.user_targets_current_school(auth.uid(), sm.school_id)
          and (
            sm.staff_member_id is null
            or app_private.staff_member_covers_school_period(
              sm.staff_member_id,
              sm.school_id,
              current_date,
              current_date
            )
          )
      )
    );
$$;

create or replace function app_private.can_read_statutory_code_mapping(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select auth.uid() is not null
    and (
      app_private.has_platform_role(array['platform_admin'])
      or (
        app_private.user_targets_current_school(auth.uid(), target_school_id)
        and exists (
          select 1
          from public.school_memberships sm
          where sm.user_id = auth.uid()
            and sm.school_id = target_school_id
            and sm.active_from <= current_date
            and (sm.active_to is null or sm.active_to >= current_date)
            and (
              sm.staff_member_id is null
              or app_private.staff_member_covers_school_period(
                sm.staff_member_id,
                target_school_id,
                current_date,
                current_date
              )
            )
        )
      )
    );
$$;

create or replace function app_private.statutory_target_matches_scope(
  p_target_type text,
  p_target_id uuid,
  p_tenant_id uuid,
  p_school_id uuid,
  p_as_of date
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_target_type = 'school' then
    return exists (
      select 1 from public.schools s
      where s.id = p_target_id
        and s.id = p_school_id
        and s.tenant_id = p_tenant_id
    );
  elsif p_target_type = 'subject' then
    return exists (
      select 1 from public.subjects s
      where s.id = p_target_id
        and s.school_id = p_school_id
        and s.tenant_id = p_tenant_id
    );
  elsif p_target_type = 'staff_member' then
    return exists (
      select 1
      from public.staff_members sm
      where sm.id = p_target_id
        and sm.tenant_id = p_tenant_id
        and (
          exists (
            select 1
            from public.staff_school_assignments ssa
            where ssa.staff_member_id = sm.id
              and ssa.school_id = p_school_id
              and ssa.tenant_id = p_tenant_id
              and ssa.effective_from <= p_as_of
              and (ssa.effective_to is null or ssa.effective_to >= p_as_of)
          )
          or exists (
            select 1
            from public.school_memberships m
            where m.staff_member_id = sm.id
              and m.school_id = p_school_id
              and m.tenant_id = p_tenant_id
              and m.active_from <= p_as_of
              and (m.active_to is null or m.active_to >= p_as_of)
          )
        )
    );
  elsif p_target_type = 'school_room' then
    return exists (
      select 1 from public.school_rooms r
      where r.id = p_target_id
        and r.school_id = p_school_id
        and r.tenant_id = p_tenant_id
    );
  end if;
  return false;
end;
$$;

revoke all on function app_private.can_read_statutory_code_registry() from public, anon;
revoke all on function app_private.can_read_statutory_code_mapping(uuid) from public, anon;
revoke all on function app_private.statutory_target_matches_scope(text,uuid,uuid,uuid,date) from public, anon, authenticated;
grant execute on function app_private.can_read_statutory_code_registry() to authenticated;
grant execute on function app_private.can_read_statutory_code_mapping(uuid) to authenticated;

create or replace function app_private.enforce_statutory_code_set_finality()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Finalized statutory code-set versions cannot be deleted';
    end if;
    return old;
  end if;

  if old.status <> 'draft' then
    if new.id is distinct from old.id
       or new.set_key is distinct from old.set_key
       or new.authority is distinct from old.authority
       or new.version_key is distinct from old.version_key
       or new.effective_from is distinct from old.effective_from
       or new.effective_to is distinct from old.effective_to
       or new.source_reference is distinct from old.source_reference
       or new.source_metadata is distinct from old.source_metadata
       or new.created_at is distinct from old.created_at then
      raise exception 'Finalized statutory code-set identity, effective period, and provenance are immutable';
    end if;

    if old.status = 'published'
       and new.status not in ('published','superseded','withdrawn') then
      raise exception 'Published statutory code-set lifecycle may only remain published or move to superseded/withdrawn';
    elsif old.status = 'superseded'
       and new.status not in ('superseded','withdrawn') then
      raise exception 'Superseded statutory code-set lifecycle may only remain superseded or move to withdrawn';
    elsif old.status = 'withdrawn'
       and new.status <> 'withdrawn' then
      raise exception 'Withdrawn statutory code-set versions cannot be reactivated';
    end if;
  end if;

  return new;
end;
$;

create or replace function app_private.enforce_statutory_code_finality()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $
declare
  v_old_set public.statutory_code_sets%rowtype;
  v_new_set public.statutory_code_sets%rowtype;
  v_replacement public.statutory_codes%rowtype;
  v_replacement_set public.statutory_code_sets%rowtype;
begin
  select * into v_old_set
  from public.statutory_code_sets
  where id = old.code_set_id;

  if tg_op = 'DELETE' then
    if found and v_old_set.status <> 'draft' then
      raise exception 'Codes belonging to finalized statutory code-set versions cannot be deleted';
    end if;
    return old;
  end if;

  select * into v_new_set
  from public.statutory_code_sets
  where id = new.code_set_id;
  if not found then
    raise exception 'Statutory code set does not exist';
  end if;

  if v_old_set.status <> 'draft' then
    if new.id is distinct from old.id
       or new.code_set_id is distinct from old.code_set_id
       or new.code is distinct from old.code
       or new.label is distinct from old.label
       or new.source_metadata is distinct from old.source_metadata
       or new.created_at is distinct from old.created_at then
      raise exception 'Codes in finalized statutory code-set versions have immutable set identity, code, label, and provenance';
    end if;

    if old.status = 'active'
       and new.status not in ('active','inactive','superseded') then
      raise exception 'Active statutory code lifecycle may only remain active or move to inactive/superseded';
    elsif old.status = 'inactive'
       and new.status not in ('inactive','superseded') then
      raise exception 'Inactive statutory code lifecycle may only remain inactive or move to superseded';
    elsif old.status = 'superseded'
       and new.status <> 'superseded' then
      raise exception 'Superseded statutory codes cannot be reactivated';
    end if;
  end if;

  if new.superseded_by_code_id is not null then
    if new.status <> 'superseded' then
      raise exception 'A statutory replacement code may only be recorded when the code is superseded';
    end if;

    select * into v_replacement
    from public.statutory_codes
    where id = new.superseded_by_code_id;
    if not found then
      raise exception 'Replacement statutory code does not exist';
    end if;

    select * into v_replacement_set
    from public.statutory_code_sets
    where id = v_replacement.code_set_id;
    if not found
       or v_replacement_set.set_key <> v_new_set.set_key
       or v_replacement_set.id = v_new_set.id
       or v_replacement_set.effective_from <= v_new_set.effective_from
       or v_replacement_set.status not in ('published','superseded')
       or v_replacement.status not in ('active','superseded') then
      raise exception 'Replacement statutory code must belong to a later compatible finalized version of the same code set';
    end if;
  end if;

  return new;
end;
$;

revoke all on function app_private.enforce_statutory_code_set_finality()
from public, anon, authenticated;
revoke all on function app_private.enforce_statutory_code_finality()
from public, anon, authenticated;

drop trigger if exists statutory_code_set_finality_trg
on public.statutory_code_sets;
create trigger statutory_code_set_finality_trg
before update or delete on public.statutory_code_sets
for each row execute function app_private.enforce_statutory_code_set_finality();

drop trigger if exists statutory_code_finality_trg
on public.statutory_codes;
create trigger statutory_code_finality_trg
before update or delete on public.statutory_codes
for each row execute function app_private.enforce_statutory_code_finality();

create or replace function app_private.enforce_statutory_code_mapping_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_set public.statutory_code_sets%rowtype;
  v_code public.statutory_codes%rowtype;
  v_school_tenant uuid;
begin
  select * into v_code from public.statutory_codes where id = new.code_id;
  if not found then
    raise exception 'Statutory code does not exist';
  end if;

  select * into v_set from public.statutory_code_sets where id = v_code.code_set_id;
  if not found then
    raise exception 'Statutory code set does not exist';
  end if;

  select tenant_id into v_school_tenant
  from public.schools
  where id = new.school_id;
  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Statutory mapping scope mismatch: school does not belong to tenant';
  end if;

  if new.effective_from < v_set.effective_from
     or (
       v_set.effective_to is not null
       and (new.effective_to is null or new.effective_to > v_set.effective_to)
     ) then
    raise exception 'Statutory mapping effective period falls outside the code-set version';
  end if;

  if not app_private.statutory_target_matches_scope(
    new.target_type,
    new.target_id,
    new.tenant_id,
    new.school_id,
    new.effective_from
  ) then
    raise exception 'Statutory mapping target does not belong to the supplied school and tenant scope';
  end if;

  if new.status = 'active' and exists (
    select 1
    from public.statutory_code_mappings m
    join public.statutory_codes c on c.id = m.code_id
    where m.id <> new.id
      and c.code_set_id = v_code.code_set_id
      and m.tenant_id = new.tenant_id
      and m.school_id = new.school_id
      and m.target_type = new.target_type
      and m.target_id = new.target_id
      and m.status = 'active'
      and daterange(m.effective_from, coalesce(m.effective_to, 'infinity'::date), '[]')
          && daterange(new.effective_from, coalesce(new.effective_to, 'infinity'::date), '[]')
  ) then
    raise exception 'Overlapping active statutory mappings are not allowed for the same code-set version and canonical target';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_statutory_code_mapping_integrity()
from public, anon, authenticated;

drop trigger if exists statutory_code_mapping_integrity_trg
on public.statutory_code_mappings;
create trigger statutory_code_mapping_integrity_trg
before insert or update of
  tenant_id, school_id, code_id, target_type, target_id, effective_from, effective_to, status
on public.statutory_code_mappings
for each row execute function app_private.enforce_statutory_code_mapping_integrity();

alter table public.statutory_code_sets enable row level security;
alter table public.statutory_codes enable row level security;
alter table public.statutory_code_mappings enable row level security;

create policy "school actors read published statutory code sets"
on public.statutory_code_sets for select to authenticated
using (
  app_private.has_platform_role(array['platform_admin'])
  or (status in ('published','superseded','withdrawn') and app_private.can_read_statutory_code_registry())
);

create policy "platform admins manage statutory code sets"
on public.statutory_code_sets for all to authenticated
using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));

create policy "school actors read active published statutory codes"
on public.statutory_codes for select to authenticated
using (
  app_private.has_platform_role(array['platform_admin'])
  or (
    status = 'active'
    and app_private.can_read_statutory_code_registry()
    and exists (
      select 1
      from public.statutory_code_sets s
      where s.id = statutory_codes.code_set_id
        and s.status in ('published','superseded','withdrawn')
    )
  )
);

create policy "platform admins manage statutory codes"
on public.statutory_codes for all to authenticated
using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));

create policy "school actors read scoped active statutory mappings"
on public.statutory_code_mappings for select to authenticated
using (
  app_private.has_platform_role(array['platform_admin'])
  or (
    status = 'active'
    and app_private.can_read_statutory_code_mapping(school_id)
  )
);

create policy "platform admins manage statutory code mappings"
on public.statutory_code_mappings for all to authenticated
using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));

revoke all on public.statutory_code_sets from anon, authenticated;
revoke all on public.statutory_codes from anon, authenticated;
revoke all on public.statutory_code_mappings from anon, authenticated;
grant select, insert, update, delete on public.statutory_code_sets to authenticated;
grant select, insert, update, delete on public.statutory_codes to authenticated;
grant select, insert, update, delete on public.statutory_code_mappings to authenticated;

create or replace function public.resolve_statutory_code_set(
  p_set_key text,
  p_as_of date
)
returns table (
  code_set_id uuid,
  version_key text,
  effective_from date,
  effective_to date,
  source_reference text,
  source_metadata jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if auth.uid() is null or not app_private.can_read_statutory_code_registry() then
    raise exception 'Permission denied';
  end if;
  if nullif(btrim(coalesce(p_set_key,'')), '') is null or p_as_of is null then
    raise exception 'Code-set key and effective date are required';
  end if;

  return query
  select s.id, s.version_key, s.effective_from, s.effective_to, s.source_reference, s.source_metadata
  from public.statutory_code_sets s
  where s.set_key = btrim(p_set_key)
    and s.status in ('published','superseded','withdrawn')
    and s.effective_from <= p_as_of
    and (s.effective_to is null or s.effective_to >= p_as_of)
  order by s.effective_from desc, s.version_key desc, s.id
  limit 1;
end;
$$;

create or replace function public.resolve_statutory_code(
  p_set_key text,
  p_target_type text,
  p_target_id uuid,
  p_school_id uuid,
  p_as_of date
)
returns table (
  resolution_state text,
  code text,
  label text,
  set_version text,
  code_set_id uuid,
  code_id uuid,
  mapping_id uuid,
  source_required boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_tenant_id uuid;
  v_set public.statutory_code_sets%rowtype;
begin
  if auth.uid() is null or not app_private.can_read_statutory_code_mapping(p_school_id) then
    raise exception 'Permission denied';
  end if;
  if p_as_of is null or p_target_id is null or p_school_id is null then
    raise exception 'Canonical target, school, and effective date are required';
  end if;
  if p_target_type not in ('school','subject','staff_member','school_room') then
    raise exception 'Unsupported statutory mapping target type';
  end if;

  select tenant_id into v_tenant_id
  from public.schools
  where id = p_school_id;
  if v_tenant_id is null then
    raise exception 'School not found';
  end if;

  select s.* into v_set
  from public.statutory_code_sets s
  where s.set_key = btrim(p_set_key)
    and s.status in ('published','superseded','withdrawn')
    and s.effective_from <= p_as_of
    and (s.effective_to is null or s.effective_to >= p_as_of)
  order by s.effective_from desc, s.version_key desc, s.id
  limit 1;

  if not found then
    return query
    select 'source_required'::text, null::text, null::text, null::text,
           null::uuid, null::uuid, null::uuid, true;
    return;
  end if;

  return query
  select
    'resolved'::text,
    c.code,
    c.label,
    v_set.version_key,
    v_set.id,
    c.id,
    m.id,
    false
  from public.statutory_code_mappings m
  join public.statutory_codes c
    on c.id = m.code_id
   and c.code_set_id = v_set.id
   and c.status = 'active'
  where m.tenant_id = v_tenant_id
    and m.school_id = p_school_id
    and m.target_type = p_target_type
    and m.target_id = p_target_id
    and m.status = 'active'
    and m.effective_from <= p_as_of
    and (m.effective_to is null or m.effective_to >= p_as_of)
    and app_private.statutory_target_matches_scope(
      m.target_type, m.target_id, m.tenant_id, m.school_id, p_as_of
    )
  order by m.effective_from desc, m.id
  limit 1;

  if not found then
    return query
    select 'source_required'::text, null::text, null::text, v_set.version_key,
           v_set.id, null::uuid, null::uuid, true;
  end if;
end;
$$;

revoke all on function public.resolve_statutory_code_set(text,date) from public, anon;
revoke all on function public.resolve_statutory_code(text,text,uuid,uuid,date) from public, anon;
grant execute on function public.resolve_statutory_code_set(text,date) to authenticated;
grant execute on function public.resolve_statutory_code(text,text,uuid,uuid,date) to authenticated;

-- Seed only values explicitly supported by the supplied authoritative AEC material.
-- The reviewed questionnaire references the 2019 school year. These code-set
-- versions are therefore bounded to that reviewed cycle; later years must remain
-- source-required until a later authoritative edition is registered.

insert into public.statutory_code_sets(
  id, set_key, authority, version_key, effective_from, effective_to,
  status, source_reference, source_metadata
) values
  (
    '85810000-0000-4000-8000-000000000001',
    'aec_subject',
    'Ministry of Education, Arts and Culture',
    'supplied-aec-2019-review',
    '2019-01-01',
    '2019-12-31',
    'published',
    'AEC Form Main (2).pdf — supplied authoritative material reviewed in docs/10-statutory/AEC-SOURCE-AUDIT.md',
    '{"scope_note":"Only explicitly evidenced subject codes are registered. No adjacent or complete Ministry subject list is inferred."}'::jsonb
  ),
  (
    '85810000-0000-4000-8000-000000000002',
    'aec_appointment_category',
    'Ministry of Education, Arts and Culture',
    'supplied-aec-2019-review',
    '2019-01-01',
    '2019-12-31',
    'published',
    'AEC Form Main (2).pdf — supplied authoritative material reviewed in docs/10-statutory/AEC-SOURCE-AUDIT.md',
    '{"scope_note":"Only explicitly evidenced appointment codes are registered. Later revisions require a new code-set version."}'::jsonb
  )
on conflict (set_key, version_key) do nothing;

insert into public.statutory_codes(
  id, code_set_id, code, label, status, source_metadata
) values
  ('85820000-0000-4000-8000-000000000001','85810000-0000-4000-8000-000000000001','2567','Biology','active','{"evidence":"supplied AEC material"}'::jsonb),
  ('85820000-0000-4000-8000-000000000002','85810000-0000-4000-8000-000000000001','5134','Mathematics','active','{"evidence":"supplied AEC material"}'::jsonb),
  ('85820000-0000-4000-8000-000000000003','85810000-0000-4000-8000-000000000001','6136','Physics','active','{"evidence":"supplied AEC material"}'::jsonb),
  ('85820000-0000-4000-8000-000000000004','85810000-0000-4000-8000-000000000001','4913','Life Science','active','{"evidence":"supplied AEC material"}'::jsonb),
  ('85820000-0000-4000-8000-000000000011','85810000-0000-4000-8000-000000000002','1','Permanent','active','{"evidence":"supplied AEC material"}'::jsonb),
  ('85820000-0000-4000-8000-000000000012','85810000-0000-4000-8000-000000000002','2','On probation','active','{"evidence":"supplied AEC material"}'::jsonb),
  ('85820000-0000-4000-8000-000000000013','85810000-0000-4000-8000-000000000002','3','Part-time','active','{"evidence":"supplied AEC material"}'::jsonb),
  ('85820000-0000-4000-8000-000000000014','85810000-0000-4000-8000-000000000002','4','Relief','active','{"evidence":"supplied AEC material"}'::jsonb),
  ('85820000-0000-4000-8000-000000000015','85810000-0000-4000-8000-000000000002','5','Contract','active','{"evidence":"supplied AEC material"}'::jsonb),
  ('85820000-0000-4000-8000-000000000016','85810000-0000-4000-8000-000000000002','6','Volunteer','active','{"evidence":"supplied AEC material"}'::jsonb)
on conflict (code_set_id, code) do nothing;

create or replace function app_private.audit_statutory_code_registry_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_tenant_id uuid := nullif(v_row->>'tenant_id','')::uuid;
  v_school_id uuid := nullif(v_row->>'school_id','')::uuid;
  v_entity_id uuid := nullif(v_row->>'id','')::uuid;
begin
  insert into public.audit_events(
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    v_tenant_id,
    v_school_id,
    auth.uid(),
    'statutory.code_registry.' || lower(tg_op),
    tg_table_name,
    v_entity_id,
    jsonb_build_object(
      'set_key', v_row->>'set_key',
      'version_key', v_row->>'version_key',
      'code', v_row->>'code',
      'target_type', v_row->>'target_type',
      'target_id', v_row->>'target_id',
      'status', v_row->>'status'
    )
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function app_private.audit_statutory_code_registry_mutation()
from public, anon, authenticated;

drop trigger if exists statutory_code_sets_audit_trg on public.statutory_code_sets;
create trigger statutory_code_sets_audit_trg
after insert or update or delete on public.statutory_code_sets
for each row execute function app_private.audit_statutory_code_registry_mutation();

drop trigger if exists statutory_codes_audit_trg on public.statutory_codes;
create trigger statutory_codes_audit_trg
after insert or update or delete on public.statutory_codes
for each row execute function app_private.audit_statutory_code_registry_mutation();

drop trigger if exists statutory_code_mappings_audit_trg on public.statutory_code_mappings;
create trigger statutory_code_mappings_audit_trg
after insert or update or delete on public.statutory_code_mappings
for each row execute function app_private.audit_statutory_code_registry_mutation();

comment on table public.statutory_code_sets is
'Platform-owned, versioned statutory reference-code sets. Codes are export/mapping identifiers and never replace canonical ScolaPro entity ids.';
comment on table public.statutory_codes is
'Official code values belonging to one statutory code-set version, with inactive/superseded history preserved.';
comment on table public.statutory_code_mappings is
'Effective-dated mapping from a canonical ScolaPro entity to one statutory output code within an explicit tenant/school scope.';
comment on function public.resolve_statutory_code_set(text,date) is
'Deterministically selects the applicable published version of a statutory code set for an effective date.';
comment on function public.resolve_statutory_code(text,text,uuid,uuid,date) is
'Resolves one canonical school-scoped entity to an active statutory output code, otherwise returns source_required without guessing.';
