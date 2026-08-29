-- A human confirmation that an import row refers to an existing guardian means
-- "reuse this identity", not "replace the identity fields with the CSV text".
-- Relationship flags and new contact points may still be added through the
-- canonical guardian RPC, while existing first/surname/identity remain intact.

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
  v_is_link boolean;
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

    if v_row.resolution not in ('create','link') then
      raise exception 'Guardian import row % is not resolved for commit', v_row.row_number;
    end if;

    select sli.learner_id into v_learner_id
    from public.school_learner_identifiers sli
    where sli.school_id=v_batch.school_id
      and upper(btrim(sli.admission_number))=upper(btrim(v_row.normalized_data->>'learner_admission_number'))
    limit 1;
    if v_learner_id is null then raise exception 'Learner for row % can no longer be resolved',v_row.row_number; end if;

    v_is_link := v_row.resolution='link';
    v_guardian_id := case when v_is_link then v_row.matched_entity_id else null end;
    if v_is_link and v_guardian_id is null then raise exception 'Matched guardian is missing for row %', v_row.row_number; end if;

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
      case when v_is_link then null else nullif(btrim(v_row.normalized_data->>'first_names'),'') end,
      case when v_is_link then null else nullif(btrim(v_row.normalized_data->>'surname'),'') end,
      case when v_is_link then null else nullif(btrim(v_row.normalized_data->>'preferred_name'),'') end,
      case when v_is_link then null else nullif(btrim(v_row.normalized_data->>'identity_number'),'') end,
      coalesce(nullif(lower(btrim(v_row.normalized_data->>'relationship_type')),''),'guardian'),
      coalesce((v_row.normalized_data->>'is_legal_guardian')::boolean,false),
      coalesce((v_row.normalized_data->>'is_emergency_contact')::boolean,false),
      coalesce((v_row.normalized_data->>'is_pickup_authorized')::boolean,false),
      coalesce(nullif(v_row.normalized_data->>'priority','')::smallint,1),
      v_contacts
    );

    insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
    values(v_batch.id,v_row.id,'guardian',v_guardian_id,case when v_is_link then 'linked' else 'created' end,
      case when v_is_link then 'Linked existing guardian to learner without replacing guardian identity fields' else 'Created guardian and learner relationship' end);
    update public.import_rows set matched_entity_type='guardian',matched_entity_id=v_guardian_id,updated_at=now() where id=v_row.id;
    if v_is_link then v_linked := v_linked + 1; else v_created := v_created + 1; end if;
  end loop;

  update public.import_batches set status='completed',committed_at=now(),updated_at=now() where id=v_batch.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_batch.tenant_id,v_batch.school_id,auth.uid(),'import.guardians.committed','import_batch',v_batch.id,
    jsonb_build_object('created',v_created,'linked',v_linked,'skipped',v_skipped,'total_rows',v_batch.total_rows));
  return jsonb_build_object('batch_id',v_batch.id,'created',v_created,'linked',v_linked,'skipped',v_skipped);
end;
$$;

revoke all on function public.commit_guardian_import_batch(uuid) from public, anon;
grant execute on function public.commit_guardian_import_batch(uuid) to authenticated;

comment on function public.commit_guardian_import_batch(uuid) is 'Commits resolved guardian imports. Confirmed link rows reuse existing guardian identity fields and may add relationship/contact data without replacing identity text.';
