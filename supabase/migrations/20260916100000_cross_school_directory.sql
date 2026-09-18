-- Cross-school directory foundation.
--
-- Adds public institutional contact fields for the authenticated cross-school
-- directory:
--   1. Circuit inspector public contact columns on the existing circuit model
--      with school-level provenance (no individual staff attribution exposed).
--   2. `public.search_school_directory` — the ONE governed read model. Returns
--      an explicit allowlisted column set; never SELECT *; never exposes
--      settings JSON, private staff contact data, learner data or banking.
--   3. `public.update_circuit_inspector_contact` — governed write for any
--      currently authorized school-management user whose school holds a CURRENT
--      effective assignment to that circuit. Circuit identity/hierarchy stays
--      platform-admin-only.
--   4. Two narrowly-scoped public-field settings RPCs that MERGE into the
--      existing `document_profile` setting instead of replacing it, so the
--      report-card document profile save path never loses unknown keys.
--   5. A guarded trigger preserving `inspector_updated_by_school_id` integrity
--      against accidental broad mutation paths.

-- Circuit inspector public contact (preferred simple model: extend circuits).
alter table public.education_circuits
  add column if not exists inspector_name text null,
  add column if not exists inspector_phone text null,
  add column if not exists inspector_email text null,
  add column if not exists inspector_updated_at timestamptz null,
  add column if not exists inspector_updated_by_school_id uuid null
    references public.schools(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'education_circuits_inspector_email_format'
  ) then
    alter table public.education_circuits
      add constraint education_circuits_inspector_email_format
      check (inspector_email is null or inspector_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
  end if;
end $$;

-- Bounded invariant: only the governed RPC (or platform service role) may set
-- provenance columns, so broad platform write paths cannot corrupt attribution.
create or replace function app_private.enforce_circuit_inspector_provenance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.inspector_updated_by_school_id is not null
      and new.inspector_updated_at is null then
      raise exception 'inspector_updated_at is required when inspector_updated_by_school_id is set';
    end if;
    return new;
  end if;

  if new.inspector_updated_by_school_id is distinct from old.inspector_updated_by_school_id
    or new.inspector_updated_at is distinct from old.inspector_updated_at then
    if current_user <> 'service_role'
      and (current_setting('app.current_actor_is_inspector_contact_writer', true) is distinct from 'on') then
      raise exception 'Circuit inspector provenance is set only by the governed inspector-contact RPC';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_circuit_inspector_provenance()
from public, anon, authenticated;

drop trigger if exists education_circuits_inspector_provenance_trg on public.education_circuits;
create trigger education_circuits_inspector_provenance_trg
before insert or update on public.education_circuits
for each row execute function app_private.enforce_circuit_inspector_provenance();

-- ==========================================================================
-- Directory read model: ONE canonical governed RPC.
-- Security: authenticated only, SECURITY DEFINER so RLS-poor operational
-- tables never need directory-motivated broadening. Fixed search_path.
-- ==========================================================================
create or replace function public.search_school_directory(
  p_search text default null,
  p_region_id uuid default null,
  p_circuit_id uuid default null
)
returns table (
  school_id uuid,
  school_name text,
  emis_number text,
  town text,
  region text,
  physical_address text,
  postal_address text,
  telephone text,
  fax text,
  school_email text,
  school_cellphone text,
  principal_name text,
  principal_public_email text,
  grades_offered_display text,
  minimum_grade text,
  maximum_grade text,
  region_id uuid,
  region_name text,
  circuit_id uuid,
  circuit_name text,
  inspector_name text,
  inspector_phone text,
  inspector_email text,
  inspector_last_updated_at timestamptz,
  inspector_last_updated_by_school_id uuid,
  inspector_last_updated_by_school_name text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with current_assignments as (
    select distinct on (sna.school_id)
      sna.school_id, sna.region_id, sna.circuit_id
    from public.school_network_assignments sna
    where sna.effective_from <= current_date
      and (sna.effective_to is null or sna.effective_to >= current_date)
    order by sna.school_id, sna.effective_from desc, sna.id
  ),
  principal as (
    select distinct on (m.school_id)
      m.school_id,
      concat_ws(' ', sm.first_name, sm.last_name) as principal_name
    from public.school_memberships m
    join public.staff_members sm on sm.id = m.staff_member_id
    left join lateral (
      select 1
      from public.staff_school_assignments ssa
      where ssa.staff_member_id = sm.id
        and ssa.school_id = m.school_id
        and ssa.effective_from <= current_date
        and (ssa.effective_to is null or ssa.effective_to >= current_date)
      limit 1
    ) placement on true
    where m.role_key = 'principal'
      and m.active_from <= current_date
      and (m.active_to is null or m.active_to >= current_date)
      and sm.status = 'active'
      and (
        -- Authoritative placement history: if assignments exist for this
        -- school, at least one must be currently effective. Schools that do
        -- not use the placement history keep the legacy membership semantics.
        not exists (
          select 1 from public.staff_school_assignments ssa_hist
          where ssa_hist.staff_member_id = sm.id
            and ssa_hist.school_id = m.school_id
        )
        or placement is not null
      )
    order by m.school_id, m.active_from desc, m.id
  ),
  grades_scope as (
    select distinct
      g.school_id, g.academic_year
    from public.grades g
    join public.academic_years ay on ay.id = (
      select ay2.id
      from public.academic_years ay2
      where ay2.school_id = g.school_id and ay2.year = g.academic_year
      order by case ay2.status when 'active' then 0 when 'setup' then 1 else 2 end, ay2.year desc
      limit 1
    )
  ),
  grades_per_school as (
    select
      gs.school_id,
      min(g.grade_code) as minimum_grade,
      max(g.grade_code) as maximum_grade,
      case
        when bool_and(g.grade_code ~ '^[0-9]+$') then
          min(g.grade_code::integer)::text || '–' || max(g.grade_code::integer)::text
        else string_agg(distinct g.grade_code, ', ' order by g.grade_code)
      end as grades_offered_display
    from public.grades g
    join grades_scope gs on gs.school_id = g.school_id
      and gs.academic_year = g.academic_year
    group by gs.school_id
  ),
  directory_schools as (
    select
      s.id as school_id,
      s.name as school_name,
      s.emis_number,
      s.town,
      s.region,
      nullif(btrim(sp.setting_value ->> 'physical_address'), '') as physical_address,
      nullif(btrim(sp.setting_value ->> 'postal_address'), '') as postal_address,
      nullif(btrim(sp.setting_value ->> 'telephone'), '') as telephone,
      nullif(btrim(sp.setting_value ->> 'fax'), '') as fax,
      nullif(btrim(sp.setting_value ->> 'email'), '') as school_email,
      nullif(btrim(sp.setting_value ->> 'cellphone'), '') as school_cellphone,
      p.principal_name,
      nullif(btrim(sp.setting_value ->> 'principal_public_email'), '') as principal_public_email,
      g.grades_offered_display,
      g.minimum_grade,
      g.maximum_grade,
      sna.region_id,
      er.name as region_name,
      sna.circuit_id,
      ec.name as circuit_name,
      ec.inspector_name,
      ec.inspector_phone,
      ec.inspector_email,
      ec.inspector_updated_at as inspector_last_updated_at,
      ec.inspector_updated_by_school_id as inspector_last_updated_by_school_id,
      upd_school.name as inspector_last_updated_by_school_name
    from public.schools s
    left join public.school_settings sp
      on sp.school_id = s.id and sp.setting_key = 'document_profile'
    left join principal p on p.school_id = s.id
    left join grades_per_school g on g.school_id = s.id
    left join current_assignments sna on sna.school_id = s.id
    left join public.education_regions er on er.id = sna.region_id
    left join public.education_circuits ec on ec.id = sna.circuit_id
    left join public.schools upd_school on upd_school.id = ec.inspector_updated_by_school_id
    where s.status = 'active'
      and s.tenant_id in (
        select t.id from public.tenants t where t.status = 'active'
      )
      and (
        p_search is null or btrim(p_search) = ''
        or s.name ilike '%' || btrim(p_search) || '%'
        or (s.emis_number is not null and s.emis_number ilike '%' || btrim(p_search) || '%')
      )
      and (p_region_id is null or sna.region_id = p_region_id)
      and (p_circuit_id is null or sna.circuit_id = p_circuit_id)
  )
  select * from directory_schools
  order by circuit_name nulls last, school_name;
$$;

revoke all on function public.search_school_directory(text, uuid, uuid)
from public, anon;
grant execute on function public.search_school_directory(text, uuid, uuid)
to authenticated;

-- ==========================================================================
-- Governed inspector-contact write RPC.
-- Authorization:
--   1. auth.uid() exists
--   2. caller belongs to a current school
--   3. caller holds the existing School Settings management role set
--      (school_admin / principal / deputy_principal) via current membership
--   4. caller's school has a CURRENT effective school_network_assignments row
--      for p_circuit_id
--   5. effective staff placement is valid where the school uses placement
--      history
--   6. platform roles carry no school-operational authority
--   7. only the caller's current-school circuit may be edited
--   8. no cross-tenant authority bridging
-- ==========================================================================
create or replace function public.update_circuit_inspector_contact(
  p_circuit_id uuid,
  p_inspector_name text,
  p_inspector_phone text,
  p_inspector_email text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_id uuid;
  v_actor_staff_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select m.school_id, m.staff_member_id
  into v_school_id, v_actor_staff_member_id
  from public.school_memberships m
  where m.user_id = auth.uid()
    and m.role_key in ('school_admin', 'principal', 'deputy_principal')
    and m.active_from <= current_date
    and (m.active_to is null or m.active_to >= current_date)
    and exists (select 1 from public.schools s where s.id = m.school_id and s.status = 'active')
    and exists (select 1 from public.tenants t where t.id = m.tenant_id and t.status = 'active')
  order by m.active_from desc
  limit 1;

  if v_school_id is null then
    raise exception 'Current School Settings authority is required to update circuit inspector contact';
  end if;

  -- Effective staff placement is required where the school maintains placement
  -- history for the acting staff member.
  if v_actor_staff_member_id is not null
    and exists (
      select 1 from public.staff_school_assignments ssa
      where ssa.staff_member_id = v_actor_staff_member_id
        and ssa.school_id = v_school_id
    )
    and not exists (
      select 1 from public.staff_school_assignments ssa
      where ssa.staff_member_id = v_actor_staff_member_id
        and ssa.school_id = v_school_id
        and ssa.effective_from <= current_date
        and (ssa.effective_to is null or ssa.effective_to >= current_date)
    ) then
    raise exception 'Effective school placement is required to update circuit inspector contact';
  end if;

  if not exists (
    select 1
    from public.school_network_assignments sna
    where sna.school_id = v_school_id
      and sna.circuit_id = p_circuit_id
      and sna.effective_from <= current_date
      and (sna.effective_to is null or sna.effective_to >= current_date)
  ) then
    raise exception 'Your school does not hold a current assignment to this circuit';
  end if;

  -- Prove the circuit exists; identity/hierarchy columns stay untouched here.
  if not exists (select 1 from public.education_circuits ec where ec.id = p_circuit_id) then
    raise exception 'Circuit not found';
  end if;

  perform set_config('app.current_actor_is_inspector_contact_writer', 'on', true);

  update public.education_circuits
  set inspector_name = nullif(btrim(p_inspector_name), ''),
      inspector_phone = nullif(btrim(p_inspector_phone), ''),
      inspector_email = nullif(btrim(p_inspector_email), ''),
      inspector_updated_at = now(),
      inspector_updated_by_school_id = v_school_id
  where id = p_circuit_id;

  perform set_config('app.current_actor_is_inspector_contact_writer', 'off', true);
end;
$$;

revoke all on function public.update_circuit_inspector_contact(uuid, text, text, text)
from public, anon;
grant execute on function public.update_circuit_inspector_contact(uuid, text, text, text)
to authenticated;

-- ==========================================================================
-- Own-school public contact fields merge into the EXISTING document_profile
-- setting. These RPCs read-modify-write the whole profile so unrelated keys
-- (including ones written by future features) survive.
-- ==========================================================================
create or replace function public.set_school_directory_contact(
  p_school_id uuid,
  p_cellphone text,
  p_principal_public_email text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile jsonb;
  v_tenant_id uuid;
begin
  if not app_private.can_manage_report_card_settings(p_school_id) then
    raise exception 'Not authorised to manage school settings';
  end if;

  select s.tenant_id into v_tenant_id
  from public.schools s
  where s.id = p_school_id and s.status = 'active';

  if v_tenant_id is null then
    raise exception 'Not authorised to manage school settings';
  end if;

  if p_cellphone is not null and length(btrim(p_cellphone)) > 80 then
    raise exception 'Cellphone must be 80 characters or fewer';
  end if;
  if p_principal_public_email is not null and btrim(p_principal_public_email) <> ''
    and p_principal_public_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Principal public email must be a valid email address';
  end if;

  select coalesce(setting_value, '{}'::jsonb)
  into v_profile
  from public.school_settings
  where school_id = p_school_id and setting_key = 'document_profile'
  for update;

  v_profile := coalesce(v_profile, '{}'::jsonb)
    || jsonb_build_object(
      'cellphone', nullif(btrim(p_cellphone), ''),
      'principal_public_email', nullif(btrim(p_principal_public_email), '')
    );

  insert into public.school_settings(tenant_id, school_id, setting_key, setting_value)
  values (v_tenant_id, p_school_id, 'document_profile', v_profile)
  on conflict (school_id, setting_key) do update
    set setting_value = excluded.setting_value;
end;
$$;

revoke all on function public.set_school_directory_contact(uuid, text, text)
from public, anon;
grant execute on function public.set_school_directory_contact(uuid, text, text)
to authenticated;

create or replace function public.get_school_directory_contact(p_school_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_build_object(
    'cellphone', nullif(btrim(setting_value ->> 'cellphone'), ''),
    'principal_public_email', nullif(btrim(setting_value ->> 'principal_public_email'), '')
  ), '{}'::jsonb)
  from public.school_settings
  where school_id = p_school_id
    and setting_key = 'document_profile';
$$;

revoke all on function public.get_school_directory_contact(uuid)
from public, anon;
grant execute on function public.get_school_directory_contact(uuid)
to authenticated;
