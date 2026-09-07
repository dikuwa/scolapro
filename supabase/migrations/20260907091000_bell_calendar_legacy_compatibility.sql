-- Preserve pre-N17 school_day_overrides writes while deriving teaching impact consistently.
-- Existing callers historically wrote only is_school_day; governed N17 writes use
-- configure_school_teaching_day() and persist the richer teaching_impact value.

alter table public.school_day_overrides
  drop constraint if exists school_day_overrides_teaching_impact_school_day_check;

create or replace function public.resolve_school_teaching_impact(
  p_school_id uuid,
  p_target_date date
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select coalesce(
    (
      select case
        when not sdo.is_school_day then 'NO_TEACHING'
        else sdo.teaching_impact
      end
      from public.school_day_overrides sdo
      where sdo.school_id = p_school_id
        and sdo.school_date = p_target_date
    ),
    case
      when app_private.is_expected_school_day(p_school_id, p_target_date) then 'NORMAL'
      else 'NO_TEACHING'
    end
  );
$$;

revoke all on function public.resolve_school_teaching_impact(uuid,date) from public, anon;
grant execute on function public.resolve_school_teaching_impact(uuid,date) to authenticated;

comment on function public.resolve_school_teaching_impact(uuid,date) is
  'Resolves richer N17 teaching impact while preserving legacy is_school_day=false overrides as NO_TEACHING.';
