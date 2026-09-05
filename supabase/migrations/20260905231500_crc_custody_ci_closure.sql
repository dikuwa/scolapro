-- CI closure for school invitation + confidential CRC custody.
-- Keep sensitive authorization helpers private while exposing only narrow RLS wrappers.

create or replace function public.create_school_invitation(
  p_school_id uuid,
  p_email text,
  p_first_name text default null,
  p_last_name text default null,
  p_employee_number text default null,
  p_role_key text default 'school_admin'
)
returns table(invitation_id uuid, invitation_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions, app_private
as $$
declare
  v_school public.schools%rowtype;
  v_token text;
  v_invitation_id uuid;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_school
  from public.schools s
  where s.id = p_school_id and s.status = 'active';
  if not found then raise exception 'School not found or inactive'; end if;

  if not app_private.can_manage_school_members(p_school_id) then
    raise exception 'Permission denied';
  end if;

  if p_role_key not in (
    'school_admin','principal','deputy_principal','hod','teacher','class_teacher',
    'counsellor','social_worker','librarian','board_member'
  ) then
    raise exception 'Unsupported school role';
  end if;
  if btrim(coalesce(p_email,'')) = '' then raise exception 'Email is required'; end if;

  update public.school_invitations si
  set status = 'expired'
  where si.school_id = p_school_id
    and lower(btrim(si.email)) = lower(btrim(p_email))
    and si.role_key = p_role_key
    and si.status = 'pending'
    and si.expires_at <= now();

  if exists (
    select 1
    from public.school_invitations si
    where si.school_id = p_school_id
      and lower(btrim(si.email)) = lower(btrim(p_email))
      and si.role_key = p_role_key
      and si.status = 'pending'
      and si.expires_at > now()
  ) then
    raise exception 'A pending invitation already exists for this email and role';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  v_expires_at := now() + interval '7 days';

  insert into public.school_invitations(
    tenant_id,school_id,email,first_name,last_name,employee_number,
    role_key,token_hash,invited_by_user_id,expires_at
  ) values (
    v_school.tenant_id,p_school_id,lower(btrim(p_email)),
    nullif(btrim(coalesce(p_first_name,'')),''),
    nullif(btrim(coalesce(p_last_name,'')),''),
    nullif(btrim(coalesce(p_employee_number,'')),''),
    p_role_key,encode(digest(v_token,'sha256'),'hex'),auth.uid(),v_expires_at
  ) returning id into v_invitation_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values (
    v_school.tenant_id,p_school_id,auth.uid(),'school_invitation.created',
    'school_invitation',v_invitation_id,
    jsonb_build_object('email',lower(btrim(p_email)),'role_key',p_role_key)
  );

  return query select v_invitation_id,v_token,v_expires_at;
end;
$$;
revoke all on function public.create_school_invitation(uuid,text,text,text,text,text) from public,anon;
grant execute on function public.create_school_invitation(uuid,text,text,text,text,text) to authenticated;

-- RLS-only wrappers. The underlying helpers remain non-executable by client roles.
create or replace function app_private.can_read_crc_custody_record_for_rls(p_custody_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.can_access_crc_custody_record(p_custody_id);
$$;
revoke all on function app_private.can_read_crc_custody_record_for_rls(uuid) from public,anon;
grant execute on function app_private.can_read_crc_custody_record_for_rls(uuid) to authenticated;

create or replace function app_private.can_insert_crc_custody_document_for_rls(p_custody_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.can_manage_crc_custody_outgoing(p_custody_id);
$$;
revoke all on function app_private.can_insert_crc_custody_document_for_rls(uuid) from public,anon;
grant execute on function app_private.can_insert_crc_custody_document_for_rls(uuid) to authenticated;

create or replace function app_private.can_create_learner_support_case_for_rls(p_school_id uuid,p_sensitivity text)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.can_create_learner_support_case(p_school_id,p_sensitivity);
$$;
revoke all on function app_private.can_create_learner_support_case_for_rls(uuid,text) from public,anon;
grant execute on function app_private.can_create_learner_support_case_for_rls(uuid,text) to authenticated;

create or replace function app_private.can_access_learner_support_case_for_rls(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.can_access_learner_support_case(p_case_id);
$$;
revoke all on function app_private.can_access_learner_support_case_for_rls(uuid) from public,anon;
grant execute on function app_private.can_access_learner_support_case_for_rls(uuid) to authenticated;

comment on function app_private.can_read_crc_custody_record_for_rls(uuid) is
'RLS-only wrapper for confidential CRC custody visibility. The underlying authorization helper stays private.';
comment on function app_private.can_insert_crc_custody_document_for_rls(uuid) is
'RLS-only wrapper for confidential CRC attachment creation. The underlying custody-management helper stays private.';
comment on function app_private.can_create_learner_support_case_for_rls(uuid,text) is
'RLS-only wrapper for learner-support case creation. The underlying confidentiality helper stays private.';
comment on function app_private.can_access_learner_support_case_for_rls(uuid) is
'RLS-only wrapper for learner-support case visibility. The underlying confidentiality helper stays private.';

drop policy if exists "need to know users read custody records" on public.crc_custody_records;
create policy "need to know users read custody records"
on public.crc_custody_records for select to authenticated
using (app_private.can_read_crc_custody_record_for_rls(id));

drop policy if exists "need to know users read custody documents" on public.crc_custody_documents;
create policy "need to know users read custody documents"
on public.crc_custody_documents for select to authenticated
using (app_private.can_read_crc_custody_record_for_rls(custody_record_id));

drop policy if exists "need to know users read learner support cases" on public.learner_support_cases;
create policy "need to know users read learner support cases"
on public.learner_support_cases for select to authenticated
using (app_private.can_access_learner_support_case_for_rls(id));

drop policy if exists "authorized users create learner support cases" on public.learner_support_cases;
create policy "authorized users create learner support cases"
on public.learner_support_cases for insert to authenticated
with check (
  opened_by_user_id=(select auth.uid())
  and app_private.can_create_learner_support_case_for_rls(school_id,sensitivity)
);

drop policy if exists "authorized users update learner support cases" on public.learner_support_cases;
create policy "authorized users update learner support cases"
on public.learner_support_cases for update to authenticated
using (app_private.can_access_learner_support_case_for_rls(id))
with check (app_private.can_create_learner_support_case_for_rls(school_id,sensitivity));

drop policy if exists "need to know users read support interventions" on public.learner_support_interventions;
create policy "need to know users read support interventions"
on public.learner_support_interventions for select to authenticated
using (app_private.can_access_learner_support_case_for_rls(support_case_id));

drop policy if exists "authorized users append support interventions" on public.learner_support_interventions;
create policy "authorized users append support interventions"
on public.learner_support_interventions for insert to authenticated
with check (
  recorded_by_user_id=(select auth.uid())
  and app_private.can_access_learner_support_case_for_rls(support_case_id)
);

drop policy if exists "Custody documents select" on storage.objects;
create policy "Custody documents select"
on storage.objects for select to authenticated
using (
  bucket_id='crc-confidential-documents'
  and (storage.foldername(name))[2]='docs'
  and exists(
    select 1 from public.crc_custody_records r
    where r.id::text=(storage.foldername(name))[1]
      and app_private.can_read_crc_custody_record_for_rls(r.id)
  )
);

drop policy if exists "Custody documents insert" on storage.objects;
create policy "Custody documents insert"
on storage.objects for insert to authenticated
with check (
  bucket_id='crc-confidential-documents'
  and lower(storage.extension(name)) in ('pdf','jpg','jpeg','png')
  and (storage.foldername(name))[2]='docs'
  and exists(
    select 1 from public.crc_custody_records r
    where r.id::text=(storage.foldername(name))[1]
      and app_private.can_insert_crc_custody_document_for_rls(r.id)
  )
);

-- Receiving-side lifecycle audit events belong to the receiving school so the actor
-- relationship remains truthful. Origin context is retained in immutable metadata.
create or replace function public.receive_crc_custody(p_custody_id uuid)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare v_record public.crc_custody_records%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_crc_custody_incoming(p_custody_id) then
    raise exception 'Permission denied: only the authorized receiving custodian may receive CRC custody';
  end if;

  update public.crc_custody_records
  set custody_status='received',received_by_user_id=auth.uid(),received_at=now(),updated_at=now()
  where id=p_custody_id
  returning * into v_record;
  if not found then raise exception 'CRC custody record not found'; end if;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_record.tenant_id,v_record.receiving_school_id,auth.uid(),'crc_custody.received','crc_custody_record',v_record.id,
    jsonb_build_object('origin_school_id',v_record.school_id,'receiving_school_id',v_record.receiving_school_id));
end;
$$;

create or replace function public.acknowledge_crc_custody(p_custody_id uuid)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare v_record public.crc_custody_records%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_crc_custody_incoming(p_custody_id) then
    raise exception 'Permission denied: only the authorized receiving custodian may acknowledge CRC custody';
  end if;

  update public.crc_custody_records
  set custody_status='acknowledged',acknowledged_by_user_id=auth.uid(),acknowledged_at=now(),updated_at=now()
  where id=p_custody_id
  returning * into v_record;
  if not found then raise exception 'CRC custody record not found'; end if;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_record.tenant_id,v_record.receiving_school_id,auth.uid(),'crc_custody.acknowledged','crc_custody_record',v_record.id,
    jsonb_build_object('origin_school_id',v_record.school_id,'receiving_school_id',v_record.receiving_school_id));
end;
$$;

create or replace function public.close_crc_custody(p_custody_id uuid)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_record public.crc_custody_records%rowtype;
  v_audit_school uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    app_private.can_manage_crc_custody_incoming(p_custody_id)
    or app_private.can_manage_crc_custody_outgoing(p_custody_id)
  ) then
    raise exception 'Permission denied: only the receiving or originating custodian may close CRC custody';
  end if;

  update public.crc_custody_records
  set custody_status='closed',closed_by_user_id=auth.uid(),closed_at=now(),updated_at=now()
  where id=p_custody_id
  returning * into v_record;
  if not found then raise exception 'CRC custody record not found'; end if;

  v_audit_school := case
    when app_private.is_support_role_member(auth.uid(),v_record.receiving_school_id) then v_record.receiving_school_id
    else v_record.school_id
  end;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_record.tenant_id,v_audit_school,auth.uid(),'crc_custody.closed','crc_custody_record',v_record.id,
    jsonb_build_object('origin_school_id',v_record.school_id,'receiving_school_id',v_record.receiving_school_id));
end;
$$;

revoke all on function public.receive_crc_custody(uuid) from public,anon;
grant execute on function public.receive_crc_custody(uuid) to authenticated;
revoke all on function public.acknowledge_crc_custody(uuid) from public,anon;
grant execute on function public.acknowledge_crc_custody(uuid) to authenticated;
revoke all on function public.close_crc_custody(uuid) from public,anon;
grant execute on function public.close_crc_custody(uuid) to authenticated;
