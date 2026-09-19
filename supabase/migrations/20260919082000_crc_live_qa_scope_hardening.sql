-- Issue #510: CRC live/source QA scope hardening.
--
-- Preserve the existing cumulative-record and custody model. This migration only
-- closes current-school/current-placement, Platform Support and cross-tenant
-- custody boundaries discovered during bounded QA.

create or replace function app_private.is_support_role_member(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  with today as (
    select (now() at time zone 'Africa/Windhoek')::date as value
  ),
  current_school as (
    select sm.school_id
    from public.school_memberships sm, today t
    where sm.user_id = p_user_id
      and sm.active_from <= t.value
      and (sm.active_to is null or sm.active_to >= t.value)
    order by sm.active_from desc, sm.id asc
    limit 1
  )
  select p_user_id is not null
    and p_school_id is not null
    and exists (
      select 1 from current_school cs where cs.school_id = p_school_id
    )
    and not exists (
      select 1
      from public.platform_memberships pm, today t
      where pm.user_id = p_user_id
        and pm.role_key = 'platform_support'
        and pm.active_from <= t.value
        and (pm.active_to is null or pm.active_to >= t.value)
    )
    and exists (
      select 1
      from public.school_memberships sm, today t
      where sm.user_id = p_user_id
        and sm.school_id = p_school_id
        and sm.role_key in ('counsellor','learner_support','social_worker')
        and sm.active_from <= t.value
        and (sm.active_to is null or sm.active_to >= t.value)
        and (
          sm.staff_member_id is null
          or app_private.staff_member_covers_school_period(
            sm.staff_member_id,
            p_school_id,
            t.value,
            t.value
          )
        )
    );
$$;

revoke all on function app_private.is_support_role_member(uuid,uuid)
from public, anon, authenticated;

create or replace function app_private.is_school_leadership(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  with today as (
    select (now() at time zone 'Africa/Windhoek')::date as value
  ),
  current_school as (
    select sm.school_id
    from public.school_memberships sm, today t
    where sm.user_id = p_user_id
      and sm.active_from <= t.value
      and (sm.active_to is null or sm.active_to >= t.value)
    order by sm.active_from desc, sm.id asc
    limit 1
  )
  select p_user_id is not null
    and p_school_id is not null
    and exists (
      select 1 from current_school cs where cs.school_id = p_school_id
    )
    and not exists (
      select 1
      from public.platform_memberships pm, today t
      where pm.user_id = p_user_id
        and pm.role_key = 'platform_support'
        and pm.active_from <= t.value
        and (pm.active_to is null or pm.active_to >= t.value)
    )
    and exists (
      select 1
      from public.school_memberships sm, today t
      where sm.user_id = p_user_id
        and sm.school_id = p_school_id
        and sm.role_key in ('school_admin','principal','deputy_principal')
        and sm.active_from <= t.value
        and (sm.active_to is null or sm.active_to >= t.value)
        and (
          sm.staff_member_id is null
          or app_private.staff_member_covers_school_period(
            sm.staff_member_id,
            p_school_id,
            t.value,
            t.value
          )
        )
    );
$$;

revoke all on function app_private.is_school_leadership(uuid,uuid)
from public, anon, authenticated;

create or replace function app_private.enforce_crc_custody_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_origin_tenant uuid;
  v_receiving_tenant uuid;
  v_learner_tenant uuid;
begin
  select tenant_id into v_origin_tenant
  from public.schools
  where id = new.school_id;

  select tenant_id into v_receiving_tenant
  from public.schools
  where id = new.receiving_school_id;

  select tenant_id into v_learner_tenant
  from public.learners
  where id = new.learner_id;

  if v_origin_tenant is null
     or v_receiving_tenant is null
     or v_learner_tenant is null
     or v_origin_tenant is distinct from new.tenant_id
     or v_receiving_tenant is distinct from new.tenant_id
     or v_learner_tenant is distinct from new.tenant_id then
    raise exception 'CRC custody scope mismatch';
  end if;

  if new.enrolment_id is not null and not exists (
    select 1
    from public.enrolments e
    where e.id = new.enrolment_id
      and e.tenant_id = new.tenant_id
      and e.school_id = new.school_id
      and e.learner_id = new.learner_id
  ) then
    raise exception 'CRC custody enrolment scope mismatch';
  end if;

  if not app_private.is_support_role_member(new.receiving_user_id, new.receiving_school_id) then
    raise exception 'CRC custody recipient is not an authorized receiving custodian';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_crc_custody_scope_integrity()
from public, anon, authenticated;

drop trigger if exists crc_custody_scope_integrity_trg on public.crc_custody_records;
create trigger crc_custody_scope_integrity_trg
before insert or update of tenant_id, school_id, learner_id, enrolment_id,
  receiving_school_id, receiving_user_id
on public.crc_custody_records
for each row execute function app_private.enforce_crc_custody_scope_integrity();

create or replace function public.prepare_crc_custody(
  p_learner_id uuid,
  p_receiving_school_id uuid,
  p_receiving_user_id uuid,
  p_custody_note text default null
)
returns table(custody_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_enrolment public.enrolments%rowtype;
  v_custody_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select e.* into v_enrolment
  from public.enrolments e
  where e.learner_id = p_learner_id
    and e.status = 'current'
    and e.enrolled_from <= (now() at time zone 'Africa/Windhoek')::date
    and (e.enrolled_to is null or e.enrolled_to >= (now() at time zone 'Africa/Windhoek')::date)
  order by e.enrolled_from desc, e.id asc
  limit 1;

  if v_enrolment.id is null then
    raise exception 'Learner has no current enrolment at a school';
  end if;

  if not app_private.is_support_role_member(auth.uid(), v_enrolment.school_id) then
    raise exception 'Permission denied: not an authorized custodian at the learner school';
  end if;

  if p_receiving_school_id = v_enrolment.school_id then
    raise exception 'CRC custody must be dispatched to a different school';
  end if;

  if not exists (
    select 1
    from public.schools s
    where s.id = p_receiving_school_id
      and s.tenant_id = v_enrolment.tenant_id
      and s.status = 'active'
  ) then
    raise exception 'Receiving school not found in learner tenant or inactive';
  end if;

  if not app_private.is_support_role_member(p_receiving_user_id, p_receiving_school_id) then
    raise exception 'Receiving user is not an authorized custodian at the receiving school';
  end if;

  insert into public.crc_custody_records (
    tenant_id, school_id, learner_id, enrolment_id, custody_status,
    prepared_by_user_id, receiving_school_id, receiving_user_id, custody_note
  )
  values (
    v_enrolment.tenant_id, v_enrolment.school_id, v_enrolment.learner_id, v_enrolment.id,
    'prepared', auth.uid(), p_receiving_school_id, p_receiving_user_id,
    nullif(btrim(coalesce(p_custody_note, '')), '')
  )
  returning id into v_custody_id;

  insert into public.audit_events (
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  )
  values (
    v_enrolment.tenant_id, v_enrolment.school_id, auth.uid(),
    'crc_custody.prepared', 'crc_custody_record', v_custody_id,
    jsonb_build_object(
      'learner_id', v_enrolment.learner_id,
      'receiving_school_id', p_receiving_school_id,
      'receiving_user_id', p_receiving_user_id
    )
  );

  return query select v_custody_id;
end;
$$;

revoke all on function public.prepare_crc_custody(uuid,uuid,uuid,text)
from public, anon;
grant execute on function public.prepare_crc_custody(uuid,uuid,uuid,text)
to authenticated;

create or replace function public.search_crc_custody_receivers(p_school_id uuid)
returns table(user_id uuid, display_name text, role_key text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_origin_school_id uuid;
  v_tenant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select sm.school_id, sm.tenant_id
    into v_origin_school_id, v_tenant_id
  from public.school_memberships sm
  where sm.user_id = auth.uid()
    and sm.active_from <= (now() at time zone 'Africa/Windhoek')::date
    and (sm.active_to is null or sm.active_to >= (now() at time zone 'Africa/Windhoek')::date)
  order by sm.active_from desc, sm.id asc
  limit 1;

  if v_origin_school_id is null
     or not app_private.is_support_role_member(auth.uid(), v_origin_school_id) then
    raise exception 'Permission denied: not an authorized custodian';
  end if;

  if p_school_id = v_origin_school_id
     or not exists (
       select 1 from public.schools s
       where s.id = p_school_id
         and s.tenant_id = v_tenant_id
         and s.status = 'active'
     ) then
    raise exception 'Receiving school is outside the authorized tenant scope';
  end if;

  return query
  select distinct on (sm.user_id)
    sm.user_id,
    coalesce(up.display_name, concat_ws(' ', staff.first_name, staff.last_name), split_part(au.email, '@', 1)),
    sm.role_key
  from public.school_memberships sm
  left join public.user_profiles up on up.user_id = sm.user_id
  left join public.staff_members staff on staff.id = sm.staff_member_id
  left join auth.users au on au.id = sm.user_id
  where sm.school_id = p_school_id
    and app_private.is_support_role_member(sm.user_id, p_school_id)
  order by sm.user_id, sm.active_from desc;
end;
$$;

revoke all on function public.search_crc_custody_receivers(uuid)
from public, anon;
grant execute on function public.search_crc_custody_receivers(uuid)
to authenticated;

create or replace function public.list_crc_custody_destination_schools()
returns table(school_id uuid, school_name text, school_town text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_origin_school_id uuid;
  v_tenant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select sm.school_id, sm.tenant_id
    into v_origin_school_id, v_tenant_id
  from public.school_memberships sm
  where sm.user_id = auth.uid()
    and sm.active_from <= (now() at time zone 'Africa/Windhoek')::date
    and (sm.active_to is null or sm.active_to >= (now() at time zone 'Africa/Windhoek')::date)
  order by sm.active_from desc, sm.id asc
  limit 1;

  if v_origin_school_id is null
     or not app_private.is_support_role_member(auth.uid(), v_origin_school_id) then
    raise exception 'Permission denied: not an authorized custodian';
  end if;

  return query
  select s.id, s.name, s.town
  from public.schools s
  where s.tenant_id = v_tenant_id
    and s.status = 'active'
    and s.id <> v_origin_school_id
  order by s.name, s.id;
end;
$$;

revoke all on function public.list_crc_custody_destination_schools()
from public, anon;
grant execute on function public.list_crc_custody_destination_schools()
to authenticated;

comment on function app_private.is_support_role_member(uuid,uuid) is
'CRC support-role predicate requiring deterministic current school, effective membership, effective linked staff placement when applicable, and explicit Platform Support separation.';
comment on function app_private.is_school_leadership(uuid,uuid) is
'CRC leadership predicate requiring deterministic current school, effective membership, effective linked staff placement when applicable, and explicit Platform Support separation.';
comment on function app_private.enforce_crc_custody_scope_integrity() is
'Defense-in-depth guard binding CRC custody tenant, origin school, receiving school, learner and enrolment scope while requiring a current authorized receiving custodian.';
