-- Exact guardian identity numbers remain the deterministic match key, but a name
-- mismatch on that identity must be reviewed instead of silently rewriting the
-- existing guardian profile.

create or replace function public.reconcile_guardian_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_batch public.import_batches%rowtype;
  v_row public.import_rows%rowtype;
  v_admission text;
  v_identity text;
  v_first_names text;
  v_surname text;
  v_learner_id uuid;
  v_guardian_id uuid;
  v_guardian_first_names text;
  v_guardian_surname text;
  v_create integer := 0;
  v_link integer := 0;
  v_review integer := 0;
  v_error integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_batch from public.import_batches where id = p_batch_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if v_batch.import_type <> 'guardians' then raise exception 'Only guardian batches can be reconciled'; end if;
  if not app_private.can_manage_school_imports(v_batch.school_id) then raise exception 'Permission denied'; end if;
  if v_batch.status not in ('staging','validating','review') then raise exception 'Import batch is not editable'; end if;

  update public.import_batches set status = 'validating', updated_at = now() where id = v_batch.id;

  for v_row in select * from public.import_rows where batch_id = v_batch.id order by row_number
  loop
    if v_row.resolution = 'error' then v_error := v_error + 1; continue; end if;
    if v_row.resolution = 'skip' then continue; end if;

    v_admission := nullif(upper(btrim(coalesce(v_row.normalized_data->>'learner_admission_number',''))), '');
    v_identity := nullif(lower(btrim(coalesce(v_row.normalized_data->>'identity_number',''))), '');
    v_first_names := lower(regexp_replace(btrim(coalesce(v_row.normalized_data->>'first_names','')), '\s+', ' ', 'g'));
    v_surname := lower(regexp_replace(btrim(coalesce(v_row.normalized_data->>'surname','')), '\s+', ' ', 'g'));
    v_learner_id := null;
    v_guardian_id := null;
    v_guardian_first_names := null;
    v_guardian_surname := null;

    if v_admission is null then
      update public.import_rows set resolution='error', matched_entity_type=null, matched_entity_id=null,
        issues = issues || jsonb_build_array(jsonb_build_object('level','error','field','learner_admission_number','message','Learner admission number is required for deterministic guardian import.')), updated_at=now()
      where id=v_row.id;
      v_error := v_error + 1;
      continue;
    end if;
    if v_identity is null then
      update public.import_rows set resolution='error', matched_entity_type=null, matched_entity_id=null,
        issues = issues || jsonb_build_array(jsonb_build_object('level','error','field','identity_number','message','Guardian identity number is required for deterministic bulk matching. Use the learner profile for guardians without a stable identity number.')), updated_at=now()
      where id=v_row.id;
      v_error := v_error + 1;
      continue;
    end if;

    select sli.learner_id into v_learner_id
    from public.school_learner_identifiers sli
    where sli.school_id=v_batch.school_id and upper(btrim(sli.admission_number))=v_admission
    limit 1;
    if v_learner_id is null then
      update public.import_rows set resolution='error', matched_entity_type=null, matched_entity_id=null,
        issues = issues || jsonb_build_array(jsonb_build_object('level','error','field','learner_admission_number','message','No learner in this school matches the supplied admission number.')), updated_at=now()
      where id=v_row.id;
      v_error := v_error + 1;
      continue;
    end if;

    select gp.id,
           lower(regexp_replace(btrim(gp.first_names), '\s+', ' ', 'g')),
           lower(regexp_replace(btrim(gp.surname), '\s+', ' ', 'g'))
      into v_guardian_id, v_guardian_first_names, v_guardian_surname
    from public.guardian_profiles gp
    where gp.tenant_id=v_batch.tenant_id and lower(btrim(gp.identity_number))=v_identity
    limit 1;

    if v_guardian_id is null then
      update public.import_rows set resolution='create', matched_entity_type='learner', matched_entity_id=v_learner_id, updated_at=now() where id=v_row.id;
      v_create := v_create + 1;
    elsif v_guardian_first_names <> v_first_names or v_guardian_surname <> v_surname then
      update public.import_rows set
        resolution='review',
        matched_entity_type='guardian',
        matched_entity_id=v_guardian_id,
        issues = issues || jsonb_build_array(jsonb_build_object(
          'level','warning',
          'field','identity_number',
          'message','This identity number already belongs to a guardian whose recorded name differs from the CSV. Confirm the existing guardian rather than silently replacing identity data.'
        )),
        updated_at=now()
      where id=v_row.id;
      v_review := v_review + 1;
    else
      update public.import_rows set resolution='link', matched_entity_type='guardian', matched_entity_id=v_guardian_id,
        issues = issues || jsonb_build_array(jsonb_build_object('level','warning','field','identity_number','message','Existing guardian identity matched exactly and will be reused for this learner relationship.')), updated_at=now()
      where id=v_row.id;
      v_link := v_link + 1;
    end if;
  end loop;

  update public.import_batches b set
    total_rows=(select count(*) from public.import_rows r where r.batch_id=b.id),
    valid_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and r.resolution in ('create','link','skip')),
    warning_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and jsonb_array_length(r.issues)>0 and r.resolution<>'error'),
    error_rows=(select count(*) from public.import_rows r where r.batch_id=b.id and r.resolution='error'),
    status='review', updated_at=now()
  where b.id=v_batch.id;

  return jsonb_build_object('create',v_create,'link',v_link,'review',v_review,'error',v_error);
end;
$$;

revoke all on function public.reconcile_guardian_import_batch(uuid) from public, anon;
grant execute on function public.reconcile_guardian_import_batch(uuid) to authenticated;

comment on function public.reconcile_guardian_import_batch(uuid) is 'Reconciles guardians by stable identity number and learners by school admission number. Exact identity/name mismatches require human review; names never act as match keys.';
