-- Close two fresh-database integrity gaps discovered by CI:
-- 1. guardian roster commit used PL/pgSQL variable names that collide with guardian_addresses columns;
-- 2. communication RLS called a private helper whose EXECUTE privilege is intentionally closed to clients.

create or replace function public.commit_guardian_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private
as $$
#variable_conflict use_variable
declare
  b public.import_batches%rowtype;
  r public.import_rows%rowtype;
  learner_id uuid; guardian_id uuid; matches uuid[]; contacts jsonb;
  identity_value text; first_value text; surname_value text; email_value text; phones text[];
  existing boolean; created_count int:=0; linked_count int:=0; skipped_count int:=0;
  address_type text; address_value text; address_primary boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into b from public.import_batches where id=p_batch_id for update;
  if not found then raise exception 'Import batch not found'; end if;
  if b.import_type<>'guardians' then raise exception 'This commit function only supports guardian imports'; end if;
  if not app_private.has_school_role(b.school_id,array['school_admin']) and not app_private.has_platform_role(array['platform_admin']) then raise exception 'Only a school administrator can commit guardian imports'; end if;
  if b.status<>'ready' then raise exception 'Import batch must be ready before commit'; end if;
  if exists(select 1 from public.import_rows where batch_id=b.id and resolution in ('review','error','update')) then raise exception 'Guardian import contains unresolved rows'; end if;
  update public.import_batches set status='committing',updated_at=now() where id=b.id;

  for r in select * from public.import_rows where batch_id=b.id order by row_number loop
    if r.resolution='skip' then
      insert into public.import_commit_results(batch_id,import_row_id,outcome,message) values(b.id,r.id,'skipped','Skipped during guardian import review') on conflict(import_row_id) do nothing;
      skipped_count:=skipped_count+1; continue;
    end if;
    select sli.learner_id into learner_id from public.school_learner_identifiers sli
    where sli.school_id=b.school_id and upper(btrim(sli.admission_number))=upper(btrim(r.normalized_data->>'learner_admission_number')) limit 1;
    if learner_id is null then raise exception 'Learner for row % can no longer be resolved',r.row_number; end if;

    guardian_id:=case when r.resolution='link' then r.matched_entity_id else null end;
    identity_value:=nullif(lower(btrim(coalesce(r.normalized_data->>'identity_number',''))),'');
    first_value:=btrim(coalesce(r.normalized_data->>'first_names',''));
    surname_value:=btrim(coalesce(r.normalized_data->>'surname',''));
    email_value:=nullif(lower(btrim(coalesce(r.normalized_data->>'email',''))),'');
    phones:=array_remove(array[
      nullif(regexp_replace(coalesce(r.normalized_data->>'mobile',''),'[^0-9]+','','g'),''),
      nullif(regexp_replace(coalesce(r.normalized_data->>'whatsapp',''),'[^0-9]+','','g'),''),
      nullif(regexp_replace(coalesce(r.normalized_data->>'home_phone',''),'[^0-9]+','','g'),''),
      nullif(regexp_replace(coalesce(r.normalized_data->>'work_phone',''),'[^0-9]+','','g'),'')
    ],null);
    existing:=guardian_id is not null;

    if guardian_id is null and identity_value is not null then
      select gp.id into guardian_id from public.guardian_profiles gp where gp.tenant_id=b.tenant_id and lower(btrim(gp.identity_number))=identity_value limit 1;
      existing:=guardian_id is not null;
    elsif guardian_id is null then
      matches:=app_private.guardian_import_contact_matches(b.tenant_id,first_value,surname_value,email_value,phones);
      if cardinality(matches)>1 then raise exception 'Guardian contact match became ambiguous for row %',r.row_number; end if;
      if cardinality(matches)=1 then guardian_id:=matches[1]; existing:=true; end if;
    end if;

    contacts:='[]'::jsonb;
    if email_value is not null then contacts:=contacts||jsonb_build_array(jsonb_build_object('type','email','value',r.normalized_data->>'email','primary',true)); end if;
    if nullif(btrim(coalesce(r.normalized_data->>'mobile','')),'') is not null then contacts:=contacts||jsonb_build_array(jsonb_build_object('type','mobile','value',r.normalized_data->>'mobile','primary',true)); end if;
    if nullif(btrim(coalesce(r.normalized_data->>'whatsapp','')),'') is not null then contacts:=contacts||jsonb_build_array(jsonb_build_object('type','whatsapp','value',r.normalized_data->>'whatsapp','primary',true)); end if;
    if nullif(btrim(coalesce(r.normalized_data->>'home_phone','')),'') is not null then contacts:=contacts||jsonb_build_array(jsonb_build_object('type','phone','label','Home','value',r.normalized_data->>'home_phone','primary',false)); end if;
    if nullif(btrim(coalesce(r.normalized_data->>'work_phone','')),'') is not null then contacts:=contacts||jsonb_build_array(jsonb_build_object('type','phone','label','Work','value',r.normalized_data->>'work_phone','primary',false)); end if;

    guardian_id:=public.upsert_guardian_relationship(
      learner_id,guardian_id,
      case when existing then null else first_value end,
      case when existing then null else surname_value end,
      case when existing then null else nullif(btrim(coalesce(r.normalized_data->>'preferred_name','')),'') end,
      case when existing then null else nullif(btrim(coalesce(r.normalized_data->>'identity_number','')),'') end,
      coalesce(nullif(lower(btrim(r.normalized_data->>'relationship_type')),''),'parent'),
      coalesce((r.normalized_data->>'is_legal_guardian')::boolean,false),
      coalesce((r.normalized_data->>'is_emergency_contact')::boolean,false),
      coalesce((r.normalized_data->>'is_pickup_authorized')::boolean,false),
      coalesce(nullif(r.normalized_data->>'priority','')::smallint,1::smallint),contacts);

    foreach address_type in array array['physical','postal','work'] loop
      address_value:=case address_type when 'physical' then nullif(btrim(coalesce(r.normalized_data->>'physical_address','')),'') when 'postal' then nullif(btrim(coalesce(r.normalized_data->>'postal_address','')),'') else nullif(btrim(coalesce(r.normalized_data->>'work_address','')),'') end;
      if address_value is null then continue; end if;
      if exists(select 1 from public.guardian_addresses ga where ga.guardian_id=guardian_id and ga.address_type=address_type and lower(btrim(ga.address_line_1))=lower(address_value) and ga.effective_to is null) then continue; end if;
      address_primary:=not exists(select 1 from public.guardian_addresses ga where ga.guardian_id=guardian_id and ga.address_type=address_type and ga.is_primary and ga.effective_to is null);
      insert into public.guardian_addresses(tenant_id,guardian_id,address_type,label,address_line_1,country,is_primary,created_by_user_id)
      values(b.tenant_id,guardian_id,address_type,initcap(address_type),address_value,'Namibia',address_primary,auth.uid());
    end loop;

    insert into public.import_commit_results(batch_id,import_row_id,entity_type,entity_id,outcome,message)
    values(b.id,r.id,'guardian',guardian_id,case when existing then 'linked' else 'created' end,case when existing then 'Linked existing guardian to learner' else 'Created guardian and learner relationship' end);
    update public.import_rows set resolution=case when existing then 'link' else 'create' end,matched_entity_type='guardian',matched_entity_id=guardian_id,updated_at=now() where id=r.id;
    if existing then linked_count:=linked_count+1; else created_count:=created_count+1; end if;
  end loop;

  update public.import_batches set status='completed',committed_at=now(),updated_at=now() where id=b.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(b.tenant_id,b.school_id,auth.uid(),'import.guardians.committed','import_batch',b.id,jsonb_build_object('created',created_count,'linked',linked_count,'skipped',skipped_count,'addresses_supported',true));
  return jsonb_build_object('batch_id',b.id,'created',created_count,'linked',linked_count,'skipped',skipped_count);
end;
$$;
revoke all on function public.commit_guardian_import_batch(uuid) from public,anon;
grant execute on function public.commit_guardian_import_batch(uuid) to authenticated;

create or replace function public.can_read_communication_policy(p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.can_read_communication(p_message_id);
$$;
revoke all on function public.can_read_communication_policy(uuid) from public,anon;
grant execute on function public.can_read_communication_policy(uuid) to authenticated;

comment on function public.can_read_communication_policy(uuid) is
'RLS-safe authenticated wrapper around the private communication-ledger authorization helper. Returns only whether the signed-in user may read the supplied message.';

drop policy if exists "authorized users read communication ledger" on public.communication_messages;
create policy "authorized users read communication ledger"
on public.communication_messages for select to authenticated
using (public.can_read_communication_policy(id));

drop policy if exists "authorized users read communication recipients" on public.communication_recipients;
create policy "authorized users read communication recipients"
on public.communication_recipients for select to authenticated
using (public.can_read_communication_policy(message_id));

drop policy if exists "authorized users read own or governed delivery jobs" on public.communication_delivery_jobs;
create policy "authorized users read own or governed delivery jobs"
on public.communication_delivery_jobs for select to authenticated
using (public.can_read_communication_policy(message_id));
