create or replace function public.commit_subject_registration_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_batch public.import_batches%rowtype;
  v_row public.import_rows%rowtype;
  v_action text;
  v_enrolment_id uuid;
  v_offering_id uuid;
  v_registration_id uuid;
  v_created integer:=0;
  v_updated integer:=0;
  v_skipped integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_batch from public.import_batches where id=p_batch_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if v_batch.import_type<>'subject_registrations' then raise exception 'This commit function only supports subject-registration imports'; end if;
  if not app_private.can_manage_school_imports(v_batch.school_id) then raise exception 'Permission denied'; end if;
  if v_batch.status<>'ready' then raise exception 'Import batch must be ready before commit'; end if;
  if exists(select 1 from public.import_rows where batch_id=v_batch.id and resolution in ('review','error','link')) then
    raise exception 'Subject-registration import contains unresolved rows';
  end if;

  update public.import_batches set status='committing',updated_at=now() where id=v_batch.id;

  for v_row in select * from public.import_rows where batch_id=v_batch.id order by row_number
  loop
    v_action:=v_row.normalized_data->>'action';
    v_enrolment_id:=(v_row.normalized_data->>'enrolment_id')::uuid;
    v_offering_id:=(v_row.normalized_data->>'subject_offering_id')::uuid;

    if v_row.resolution='skip' then
      insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
      values(v_batch.id,v_row.id,'learner_subject_registration',v_row.matched_entity_id,'skipped','Subject registration already matches requested state');
      v_skipped:=v_skipped+1;
      continue;
    end if;

    if v_action='register' then
      v_registration_id:=public.register_learner_subject(v_enrolment_id,v_offering_id,'import');
      insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
      values(v_batch.id,v_row.id,'learner_subject_registration',v_registration_id,
        case when v_row.resolution='create' then 'created' else 'updated' end,
        case when v_row.resolution='create' then 'Subject registration created' else 'Subject registration reactivated' end);
      if v_row.resolution='create' then v_created:=v_created+1; else v_updated:=v_updated+1; end if;
    else
      if v_row.matched_entity_id is null then
        insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
        values(v_batch.id,v_row.id,'learner_subject_registration',null,'skipped','No active subject registration existed to withdraw');
        v_skipped:=v_skipped+1;
      else
        perform public.withdraw_learner_subject_registration(v_row.matched_entity_id,'Subject registration import');
        insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
        values(v_batch.id,v_row.id,'learner_subject_registration',v_row.matched_entity_id,'updated','Subject registration withdrawn');
        v_updated:=v_updated+1;
      end if;
    end if;
  end loop;

  update public.import_batches set status='completed',committed_at=now(),updated_at=now() where id=v_batch.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_batch.tenant_id,v_batch.school_id,auth.uid(),'import.subject_registrations.committed','import_batch',v_batch.id,
    jsonb_build_object('created',v_created,'updated',v_updated,'skipped',v_skipped));

  return jsonb_build_object('batch_id',v_batch.id,'created',v_created,'updated',v_updated,'skipped',v_skipped);
end;
$$;

revoke all on function public.commit_subject_registration_import_batch(uuid) from public,anon;
grant execute on function public.commit_subject_registration_import_batch(uuid) to authenticated;

comment on function public.commit_subject_registration_import_batch(uuid) is
'Commits a ready subject-registration import through the canonical registration RPCs. Authorization deliberately follows the school-import management boundary rather than the broader HOD subject-maintenance boundary.';
