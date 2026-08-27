create or replace function public.submit_weekly_register(
  p_register_class_id uuid,
  p_days jsonb,
  p_source text default 'online'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_date date;
  v_submission_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_monday date;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_days) <> 'array' then raise exception 'Weekly register days must be an array'; end if;

  v_count := jsonb_array_length(p_days);
  if v_count < 1 or v_count > 5 then raise exception 'Weekly register must contain one to five school days'; end if;

  for v_item in select value from jsonb_array_elements(p_days)
  loop
    v_date := (v_item ->> 'date')::date;
    if extract(isodow from v_date) > 5 then raise exception 'Normal weekly attendance cannot include Saturday or Sunday'; end if;

    if v_monday is null then
      v_monday := v_date - (extract(isodow from v_date)::integer - 1);
    elsif v_date < v_monday or v_date > v_monday + 4 then
      raise exception 'All submitted attendance dates must belong to the same Monday-Friday week';
    end if;

    v_submission_id := public.submit_daily_register(
      p_register_class_id,
      v_date,
      coalesce(v_item -> 'exceptions', '[]'::jsonb),
      null,
      nullif(v_item ->> 'client_mutation_id', '')::uuid,
      nullif(v_item ->> 'replaces_submission_id', '')::uuid,
      p_source
    );

    v_results := v_results || jsonb_build_array(jsonb_build_object('date', v_date, 'submission_id', v_submission_id));
  end loop;

  return v_results;
end;
$$;

revoke all on function public.submit_weekly_register(uuid,jsonb,text) from public, anon;
grant execute on function public.submit_weekly_register(uuid,jsonb,text) to authenticated;

comment on function public.submit_weekly_register(uuid,jsonb,text) is 'Atomically confirms one Monday-Friday register week while preserving one auditable daily submission per school day.';
