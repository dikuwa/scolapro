-- Reconciliation is a preview, not a lock on authoritative subject-registration state.
-- Re-evaluate the requested register/withdraw state at commit time so a change made
-- after review cannot turn a formerly-correct `skip` row into a stale no-op.

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
  v_registration public.learner_subject_registrations%rowtype;
  v_registration_id uuid;
  v_created integer:=0;
  v_updated integer:=0;
  v_skipped integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_batch
  from public.import_batches
  where id=p_batch_id
  for update;

  if not found then raise exception 'Import batch not found'; end if;
  if v_batch.import_type<>'subject_registrations' then raise exception 'This commit function only supports subject-registration imports'; end if;
  if not app_private.can_manage_school_imports(v_batch.school_id) then raise exception 'Permission denied'; end if;
  if v_batch.status<>'ready' then raise exception 'Import batch must be ready before commit'; end if;
  if exists(select 1 from public.import_rows where batch_id=v_batch.id and resolution in ('review','error','link')) then
    raise exception 'Subject-registration import contains unresolved rows';
  end if;

  update public.import_batches
  set status='committing',updated_at=now()
  where id=v_batch.id;

  for v_row in
    select * from public.import_rows where batch_id=v_batch.id order by row_number
  loop
    v_action:=lower(btrim(coalesce(v_row.normalized_data->>'action','')));

    begin
      v_enrolment_id:=(v_row.normalized_data->>'enrolment_id')::uuid;
      v_offering_id:=(v_row.normalized_data->>'subject_offering_id')::uuid;
    exception when others then
      raise exception 'Subject-registration import row % has invalid reconciled identifiers',v_row.row_number;
    end;

    if v_action not in ('register','withdraw') or v_enrolment_id is null or v_offering_id is null then
      raise exception 'Subject-registration import row % is not safely reconciled for commit',v_row.row_number;
    end if;

    -- Re-read and lock the current registration immediately before applying the
    -- requested state. The reconciliation-time resolution is retained as preview
    -- provenance only; it is not trusted as current authoritative state.
    select * into v_registration
    from public.learner_subject_registrations r
    where r.enrolment_id=v_enrolment_id
      and r.subject_offering_id=v_offering_id
    for update;

    if v_action='register' then
      if found and v_registration.status='active' then
        -- Still call the canonical register RPC so enrolment/offering scope, grade,
        -- year and active-offering validity are revalidated at commit time.
        v_registration_id:=public.register_learner_subject(v_enrolment_id,v_offering_id,'import');
        insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
        values(v_batch.id,v_row.id,'learner_subject_registration',v_registration_id,'skipped','Subject registration already matches requested state');
        v_skipped:=v_skipped+1;
      elsif found then
        v_registration_id:=public.register_learner_subject(v_enrolment_id,v_offering_id,'import');
        insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
        values(v_batch.id,v_row.id,'learner_subject_registration',v_registration_id,'updated','Subject registration reactivated after commit-time revalidation');
        v_updated:=v_updated+1;
      else
        v_registration_id:=public.register_learner_subject(v_enrolment_id,v_offering_id,'import');
        insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
        values(v_batch.id,v_row.id,'learner_subject_registration',v_registration_id,'created','Subject registration created after commit-time revalidation');
        v_created:=v_created+1;
      end if;
    else
      if not found then
        insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
        values(v_batch.id,v_row.id,'learner_subject_registration',null,'skipped','No subject registration exists to withdraw at commit time');
        v_skipped:=v_skipped+1;
      elsif v_registration.status='withdrawn' then
        insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
        values(v_batch.id,v_row.id,'learner_subject_registration',v_registration.id,'skipped','Subject registration already matches requested withdrawn state');
        v_skipped:=v_skipped+1;
      else
        perform public.withdraw_learner_subject_registration(v_registration.id,'Subject registration import');
        insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
        values(v_batch.id,v_row.id,'learner_subject_registration',v_registration.id,'updated','Subject registration withdrawn after commit-time revalidation');
        v_updated:=v_updated+1;
      end if;
    end if;
  end loop;

  update public.import_batches
  set status='completed',committed_at=now(),updated_at=now()
  where id=v_batch.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_batch.tenant_id,v_batch.school_id,auth.uid(),
    'import.subject_registrations.committed','import_batch',v_batch.id,
    jsonb_build_object('created',v_created,'updated',v_updated,'skipped',v_skipped,'commit_state_revalidated',true)
  );

  return jsonb_build_object(
    'batch_id',v_batch.id,
    'created',v_created,
    'updated',v_updated,
    'skipped',v_skipped
  );
end;
$$;

comment on function public.commit_subject_registration_import_batch(uuid) is
'Atomically commits a ready subject-registration import, revalidating the current authoritative registration state at commit time rather than trusting reconciliation-time skip/create/update state.';
