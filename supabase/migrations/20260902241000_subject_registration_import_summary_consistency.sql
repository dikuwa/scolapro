alter function public.reconcile_subject_registration_import_batch(uuid)
  rename to reconcile_subject_registration_import_batch_internal;

revoke all on function public.reconcile_subject_registration_import_batch_internal(uuid)
from public,anon,authenticated;

create or replace function public.reconcile_subject_registration_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_result jsonb;
  v_register integer;
  v_reactivate integer;
  v_withdraw integer;
  v_skip integer;
  v_error integer;
begin
  -- The internal reconciler performs all validation/matching and persists the final
  -- per-row resolutions, including the post-pass duplicate detection. Build the
  -- caller-facing summary from those final persisted resolutions so it cannot drift
  -- from import_batches after duplicate rows are converted to errors.
  perform public.reconcile_subject_registration_import_batch_internal(p_batch_id);

  select
    count(*) filter(where r.resolution='create' and coalesce(r.normalized_data->>'action','register')='register')::integer,
    count(*) filter(where r.resolution='update' and r.normalized_data->>'action'='register')::integer,
    count(*) filter(where r.resolution='update' and r.normalized_data->>'action'='withdraw')::integer,
    count(*) filter(where r.resolution='skip')::integer,
    count(*) filter(where r.resolution='error')::integer
  into v_register,v_reactivate,v_withdraw,v_skip,v_error
  from public.import_rows r
  where r.batch_id=p_batch_id;

  v_result:=jsonb_build_object(
    'register',coalesce(v_register,0),
    'reactivate',coalesce(v_reactivate,0),
    'withdraw',coalesce(v_withdraw,0),
    'skip',coalesce(v_skip,0),
    'error',coalesce(v_error,0)
  );
  return v_result;
end;
$$;

revoke all on function public.reconcile_subject_registration_import_batch(uuid)
from public,anon;
grant execute on function public.reconcile_subject_registration_import_batch(uuid)
to authenticated;

comment on function public.reconcile_subject_registration_import_batch(uuid) is
'Reconciles subject-registration import rows and returns counts derived from final persisted resolutions, so duplicate-row errors and the batch summary cannot diverge.';
comment on function public.reconcile_subject_registration_import_batch_internal(uuid) is
'Private implementation for subject-registration import matching and row resolution. Clients use the public wrapper, which computes its summary from final persisted resolutions.';
