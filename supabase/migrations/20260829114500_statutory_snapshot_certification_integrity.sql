-- Statutory snapshots are evidence at a fixed reference date. Their generated payload
-- and provenance are immutable; corrections require a new numbered snapshot. Platform
-- support may troubleshoot platform metadata/audit, but is not statutory school staff.

create or replace function app_private.can_manage_statutory(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or exists(
      select 1
      from public.school_memberships sm
      where sm.school_id=target_school_id
        and sm.user_id=(select auth.uid())
        and sm.role_key in ('school_admin','principal','deputy_principal','emis_officer')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    );
$$;
revoke all on function app_private.can_manage_statutory(uuid) from public,anon;
grant execute on function app_private.can_manage_statutory(uuid) to authenticated;

create or replace function app_private.guard_statutory_snapshot_immutability()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if tg_op='DELETE' then
    if old.status<>'provisional' then
      raise exception 'Reviewed or certified statutory snapshots cannot be deleted';
    end if;
    return old;
  end if;

  if new.tenant_id is distinct from old.tenant_id
     or new.school_id is distinct from old.school_id
     or new.reporting_cycle_id is distinct from old.reporting_cycle_id
     or new.snapshot_number is distinct from old.snapshot_number
     or new.values is distinct from old.values
     or new.source_summary is distinct from old.source_summary
     or new.generated_by_user_id is distinct from old.generated_by_user_id
     or new.generated_at is distinct from old.generated_at then
    raise exception 'Statutory snapshot payload and provenance are immutable';
  end if;

  if old.status='provisional' and new.status not in ('provisional','reviewed','certified') then
    raise exception 'Invalid statutory snapshot status transition';
  end if;
  if old.status='reviewed' and new.status not in ('reviewed','certified') then
    raise exception 'Invalid statutory snapshot status transition';
  end if;
  if old.status='certified' and new.status not in ('certified','locked') then
    raise exception 'Certified statutory snapshots may only be locked';
  end if;
  if old.status='locked' and new.status<>old.status then
    raise exception 'Locked statutory snapshots are immutable';
  end if;

  return new;
end;
$$;
revoke all on function app_private.guard_statutory_snapshot_immutability() from public,anon,authenticated;

drop trigger if exists statutory_snapshot_immutability_guard on public.statutory_snapshots;
create trigger statutory_snapshot_immutability_guard
before update or delete on public.statutory_snapshots
for each row execute function app_private.guard_statutory_snapshot_immutability();

create or replace function public.certify_statutory_snapshot(
  p_snapshot_id uuid,
  p_certification_role text,
  p_statement text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_snapshot public.statutory_snapshots%rowtype;
  v_cycle public.statutory_reporting_cycles%rowtype;
  v_id uuid;
  v_role text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  v_role:=lower(btrim(coalesce(p_certification_role,'')));
  if v_role not in ('principal','school_admin') then
    raise exception 'Certification role must be principal or school_admin';
  end if;

  select * into v_snapshot
  from public.statutory_snapshots
  where id=p_snapshot_id
  for update;
  if not found then raise exception 'Statutory snapshot not found'; end if;

  select * into v_cycle
  from public.statutory_reporting_cycles
  where id=v_snapshot.reporting_cycle_id
  for update;
  if not found then raise exception 'Reporting cycle not found'; end if;

  if not exists(
    select 1
    from public.school_memberships sm
    where sm.school_id=v_snapshot.school_id
      and sm.user_id=(select auth.uid())
      and sm.role_key=v_role
      and sm.active_from<=current_date
      and (sm.active_to is null or sm.active_to>=current_date)
  ) then
    raise exception 'Certification role does not match your active school role';
  end if;

  if exists(
    select 1
    from public.statutory_readiness_issues sri
    where sri.reporting_cycle_id=v_cycle.id
      and sri.resolved=false
      and sri.severity='blocking'
  ) then
    raise exception 'Blocking statutory readiness issues must be resolved before certification';
  end if;

  if v_snapshot.status not in ('provisional','reviewed') then
    raise exception 'Snapshot cannot be certified from its current state';
  end if;

  insert into public.statutory_certifications(
    tenant_id,school_id,reporting_cycle_id,snapshot_id,certification_role,
    certified_by_user_id,statement
  ) values (
    v_snapshot.tenant_id,v_snapshot.school_id,v_cycle.id,v_snapshot.id,v_role,
    auth.uid(),nullif(btrim(coalesce(p_statement,'')),'')
  ) returning id into v_id;

  update public.statutory_snapshots
  set status='certified'
  where id=v_snapshot.id;

  update public.statutory_reporting_cycles
  set status='certified',updated_at=now()
  where id=v_cycle.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values (
    v_snapshot.tenant_id,v_snapshot.school_id,auth.uid(),
    'statutory.snapshot.certified','statutory_snapshot',v_snapshot.id,
    jsonb_build_object('reporting_cycle_id',v_cycle.id,'certification_role',v_role)
  );

  return v_id;
end;
$$;
revoke all on function public.certify_statutory_snapshot(uuid,text,text) from public,anon;
grant execute on function public.certify_statutory_snapshot(uuid,text,text) to authenticated;

comment on function app_private.can_manage_statutory(uuid) is
'Statutory school-data access for platform administrators or explicitly assigned school statutory roles. Platform support does not inherit this authority.';
comment on function public.certify_statutory_snapshot(uuid,text,text) is
'Certifies a fixed statutory snapshot only under the signer actual active principal or school_admin school membership; caller-supplied role labels cannot impersonate another signatory.';