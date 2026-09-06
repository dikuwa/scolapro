-- Complete the frozen report-card calendar profile at an academic-year boundary.
-- The existing template-profile trigger resolves the next term inside the same year.
-- When that leaves `next_term_starts_on` empty (normally the final term), this
-- second BEFORE INSERT trigger freezes the earliest configured future-year term.

create or replace function app_private.resolve_report_card_future_term_start(
  p_school_id uuid,
  p_academic_year integer
)
returns date
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select t.starts_on
  from public.academic_terms t
  join public.academic_years y on y.id=t.academic_year_id
  where t.school_id=p_school_id
    and y.school_id=p_school_id
    and y.year>p_academic_year
    and t.starts_on is not null
  order by y.year asc,t.term_number asc
  limit 1;
$$;

revoke all on function app_private.resolve_report_card_future_term_start(uuid,integer)
from public,anon,authenticated;
grant execute on function app_private.resolve_report_card_future_term_start(uuid,integer)
to service_role;

create or replace function app_private.enrich_report_card_snapshot_future_term_start()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_current_next_term text;
  v_future_term_start date;
begin
  v_current_next_term := nullif(btrim(coalesce(new.data_snapshot ->> 'next_term_starts_on','')), '');
  if v_current_next_term is not null then
    return new;
  end if;

  select app_private.resolve_report_card_future_term_start(new.school_id,new.academic_year)
  into v_future_term_start;

  if v_future_term_start is not null then
    new.data_snapshot := jsonb_set(
      coalesce(new.data_snapshot,'{}'::jsonb),
      '{next_term_starts_on}',
      to_jsonb(v_future_term_start),
      true
    );
  end if;

  return new;
end;
$$;

revoke all on function app_private.enrich_report_card_snapshot_future_term_start()
from public,anon,authenticated;

drop trigger if exists report_card_snapshot_year_boundary_next_term_enrichment_trg
on public.report_card_snapshots;

-- PostgreSQL executes triggers with the same timing/event alphabetically. This name
-- intentionally sorts after `report_card_snapshot_template_profile_enrichment_trg`,
-- so the same-year term selected there always wins before this future-year fallback.
create trigger report_card_snapshot_year_boundary_next_term_enrichment_trg
before insert on public.report_card_snapshots
for each row
execute function app_private.enrich_report_card_snapshot_future_term_start();

comment on function app_private.enrich_report_card_snapshot_future_term_start() is
  'Freezes the earliest configured future academic-year term start into a new report-card snapshot only when same-year template enrichment found no next term.';
