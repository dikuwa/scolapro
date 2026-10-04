-- Issue #1057: alphanumeric grade codes must not break School Directory.
-- Preserve the governed RPC signature, SECURITY DEFINER boundary, filters,
-- contact fields and the existing nonnumeric grade display path.

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
  grade_values as (
    select
      gs.school_id,
      g.grade_code,
      case
        when g.grade_code ~ '^[0-9]+$' then g.grade_code::integer
        else null
      end as numeric_grade
    from public.grades g
    join grades_scope gs on gs.school_id = g.school_id
      and gs.academic_year = g.academic_year
  ),
  grades_per_school as (
    select
      gv.school_id,
      case
        when bool_and(gv.numeric_grade is not null) then min(gv.numeric_grade)::text
        else min(gv.grade_code)
      end as minimum_grade,
      case
        when bool_and(gv.numeric_grade is not null) then max(gv.numeric_grade)::text
        else max(gv.grade_code)
      end as maximum_grade,
      case
        when bool_and(gv.numeric_grade is not null) then
          min(gv.numeric_grade)::text || '–' || max(gv.numeric_grade)::text
        else string_agg(distinct gv.grade_code, ', ' order by gv.grade_code)
      end as grades_offered_display
    from grade_values gv
    group by gv.school_id
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
