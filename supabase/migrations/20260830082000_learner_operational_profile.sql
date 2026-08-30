-- Keep ordinary school-maintained learner profile changes separate from protected
-- identity/history corrections. School admins may update preferred name directly;
-- official names, DOB, sex, admission identity and historical enrolment remain behind
-- the existing correction/workflow boundaries.

create or replace function public.update_learner_operational_profile(
  p_learner_id uuid,
  p_school_id uuid,
  p_preferred_name text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_tenant_id uuid;
  v_old_preferred_name text;
  v_new_preferred_name text := nullif(btrim(coalesce(p_preferred_name, '')), '');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_school_role(p_school_id, array['school_admin']) then raise exception 'Permission denied'; end if;

  select sli.tenant_id, l.preferred_name
    into v_tenant_id, v_old_preferred_name
  from public.school_learner_identifiers sli
  join public.learners l on l.id = sli.learner_id and l.tenant_id = sli.tenant_id
  where sli.school_id = p_school_id
    and sli.learner_id = p_learner_id;

  if v_tenant_id is null then raise exception 'Learner does not belong to this school'; end if;

  update public.learners
  set preferred_name = v_new_preferred_name,
      updated_at = now()
  where id = p_learner_id and tenant_id = v_tenant_id;

  if v_old_preferred_name is distinct from v_new_preferred_name then
    insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
    values(
      v_tenant_id,p_school_id,auth.uid(),'learner.operational_profile_updated','learner',p_learner_id,
      jsonb_build_object('preferred_name_changed',true,'old_preferred_name',v_old_preferred_name,'new_preferred_name',v_new_preferred_name)
    );
  end if;

  return true;
end;
$$;

revoke all on function public.update_learner_operational_profile(uuid,uuid,text) from public, anon;
grant execute on function public.update_learner_operational_profile(uuid,uuid,text) to authenticated;

comment on function public.update_learner_operational_profile(uuid,uuid,text) is
'School-admin operational learner profile edit boundary. Currently allows preferred-name maintenance only; protected identity and enrolment history stay in governed correction/workflow paths.';
