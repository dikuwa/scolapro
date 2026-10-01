-- #951: collapse Sports / Houses workspace metadata fan-out into one RLS-preserving request.
create or replace function public.get_sports_house_workspace_metadata(
  p_school_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select pg_catalog.jsonb_build_object(
    'school',
      (
        select pg_catalog.jsonb_build_object(
          'id', s.id,
          'name', s.name
        )
        from public.schools s
        where s.id = p_school_id
        limit 1
      ),
    'houses',
      coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', h.id,
              'name', h.name,
              'short_code', h.short_code,
              'color_hex', h.color_hex,
              'sort_order', h.sort_order,
              'status', h.status,
              'created_by_user_id', h.created_by_user_id,
              'created_at', h.created_at,
              'updated_at', h.updated_at
            )
            order by h.sort_order, h.name
          )
          from public.sports_houses h
          where h.school_id = p_school_id
        ),
        '[]'::jsonb
      ),
    'settings',
      coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'academic_year', ys.academic_year,
              'age_reference_date', ys.age_reference_date,
              'assignment_continuity', ys.assignment_continuity
            )
            order by ys.academic_year desc
          )
          from public.sports_year_settings ys
          where ys.school_id = p_school_id
        ),
        '[]'::jsonb
      ),
    'age_groups',
      coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', ag.id,
              'label', ag.label,
              'min_age', ag.min_age,
              'max_age', ag.max_age,
              'sort_order', ag.sort_order,
              'status', ag.status
            )
            order by ag.sort_order, ag.label
          )
          from public.sports_age_groups ag
          where ag.school_id = p_school_id
        ),
        '[]'::jsonb
      )
  );
$$;

revoke all on function public.get_sports_house_workspace_metadata(uuid) from public, anon;
grant execute on function public.get_sports_house_workspace_metadata(uuid) to authenticated;

comment on function public.get_sports_house_workspace_metadata(uuid) is
  'Returns RLS-visible Sports/Houses workspace metadata for one school in a single request without widening source-table authorization.';