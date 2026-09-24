-- Issue #705 — Attendance: Official Summary calculation + readiness.
--
-- The official weekly/term summary derives % absence from canonical
-- daily-register data (daily_register_current / attendance_events) and needs
-- the shared teaching-day resolution (override > learner-event baseline >
-- expected Mon-Fri school day) applied across a whole date range in one
-- round trip instead of one RPC call per day. This resolver is a pure
-- per-date fan-out of public.resolve_school_teaching_impact; it introduces
-- no new teaching-day semantics and writes nothing.

create or replace function public.resolve_school_teaching_impact_range(
  p_school_id uuid,
  p_from date,
  p_to date
)
returns table (target_date date, teaching_impact text)
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  with baseline as (
    select day,
      app_private.resolve_learner_event_teaching_impact(p_school_id, day) as event_impact
    from generate_series(p_from, p_to, interval '1 day') as series(day)
  ),
  overrides as (
    select sdo.school_date, sdo.is_school_day, sdo.teaching_impact
    from public.school_day_overrides sdo
    where sdo.school_id = p_school_id
      and sdo.school_date between p_from and p_to
  )
  select
    baseline.day as target_date,
    coalesce(
      (select case
        when not overrides.is_school_day then 'NO_TEACHING'
        else overrides.teaching_impact end
      from overrides
      where overrides.school_date = baseline.day),
      baseline.event_impact,
      case
        when baseline.event_impact = 'NO_TEACHING' then 'NO_TEACHING'
        when extract(isodow from baseline.day) between 1 and 5 then 'NORMAL'
        else 'NO_TEACHING'
      end
    ) as teaching_impact
  from baseline;
$$;

revoke all on function public.resolve_school_teaching_impact_range(uuid, date, date) from public, anon;
grant execute on function public.resolve_school_teaching_impact_range(uuid, date, date) to authenticated;

comment on function public.resolve_school_teaching_impact_range(uuid, date, date) is
'Per-date fan-out of resolve_school_teaching_impact over [p_from, p_to]. School-day overrides win, all-learner event baseline applies, weekends are NO_TEACHING. Read-only support for the official attendance summary; not authoritative for capture gating.';

-- Weekly/term official summaries read attendance_events by school and date
-- range (NO_TEACHING exclusion, denominator sanity) without scanning every
-- event for the school. Other access paths (class/day, submission joins)
-- already have dedicated indexes.
create index if not exists attendance_events_school_date_idx
  on public.attendance_events (school_id, attendance_date);
