-- Guardian identities are many-to-many with learners. A single guardian can appear on
-- multiple learner rows in one file, and a learner can appear on multiple guardian rows.
-- Re-resolve guardian identity during commit so two rows for siblings do not both attempt
-- to create the same tenant guardian before either relationship exists.

create or replace function public.commit_guardian_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_batch public.import_batches%rowtype;
  v_row public.import_rows%rowtype;
  v_learner_id uuid;
  v_guardian_id uuid;
  v_contacts jsonb;
  v_identity text;
  v_existing boolean;
  v_created integer := 0;
  v_linked integer := 0;
  v_skipped integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_batch from public.import_batches where id=p_batch_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if v_batch.import_type <> 'guardians' then raise exception 'This commit function only supports guardian imports'; end if;
  if not app_private.has_school_role(v_batch.school_id,array['school_admin']) and not app_private.has_platform_role(array['platform_admin']) then raise exception 'Only a school administrator can commit guardian imports'; end if;
  if v_batch.status <> 'ready' then raise exception 'Import batch must be ready before commit'; end if;
  if exists(select 1 from public.import_rows where batch_id=v_batch.id and resolution in ('review','error','update')) then raise exception 'Guardian import contains unresolved rows'; end if;

  update public.import_batches set status='committing',updated_at=now() where id=v_batch.id;

  for v_row in select * from public.import_rows where batch_id=v_batch.id order by row_number
  loop
    if v_row.resolution='skip' then
      insert into public.import_commit_results(batch_id,import_row_id,outcome,message)
      values(v_batch.id,v_row.id,'skipped','Skipped during guardian import review') on conflict(import_row_id) do nothing;
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select sli.learner_id into v_learner_id
    from public.school_learner_identifiers sli
    where sli.school_id=v_batch.school_id
      and upper(btrim(sli.admission_number))=upper(btrim(v_row.normalized_data->>'learner_admission_number'))
    limit 1;
    if v_learner_id is null then raise exception 'Learner for row % can no longer be resolved',v_row.row_number; end if;

    v_guardian_id := case when v_row.resolution='link' then v_row.matched_entity_id else null end;
    v_identity := nullif(lower(btrim(coalesce(v_row.normalized_data->>'identity_number',''))),'');
    v_existing := v_guardian_id is not null;

    -- A previous row in this same batch may just have created this guardian for a sibling.
    if v_guardian_id is null and v_identity is not null then
      select gp.id into v_guardian_id
      from public.guardian_profiles gp
      where gp.tenant_id=v_batch.tenant_id
        and lower(btrim(gp.identity_number))=v_identity
      limit 1;
      v_existing := v_guardian_id is not null;
    end if;

    v_contacts := '[]'::jsonb;
    if nullif(btrim(coalesce(v_row.normalized_data->>'email','')),'') is not null then
      v_contacts := v_contacts || jsonb_build_array(jsonb_build_object('type','email','value',btrim(v_row.normalized_data->>'email'),'primary',true));
    end if;
    if nullif(btrim(coalesce(v_row.normalized_data->>'mobile','')),'') is not null then
      v_contacts := v_contacts || jsonb_build_array(jsonb_build_object('type','mobile','value',btrim(v_row.normalized_data->>'mobile'),'primary',true));
    end if;
    if nullif(btrim(coalesce(v_row.normalized_data->>'whatsapp','')),'') is not null then
      v_contacts := v_contacts || jsonb_build_array(jsonb_build_object('type','whatsapp','value',btrim(v_row.normalized_data->>'whatsapp'),'primary',true));
    end if;

    v_guardian_id := public.upsert_guardian_relationship(
      v_learner_id,
      v_guardian_id,
      nullif(btrim(v_row.normalized_data->>'first_names'),''),
      nullif(btrim(v_row.normalized_data->>'surname'),''),
      nullif(btrim(v_row.normalized_data->>'preferred_name'),''),
      nullif(btrim(v_row.normalized_data->>'identity_number'),''),
      coalesce(nullif(lower(btrim(v_row.normalized_data->>'relationship_type')),''),'guardian'),
      coalesce((v_row.normalized_data->>'is_legal_guardian')::boolean,false),
      coalesce((v_row.normalized_data->>'is_emergency_contact')::boolean,false),
      coalesce((v_row.normalized_data->>'is_pickup_authorized')::boolean,false),
      coalesce(nullif(v_row.normalized_data->>'priority','')::smallint,1),
      v_contacts
    );

    insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
    values(v_batch.id,v_row.id,'guardian',v_guardian_id,
      case when v_existing then 'linked' else 'created' end,
      case when v_existing then 'Linked existing guardian to learner' else 'Created guardian and learner relationship' end);

    update public.import_rows
    set resolution=case when v_existing then 'link' else 'create' end,
        matched_entity_type='guardian',matched_entity_id=v_guardian_id,updated_at=now()
    where id=v_row.id;

    if v_existing then v_linked := v_linked + 1; else v_created := v_created + 1; end if;
  end loop;

  update public.import_batches set status='completed',committed_at=now(),updated_at=now() where id=v_batch.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_batch.tenant_id,v_batch.school_id,auth.uid(),'import.guardians.committed','import_batch',v_batch.id,
    jsonb_build_object('created',v_created,'linked',v_linked,'skipped',v_skipped,'total_rows',v_batch.total_rows));
  return jsonb_build_object('batch_id',v_batch.id,'created',v_created,'linked',v_linked,'skipped',v_skipped);
end;
$$;

revoke all on function public.commit_guardian_import_batch(uuid) from public,anon;
grant execute on function public.commit_guardian_import_batch(uuid) to authenticated;

comment on function public.commit_guardian_import_batch(uuid) is
'Commits guardian-to-learner relationships with tenant identity re-resolution on every row, supporting many guardians per learner and one guardian across multiple learners in the same batch.';
