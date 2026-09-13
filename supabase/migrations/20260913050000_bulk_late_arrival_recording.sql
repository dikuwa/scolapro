-- Bulk recording of school late arrivals for multi-select class/group workflows.
-- Reuses canonical record_school_late_arrival implementation to enforce current-school,
-- current enrolment, date boundaries, actor provenance, cumulative threshold triggers,
-- and immutable audit history.

create or replace function public.bulk_record_school_late_arrivals(
  p_enrolment_ids uuid[],
  p_arrival_date date default current_date,
  p_arrived_at time without time zone default null,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare
  v_id uuid;
  v_recorded_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce(cardinality(p_enrolment_ids), 0) = 0 then
    raise exception 'Select at least one learner enrolment to record late arrival';
  end if;

  foreach v_id in array p_enrolment_ids loop
    if v_id is not null then
      perform public.record_school_late_arrival(
        p_enrolment_id := v_id,
        p_arrival_date := p_arrival_date,
        p_arrived_at := p_arrived_at,
        p_note := p_note
      );
      v_recorded_count := v_recorded_count + 1;
    end if;
  end loop;

  return v_recorded_count;
end;
$function$;

revoke all on function public.bulk_record_school_late_arrivals(uuid[], date, time without time zone, text) from public, anon;
grant execute on function public.bulk_record_school_late_arrivals(uuid[], date, time without time zone, text) to authenticated;

comment on function public.bulk_record_school_late_arrivals(uuid[], date, time without time zone, text) is
'Canonical governed batch operation for recording morning late arrivals across multiple learners in a class/group while preserving actor, school, enrolment, and trigger provenance.';
