-- Bulk report-card preparation is a primary school workflow. Keep the existing
-- per-learner governed snapshot builder as the source of truth, but execute a selected
-- class/grade/school batch inside one database call so large schools do not issue
-- hundreds of sequential network requests.

create or replace function public.build_report_card_snapshots_bulk(
  p_enrolment_ids uuid[],
  p_term_number smallint,
  p_template_version text default 'SCOLAPRO_TERM_REPORT_V1'
)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_enrolment_id uuid;
  v_generated integer := 0;
  v_skipped integer := 0;
  v_failures jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_term_number<1 or p_term_number>6 then raise exception 'Term number is invalid'; end if;
  if coalesce(array_length(p_enrolment_ids,1),0)=0 then raise exception 'Choose at least one learner'; end if;
  if array_length(p_enrolment_ids,1)>5000 then raise exception 'A report-card batch cannot exceed 5000 learners'; end if;

  foreach v_enrolment_id in array p_enrolment_ids loop
    begin
      perform public.build_report_card_snapshot(v_enrolment_id,p_term_number,p_template_version);
      v_generated := v_generated + 1;
    exception when others then
      v_skipped := v_skipped + 1;
      if jsonb_array_length(v_failures) < 25 then
        v_failures := v_failures || jsonb_build_array(jsonb_build_object(
          'enrolment_id',v_enrolment_id,
          'reason',sqlerrm
        ));
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'generated',v_generated,
    'skipped',v_skipped,
    'failures',v_failures
  );
end;
$$;

revoke all on function public.build_report_card_snapshots_bulk(uuid[],smallint,text) from public,anon;
grant execute on function public.build_report_card_snapshots_bulk(uuid[],smallint,text) to authenticated;

comment on function public.build_report_card_snapshots_bulk(uuid[],smallint,text) is
'Bulk wrapper around the governed per-learner report-card snapshot builder. Returns generated/skipped counts and a capped diagnostic sample without weakening per-learner authorization or result-readiness checks.';
