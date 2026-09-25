-- Issue #689: CRC custody request / transfer lifecycle and bounded network escalation.
-- Extends the canonical CRC custody model. Delegated CRC custodianship grants
-- transfer workflow authority only; it does not grant counselling, health or
-- psychometric access.

insert into public.school_duty_capabilities(duty_key,label,description,navigation_key,active)
values(
  'crc_custodian',
  'CRC custodian',
  'Manage governed CRC requests and school-to-school custody transfers while the delegation is effective. This does not grant counselling or psychometric access.',
  'crc_custody',
  true
)
on conflict (duty_key) do update set
  label=excluded.label,
  description=excluded.description,
  navigation_key=excluded.navigation_key,
  active=excluded.active;

create or replace function app_private.is_crc_custodian(
  p_user_id uuid,
  p_school_id uuid,
  p_on_date date default (now() at time zone 'Africa/Windhoek')::date
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select p_user_id is not null
    and p_school_id is not null
    and p_on_date is not null
    and (
      app_private.is_support_role_member(p_user_id,p_school_id)
      or (
        not exists(
          select 1
          from public.platform_memberships pm
          where pm.user_id=p_user_id
            and pm.role_key='platform_support'
            and pm.active_from<=p_on_date
            and (pm.active_to is null or pm.active_to>=p_on_date)
        )
        and exists(
          select 1
          from public.school_duty_assignments d
          join public.staff_members sm on sm.id=d.staff_member_id
          where d.school_id=p_school_id
            and d.duty_key='crc_custodian'
            and d.active_from<=p_on_date
            and (d.active_to is null or d.active_to>=p_on_date)
            and sm.user_id=p_user_id
            and sm.status='active'
            and app_private.staff_member_has_school_assignment(sm.id,p_school_id,p_on_date)
            and exists(
              select 1
              from public.school_memberships membership
              where membership.user_id=p_user_id
                and membership.school_id=p_school_id
                and membership.staff_member_id=sm.id
                and membership.active_from<=p_on_date
                and (membership.active_to is null or membership.active_to>=p_on_date)
            )
        )
      )
    );
$$;

revoke all on function app_private.is_crc_custodian(uuid,uuid,date)
from public,anon,authenticated;

create or replace function app_private.can_access_crc_custody_record(p_custody_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select exists(
    select 1
    from public.crc_custody_records r
    where r.id=p_custody_id
      and (
        app_private.is_crc_custodian(auth.uid(),r.school_id)
        or app_private.is_school_leadership(auth.uid(),r.school_id)
        or (
          r.receiving_user_id=auth.uid()
          and app_private.is_crc_custodian(auth.uid(),r.receiving_school_id)
        )
        or app_private.is_school_leadership(auth.uid(),r.receiving_school_id)
      )
  );
$$;

revoke all on function app_private.can_access_crc_custody_record(uuid)
from public,anon,authenticated;

create or replace function app_private.can_manage_crc_custody_outgoing(p_custody_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select exists(
    select 1
    from public.crc_custody_records r
    where r.id=p_custody_id
      and app_private.is_crc_custodian(auth.uid(),r.school_id)
  );
$$;

create or replace function app_private.can_manage_crc_custody_incoming(p_custody_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select exists(
    select 1
    from public.crc_custody_records r
    where r.id=p_custody_id
      and r.receiving_user_id=auth.uid()
      and app_private.is_crc_custodian(auth.uid(),r.receiving_school_id)
  );
$$;

revoke all on function app_private.can_manage_crc_custody_outgoing(uuid) from public,anon,authenticated;
revoke all on function app_private.can_manage_crc_custody_incoming(uuid) from public,anon,authenticated;

-- Replace the custody lifecycle integrity guard so delegated custodians may manage
-- custody without becoming confidential learner-support actors.
create or replace function app_private.enforce_crc_custody_lifecycle_integrity()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op='INSERT' then
    if new.custody_status<>'prepared' then
      raise exception 'CRC custody records must be created as prepared';
    end if;
    if new.authorized_by_user_id is not null or new.authorized_at is not null
       or new.dispatched_by_user_id is not null or new.dispatched_at is not null
       or new.received_by_user_id is not null or new.received_at is not null
       or new.acknowledged_by_user_id is not null or new.acknowledged_at is not null
       or new.closed_by_user_id is not null or new.closed_at is not null then
      raise exception 'CRC custody preparation must not carry later lifecycle provenance';
    end if;
    if v_actor is not null and new.prepared_by_user_id is distinct from v_actor then
      raise exception 'CRC custody preparer must match authenticated actor';
    end if;
    if not app_private.is_crc_custodian(new.prepared_by_user_id,new.school_id) then
      raise exception 'CRC custody preparer is not an authorized custodian';
    end if;
    if not app_private.is_crc_custodian(new.receiving_user_id,new.receiving_school_id) then
      raise exception 'CRC custody recipient is not an authorized receiving custodian';
    end if;
    if new.receiving_school_id=new.school_id then
      raise exception 'CRC custody must be dispatched to a different school';
    end if;
    return new;
  end if;

  if new.tenant_id is distinct from old.tenant_id
     or new.school_id is distinct from old.school_id
     or new.learner_id is distinct from old.learner_id
     or new.enrolment_id is distinct from old.enrolment_id
     or new.prepared_by_user_id is distinct from old.prepared_by_user_id
     or new.receiving_school_id is distinct from old.receiving_school_id
     or new.receiving_user_id is distinct from old.receiving_user_id then
    raise exception 'CRC custody provenance is immutable';
  end if;

  if new.custody_status=old.custody_status then return new; end if;

  case new.custody_status
    when 'authorized' then
      if old.custody_status<>'prepared' then raise exception 'CRC custody must be authorized from prepared'; end if;
      if new.authorized_by_user_id is null or new.authorized_at is null then raise exception 'CRC custody authorization requires provenance'; end if;
      if v_actor is not null and new.authorized_by_user_id is distinct from v_actor then raise exception 'CRC custody authorizer must match authenticated actor'; end if;
      if not app_private.is_school_leadership(new.authorized_by_user_id,new.school_id) then raise exception 'CRC custody authorizer is not school leadership'; end if;
    when 'dispatched' then
      if old.custody_status<>'authorized' then raise exception 'CRC custody must be dispatched from authorized'; end if;
      if new.dispatched_by_user_id is null or new.dispatched_at is null then raise exception 'CRC custody dispatch requires provenance'; end if;
      if v_actor is not null and new.dispatched_by_user_id is distinct from v_actor then raise exception 'CRC custody dispatcher must match authenticated actor'; end if;
      if not app_private.is_crc_custodian(new.dispatched_by_user_id,new.school_id) then raise exception 'CRC custody dispatcher is not an authorized custodian'; end if;
    when 'received' then
      if old.custody_status<>'dispatched' then raise exception 'CRC custody must be received from dispatched'; end if;
      if new.received_by_user_id is null or new.received_at is null then raise exception 'CRC custody receipt requires provenance'; end if;
      if v_actor is not null and new.received_by_user_id is distinct from v_actor then raise exception 'CRC custody receiver must match authenticated actor'; end if;
      if new.received_by_user_id is distinct from new.receiving_user_id
         or not app_private.is_crc_custodian(new.received_by_user_id,new.receiving_school_id) then
        raise exception 'CRC custody receiver is not the authorized receiving custodian';
      end if;
    when 'acknowledged' then
      if old.custody_status<>'received' then raise exception 'CRC custody must be acknowledged from received'; end if;
      if new.acknowledged_by_user_id is null or new.acknowledged_at is null then raise exception 'CRC custody acknowledgement requires provenance'; end if;
      if v_actor is not null and new.acknowledged_by_user_id is distinct from v_actor then raise exception 'CRC custody acknowledger must match authenticated actor'; end if;
      if new.acknowledged_by_user_id is distinct from new.receiving_user_id
         or not app_private.is_crc_custodian(new.acknowledged_by_user_id,new.receiving_school_id) then
        raise exception 'CRC custody acknowledger is not the authorized receiving custodian';
      end if;
    when 'closed' then
      if old.custody_status<>'acknowledged' then raise exception 'CRC custody must be closed from acknowledged'; end if;
      if new.closed_by_user_id is null or new.closed_at is null then raise exception 'CRC custody closure requires provenance'; end if;
      if v_actor is not null and new.closed_by_user_id is distinct from v_actor then raise exception 'CRC custody closer must match authenticated actor'; end if;
      if not (
        (new.closed_by_user_id=new.receiving_user_id and app_private.is_crc_custodian(new.closed_by_user_id,new.receiving_school_id))
        or app_private.is_crc_custodian(new.closed_by_user_id,new.school_id)
      ) then
        raise exception 'CRC custody closer is not the receiving or originating custodian';
      end if;
    else
      raise exception 'Unknown CRC custody status';
  end case;

  return new;
end;
$$;

revoke all on function app_private.enforce_crc_custody_lifecycle_integrity()
from public,anon,authenticated;

create or replace function app_private.enforce_crc_custody_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_origin_tenant uuid;
  v_receiving_tenant uuid;
  v_learner_tenant uuid;
begin
  select tenant_id into v_origin_tenant from public.schools where id=new.school_id;
  select tenant_id into v_receiving_tenant from public.schools where id=new.receiving_school_id;
  select tenant_id into v_learner_tenant from public.learners where id=new.learner_id;

  if v_origin_tenant is null
     or v_receiving_tenant is null
     or v_learner_tenant is null
     or v_origin_tenant is distinct from new.tenant_id
     or v_receiving_tenant is distinct from new.tenant_id
     or v_learner_tenant is distinct from new.tenant_id then
    raise exception 'CRC custody scope mismatch';
  end if;

  if new.enrolment_id is not null and not exists(
    select 1 from public.enrolments e
    where e.id=new.enrolment_id
      and e.tenant_id=new.tenant_id
      and e.school_id=new.school_id
      and e.learner_id=new.learner_id
  ) then
    raise exception 'CRC custody enrolment scope mismatch';
  end if;

  if not app_private.is_crc_custodian(new.receiving_user_id,new.receiving_school_id) then
    raise exception 'CRC custody recipient is not an authorized receiving custodian';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_crc_custody_scope_integrity()
from public,anon,authenticated;

create table if not exists public.crc_custody_request_policies(
  school_id uuid primary key references public.schools(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  response_days smallint not null default 7 check(response_days between 1 and 60),
  updated_by_user_id uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.crc_custody_requests(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  receiving_school_id uuid not null references public.schools(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  receiving_enrolment_id uuid not null references public.enrolments(id) on delete restrict,
  receiving_user_id uuid not null references auth.users(id) on delete restrict,
  origin_school_id uuid references public.schools(id) on delete restrict,
  external_origin_name text,
  status text not null default 'requested'
    check(status in ('requested','accepted','fulfilled','cancelled','escalated')),
  requested_on date not null default (now() at time zone 'Africa/Windhoek')::date,
  response_due_on date not null,
  request_note text,
  custody_record_id uuid references public.crc_custody_records(id) on delete restrict,
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(
    (origin_school_id is not null and external_origin_name is null)
    or
    (origin_school_id is null and nullif(btrim(coalesce(external_origin_name,'')),'') is not null)
  ),
  check(origin_school_id is null or origin_school_id<>receiving_school_id),
  check(response_due_on>=requested_on),
  check(fulfilled_at is null or status='fulfilled')
);

create unique index if not exists crc_custody_requests_open_unique
on public.crc_custody_requests(receiving_school_id,learner_id)
where status in ('requested','accepted','escalated');

create index if not exists crc_custody_requests_origin_queue_idx
on public.crc_custody_requests(origin_school_id,status,response_due_on)
where origin_school_id is not null;

create index if not exists crc_custody_requests_receiving_queue_idx
on public.crc_custody_requests(receiving_school_id,status,response_due_on);

create table if not exists public.crc_custody_request_escalations(
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.crc_custody_requests(id) on delete cascade,
  receiving_school_id uuid not null references public.schools(id) on delete restrict,
  origin_school_id uuid references public.schools(id) on delete restrict,
  scope_kind text not null check(scope_kind in ('circuit','region')),
  circuit_id uuid references public.education_circuits(id) on delete restrict,
  region_id uuid references public.education_regions(id) on delete restrict,
  status text not null default 'open' check(status in ('open','acknowledged','resolved')),
  escalated_by_user_id uuid not null references auth.users(id) on delete restrict,
  acknowledged_by_user_id uuid references auth.users(id) on delete set null,
  escalated_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  check(
    (scope_kind='circuit' and circuit_id is not null and region_id is null)
    or
    (scope_kind='region' and region_id is not null and circuit_id is null)
  )
);

create unique index if not exists crc_custody_request_escalations_active_unique
on public.crc_custody_request_escalations(request_id,scope_kind)
where status in ('open','acknowledged');

alter table public.crc_custody_request_policies enable row level security;
alter table public.crc_custody_requests enable row level security;
alter table public.crc_custody_request_escalations enable row level security;

create or replace function app_private.can_read_crc_request_policy_for_rls(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select app_private.is_school_leadership(auth.uid(),p_school_id)
    or app_private.is_crc_custodian(auth.uid(),p_school_id);
$$;

create or replace function app_private.can_read_crc_custody_request_for_rls(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select exists(
    select 1
    from public.crc_custody_requests r
    where r.id=p_request_id
      and (
        app_private.is_school_leadership(auth.uid(),r.receiving_school_id)
        or app_private.is_crc_custodian(auth.uid(),r.receiving_school_id)
        or (
          r.origin_school_id is not null
          and (
            app_private.is_school_leadership(auth.uid(),r.origin_school_id)
            or app_private.is_crc_custodian(auth.uid(),r.origin_school_id)
          )
        )
      )
  );
$$;

create or replace function app_private.can_read_crc_request_escalation_for_rls(p_escalation_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select exists(
    select 1
    from public.crc_custody_request_escalations x
    where x.id=p_escalation_id
      and (
        app_private.is_school_leadership(auth.uid(),x.receiving_school_id)
        or app_private.is_crc_custodian(auth.uid(),x.receiving_school_id)
        or (
          x.origin_school_id is not null
          and (
            app_private.is_school_leadership(auth.uid(),x.origin_school_id)
            or app_private.is_crc_custodian(auth.uid(),x.origin_school_id)
          )
        )
      )
  );
$$;

revoke all on function app_private.can_read_crc_request_policy_for_rls(uuid) from public,anon;
revoke all on function app_private.can_read_crc_custody_request_for_rls(uuid) from public,anon;
revoke all on function app_private.can_read_crc_request_escalation_for_rls(uuid) from public,anon;
grant execute on function app_private.can_read_crc_request_policy_for_rls(uuid) to authenticated;
grant execute on function app_private.can_read_crc_custody_request_for_rls(uuid) to authenticated;
grant execute on function app_private.can_read_crc_request_escalation_for_rls(uuid) to authenticated;

create policy "school leadership read crc request policy"
on public.crc_custody_request_policies for select to authenticated
using(app_private.can_read_crc_request_policy_for_rls(school_id));

create policy "school actors read crc custody requests"
on public.crc_custody_requests for select to authenticated
using(app_private.can_read_crc_custody_request_for_rls(id));

create policy "school actors read crc escalation rows"
on public.crc_custody_request_escalations for select to authenticated
using(app_private.can_read_crc_request_escalation_for_rls(id));

revoke insert,update,delete on public.crc_custody_request_policies from authenticated;
revoke insert,update,delete on public.crc_custody_requests from authenticated;
revoke insert,update,delete on public.crc_custody_request_escalations from authenticated;
grant select on public.crc_custody_request_policies,public.crc_custody_requests,public.crc_custody_request_escalations to authenticated;

create or replace function public.get_crc_custody_access_context(p_school_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  return jsonb_build_object(
    'can_manage_custody',app_private.is_crc_custodian(auth.uid(),p_school_id),
    'can_view_confidential_support',app_private.is_support_role_member(auth.uid(),p_school_id),
    'leadership',app_private.is_school_leadership(auth.uid(),p_school_id)
  );
end;
$$;

revoke all on function public.get_crc_custody_access_context(uuid) from public,anon;
grant execute on function public.get_crc_custody_access_context(uuid) to authenticated;

create or replace function public.set_crc_custody_request_policy(
  p_school_id uuid,
  p_response_days smallint
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_tenant_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.is_school_leadership(auth.uid(),p_school_id) then raise exception 'Permission denied'; end if;
  if p_response_days<1 or p_response_days>60 then raise exception 'Response days must be between 1 and 60'; end if;
  select tenant_id into v_tenant_id from public.schools where id=p_school_id;
  if v_tenant_id is null then raise exception 'School not found'; end if;

  insert into public.crc_custody_request_policies(
    school_id,tenant_id,response_days,updated_by_user_id,updated_at
  )
  values(p_school_id,v_tenant_id,p_response_days,auth.uid(),now())
  on conflict(school_id) do update set
    response_days=excluded.response_days,
    updated_by_user_id=auth.uid(),
    updated_at=now();

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  )
  values(
    v_tenant_id,p_school_id,auth.uid(),'crc_custody.request_policy_updated','school',p_school_id,
    jsonb_build_object('response_days',p_response_days)
  );
  return true;
end;
$$;

revoke all on function public.set_crc_custody_request_policy(uuid,smallint) from public,anon;
grant execute on function public.set_crc_custody_request_policy(uuid,smallint) to authenticated;

create or replace function public.list_crc_request_origins(p_learner_id uuid)
returns table(
  school_id uuid,
  school_name text,
  school_town text,
  last_enrolled_on date
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_receiving_school_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select e.school_id into v_receiving_school_id
  from public.enrolments e
  where e.learner_id=p_learner_id
    and e.status='current'
    and e.enrolled_from<=(now() at time zone 'Africa/Windhoek')::date
    and (e.enrolled_to is null or e.enrolled_to>=(now() at time zone 'Africa/Windhoek')::date)
    and app_private.is_crc_custodian(auth.uid(),e.school_id)
  order by e.enrolled_from desc,e.id
  limit 1;

  if v_receiving_school_id is null then raise exception 'Permission denied'; end if;

  return query
  select e.school_id,s.name,s.town,max(coalesce(e.enrolled_to,e.enrolled_from))
  from public.enrolments e
  join public.schools s on s.id=e.school_id
  where e.learner_id=p_learner_id
    and e.school_id<>v_receiving_school_id
    and s.tenant_id=(select tenant_id from public.schools where id=v_receiving_school_id)
  group by e.school_id,s.name,s.town
  order by max(coalesce(e.enrolled_to,e.enrolled_from)) desc,s.name;
end;
$$;

revoke all on function public.list_crc_request_origins(uuid) from public,anon;
grant execute on function public.list_crc_request_origins(uuid) to authenticated;

create or replace function public.request_crc_custody(
  p_learner_id uuid,
  p_origin_school_id uuid default null,
  p_external_origin_name text default null,
  p_request_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_enrolment public.enrolments%rowtype;
  v_days smallint;
  v_id uuid;
  v_external text := nullif(btrim(coalesce(p_external_origin_name,'')),'');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select e.* into v_enrolment
  from public.enrolments e
  where e.learner_id=p_learner_id
    and e.status='current'
    and e.enrolled_from<=(now() at time zone 'Africa/Windhoek')::date
    and (e.enrolled_to is null or e.enrolled_to>=(now() at time zone 'Africa/Windhoek')::date)
    and app_private.is_crc_custodian(auth.uid(),e.school_id)
  order by e.enrolled_from desc,e.id
  limit 1;

  if v_enrolment.id is null then
    raise exception 'Permission denied: current receiving-school custodian required';
  end if;

  if (p_origin_school_id is null)=(v_external is null) then
    raise exception 'Choose either a ScolaPro origin school or an external origin name';
  end if;

  if p_origin_school_id is not null then
    if p_origin_school_id=v_enrolment.school_id then raise exception 'Origin school must differ from receiving school'; end if;
    if not exists(
      select 1
      from public.enrolments previous_e
      join public.schools previous_s on previous_s.id=previous_e.school_id
      where previous_e.learner_id=p_learner_id
        and previous_e.school_id=p_origin_school_id
        and previous_s.tenant_id=v_enrolment.tenant_id
    ) then
      raise exception 'Origin school is not part of this learner history';
    end if;
  end if;

  insert into public.crc_custody_request_policies(school_id,tenant_id,response_days)
  values(v_enrolment.school_id,v_enrolment.tenant_id,7)
  on conflict(school_id) do nothing;

  select response_days into v_days
  from public.crc_custody_request_policies
  where school_id=v_enrolment.school_id;

  insert into public.crc_custody_requests(
    tenant_id,receiving_school_id,learner_id,receiving_enrolment_id,receiving_user_id,
    origin_school_id,external_origin_name,status,requested_on,response_due_on,
    request_note,requested_by_user_id
  )
  values(
    v_enrolment.tenant_id,v_enrolment.school_id,p_learner_id,v_enrolment.id,auth.uid(),
    p_origin_school_id,v_external,'requested',(now() at time zone 'Africa/Windhoek')::date,
    (now() at time zone 'Africa/Windhoek')::date+v_days,
    nullif(btrim(coalesce(p_request_note,'')),''),auth.uid()
  )
  returning id into v_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  )
  values(
    v_enrolment.tenant_id,v_enrolment.school_id,auth.uid(),
    'crc_custody.requested','crc_custody_request',v_id,
    jsonb_build_object(
      'learner_id',p_learner_id,
      'origin_school_id',p_origin_school_id,
      'external_origin',v_external is not null,
      'response_due_on',(now() at time zone 'Africa/Windhoek')::date+v_days
    )
  );

  return v_id;
end;
$$;

revoke all on function public.request_crc_custody(uuid,uuid,text,text) from public,anon;
grant execute on function public.request_crc_custody(uuid,uuid,text,text) to authenticated;

create or replace function public.accept_crc_custody_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_request public.crc_custody_requests%rowtype;
  v_origin_enrolment public.enrolments%rowtype;
  v_custody_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_request
  from public.crc_custody_requests
  where id=p_request_id
  for update;

  if v_request.id is null then raise exception 'CRC custody request not found'; end if;
  if v_request.origin_school_id is null then raise exception 'External CRC requests are fulfilled manually'; end if;
  if v_request.status not in ('requested','escalated') then raise exception 'CRC custody request is not awaiting origin action'; end if;
  if not app_private.is_crc_custodian(auth.uid(),v_request.origin_school_id) then
    raise exception 'Permission denied: origin CRC custodian required';
  end if;
  if not app_private.is_crc_custodian(v_request.receiving_user_id,v_request.receiving_school_id) then
    raise exception 'Receiving custodian is no longer authorized';
  end if;

  select e.* into v_origin_enrolment
  from public.enrolments e
  where e.learner_id=v_request.learner_id
    and e.school_id=v_request.origin_school_id
  order by coalesce(e.enrolled_to,e.enrolled_from) desc,e.enrolled_from desc,e.id
  limit 1;

  if v_origin_enrolment.id is null then raise exception 'Origin learner enrolment not found'; end if;

  insert into public.crc_custody_records(
    tenant_id,school_id,learner_id,enrolment_id,custody_status,
    prepared_by_user_id,receiving_school_id,receiving_user_id,custody_note
  )
  values(
    v_request.tenant_id,v_request.origin_school_id,v_request.learner_id,v_origin_enrolment.id,
    'prepared',auth.uid(),v_request.receiving_school_id,v_request.receiving_user_id,
    v_request.request_note
  )
  returning id into v_custody_id;

  update public.crc_custody_requests
  set status='accepted',custody_record_id=v_custody_id,updated_at=now()
  where id=v_request.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  )
  values(
    v_request.tenant_id,v_request.origin_school_id,auth.uid(),
    'crc_custody.request_accepted','crc_custody_request',v_request.id,
    jsonb_build_object(
      'custody_record_id',v_custody_id,
      'receiving_school_id',v_request.receiving_school_id
    )
  );

  return v_custody_id;
end;
$$;

revoke all on function public.accept_crc_custody_request(uuid) from public,anon;
grant execute on function public.accept_crc_custody_request(uuid) to authenticated;

create or replace function public.fulfill_external_crc_custody_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_request public.crc_custody_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_request from public.crc_custody_requests where id=p_request_id for update;
  if v_request.id is null then raise exception 'CRC custody request not found'; end if;
  if v_request.origin_school_id is not null then raise exception 'Internal CRC requests complete through custody acknowledgement'; end if;
  if v_request.status not in ('requested','escalated') then raise exception 'External CRC request is not open'; end if;
  if not (
    app_private.is_crc_custodian(auth.uid(),v_request.receiving_school_id)
    or app_private.is_school_leadership(auth.uid(),v_request.receiving_school_id)
  ) then raise exception 'Permission denied'; end if;

  update public.crc_custody_requests
  set status='fulfilled',fulfilled_at=now(),updated_at=now()
  where id=v_request.id;

  update public.crc_custody_request_escalations
  set status='resolved',resolved_at=now()
  where request_id=v_request.id
    and status<>'resolved';

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  )
  values(
    v_request.tenant_id,v_request.receiving_school_id,auth.uid(),
    'crc_custody.external_request_fulfilled','crc_custody_request',v_request.id,
    jsonb_build_object('external_origin_name',v_request.external_origin_name)
  );

  return true;
end;
$$;

revoke all on function public.fulfill_external_crc_custody_request(uuid) from public,anon;
grant execute on function public.fulfill_external_crc_custody_request(uuid) to authenticated;

create or replace function public.escalate_crc_custody_request(
  p_request_id uuid,
  p_scope_kind text
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_request public.crc_custody_requests%rowtype;
  v_network public.school_network_assignments%rowtype;
  v_origin_network public.school_network_assignments%rowtype;
  v_escalation_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_scope_kind not in ('circuit','region') then raise exception 'Escalation scope must be circuit or region'; end if;

  select * into v_request from public.crc_custody_requests where id=p_request_id for update;
  if v_request.id is null then raise exception 'CRC custody request not found'; end if;
  if v_request.status not in ('requested','escalated') then raise exception 'Only open CRC requests can be escalated'; end if;
  if v_request.response_due_on>=(now() at time zone 'Africa/Windhoek')::date then
    raise exception 'CRC custody request is not overdue';
  end if;
  if not (
    app_private.is_crc_custodian(auth.uid(),v_request.receiving_school_id)
    or app_private.is_school_leadership(auth.uid(),v_request.receiving_school_id)
  ) then raise exception 'Permission denied'; end if;

  select * into v_network
  from public.school_network_assignments a
  where a.school_id=v_request.receiving_school_id
    and a.effective_from<=(now() at time zone 'Africa/Windhoek')::date
    and (a.effective_to is null or a.effective_to>=(now() at time zone 'Africa/Windhoek')::date)
  order by a.effective_from desc,a.id
  limit 1;

  if v_network.id is null then raise exception 'Receiving school has no current education-network assignment'; end if;

  if v_request.origin_school_id is not null then
    select * into v_origin_network
    from public.school_network_assignments a
    where a.school_id=v_request.origin_school_id
      and a.effective_from<=(now() at time zone 'Africa/Windhoek')::date
      and (a.effective_to is null or a.effective_to>=(now() at time zone 'Africa/Windhoek')::date)
    order by a.effective_from desc,a.id
    limit 1;
  end if;

  if p_scope_kind='circuit'
     and v_request.origin_school_id is not null
     and (v_origin_network.id is null or v_origin_network.circuit_id<>v_network.circuit_id) then
    raise exception 'Circuit escalation requires both schools in the same current circuit';
  end if;

  if p_scope_kind='region'
     and v_request.origin_school_id is not null
     and (v_origin_network.id is null or v_origin_network.region_id<>v_network.region_id) then
    raise exception 'Regional escalation requires both schools in the same current region';
  end if;

  insert into public.crc_custody_request_escalations(
    request_id,receiving_school_id,origin_school_id,scope_kind,circuit_id,region_id,
    escalated_by_user_id
  )
  values(
    v_request.id,v_request.receiving_school_id,v_request.origin_school_id,p_scope_kind,
    case when p_scope_kind='circuit' then v_network.circuit_id else null end,
    case when p_scope_kind='region' then v_network.region_id else null end,
    auth.uid()
  )
  returning id into v_escalation_id;

  update public.crc_custody_requests
  set status='escalated',updated_at=now()
  where id=v_request.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  )
  values(
    v_request.tenant_id,v_request.receiving_school_id,auth.uid(),
    'crc_custody.request_escalated','crc_custody_request',v_request.id,
    jsonb_build_object('scope_kind',p_scope_kind,'escalation_id',v_escalation_id)
  );

  return v_escalation_id;
end;
$$;

revoke all on function public.escalate_crc_custody_request(uuid,text) from public,anon;
grant execute on function public.escalate_crc_custody_request(uuid,text) to authenticated;

create or replace function public.list_my_crc_request_escalations()
returns table(
  escalation_id uuid,
  request_id uuid,
  scope_kind text,
  receiving_school_name text,
  origin_school_name text,
  response_due_on date,
  request_status text,
  escalation_status text,
  escalated_at timestamptz
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  return query
  select
    x.id,
    x.request_id,
    x.scope_kind,
    rs.name,
    coalesce(os.name,r.external_origin_name,'External school'),
    r.response_due_on,
    r.status,
    x.status,
    x.escalated_at
  from public.crc_custody_request_escalations x
  join public.crc_custody_requests r on r.id=x.request_id
  join public.schools rs on rs.id=x.receiving_school_id
  left join public.schools os on os.id=x.origin_school_id
  where exists(
    select 1
    from public.education_network_memberships m
    where m.user_id=auth.uid()
      and m.active_from<=(now() at time zone 'Africa/Windhoek')::date
      and (m.active_to is null or m.active_to>=(now() at time zone 'Africa/Windhoek')::date)
      and (
        (x.scope_kind='circuit' and m.role_key='circuit_officer' and m.circuit_id=x.circuit_id)
        or
        (x.scope_kind='region' and m.role_key='regional_officer' and m.region_id=x.region_id)
      )
  )
  order by x.escalated_at desc,x.id;
end;
$$;

revoke all on function public.list_my_crc_request_escalations() from public,anon;
grant execute on function public.list_my_crc_request_escalations() to authenticated;

create or replace function public.acknowledge_crc_request_escalation(p_escalation_id uuid)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_escalation public.crc_custody_request_escalations%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_escalation
  from public.crc_custody_request_escalations
  where id=p_escalation_id
  for update;
  if v_escalation.id is null then raise exception 'CRC escalation not found'; end if;

  if not exists(
    select 1
    from public.education_network_memberships m
    where m.user_id=auth.uid()
      and m.active_from<=(now() at time zone 'Africa/Windhoek')::date
      and (m.active_to is null or m.active_to>=(now() at time zone 'Africa/Windhoek')::date)
      and (
        (v_escalation.scope_kind='circuit' and m.role_key='circuit_officer' and m.circuit_id=v_escalation.circuit_id)
        or
        (v_escalation.scope_kind='region' and m.role_key='regional_officer' and m.region_id=v_escalation.region_id)
      )
  ) then raise exception 'Permission denied'; end if;

  update public.crc_custody_request_escalations
  set status='acknowledged',acknowledged_by_user_id=auth.uid(),acknowledged_at=now()
  where id=v_escalation.id and status='open';

  return true;
end;
$$;

revoke all on function public.acknowledge_crc_request_escalation(uuid) from public,anon;
grant execute on function public.acknowledge_crc_request_escalation(uuid) to authenticated;

create or replace function public.get_my_crc_custody_requests()
returns table(
  request_id uuid,
  learner_name text,
  admission_number text,
  receiving_school_name text,
  origin_school_name text,
  status text,
  requested_on date,
  response_due_on date,
  overdue boolean,
  request_note text,
  custody_record_id uuid,
  incoming boolean,
  outgoing boolean,
  external_origin boolean
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  return query
  select
    r.id,
    concat_ws(' ',l.first_names,l.surname),
    e.admission_number,
    rs.name,
    coalesce(os.name,r.external_origin_name,'External school'),
    r.status,
    r.requested_on,
    r.response_due_on,
    r.status in ('requested','escalated') and r.response_due_on<(now() at time zone 'Africa/Windhoek')::date,
    r.request_note,
    r.custody_record_id,
    (
      app_private.is_crc_custodian(auth.uid(),r.origin_school_id)
      or app_private.is_school_leadership(auth.uid(),r.origin_school_id)
    ),
    (
      app_private.is_crc_custodian(auth.uid(),r.receiving_school_id)
      or app_private.is_school_leadership(auth.uid(),r.receiving_school_id)
    ),
    r.origin_school_id is null
  from public.crc_custody_requests r
  join public.learners l on l.id=r.learner_id
  join public.enrolments e on e.id=r.receiving_enrolment_id
  join public.schools rs on rs.id=r.receiving_school_id
  left join public.schools os on os.id=r.origin_school_id
  where
    app_private.is_crc_custodian(auth.uid(),r.receiving_school_id)
    or app_private.is_school_leadership(auth.uid(),r.receiving_school_id)
    or (r.origin_school_id is not null and app_private.is_crc_custodian(auth.uid(),r.origin_school_id))
    or (r.origin_school_id is not null and app_private.is_school_leadership(auth.uid(),r.origin_school_id))
  order by
    case when r.status in ('requested','escalated') then 0 when r.status='accepted' then 1 else 2 end,
    r.response_due_on,
    r.created_at desc;
end;
$$;

revoke all on function public.get_my_crc_custody_requests() from public,anon;
grant execute on function public.get_my_crc_custody_requests() to authenticated;

-- Requests linked to a completed custody transfer become fulfilled when the
-- existing lifecycle reaches closed. Escalation rows are resolved at the same
-- transaction boundary.
create or replace function app_private.finish_crc_request_from_closed_custody()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if new.custody_status='closed' and old.custody_status is distinct from 'closed' then
    update public.crc_custody_requests
    set status='fulfilled',fulfilled_at=coalesce(new.closed_at,now()),updated_at=now()
    where custody_record_id=new.id and status in ('accepted','escalated','requested');

    update public.crc_custody_request_escalations x
    set status='resolved',resolved_at=coalesce(new.closed_at,now())
    where x.request_id in(
      select r.id from public.crc_custody_requests r where r.custody_record_id=new.id
    )
      and x.status<>'resolved';
  end if;
  return new;
end;
$$;

revoke all on function app_private.finish_crc_request_from_closed_custody()
from public,anon,authenticated;

drop trigger if exists crc_custody_request_completion_trg on public.crc_custody_records;
create trigger crc_custody_request_completion_trg
after update of custody_status on public.crc_custody_records
for each row execute function app_private.finish_crc_request_from_closed_custody();

-- Historical origin CRC rows attached to the transferred enrolment become
-- read-only after custody closes. A later re-enrolment at the original school
-- uses a different enrolment id and therefore remains writable.
create or replace function app_private.enforce_transferred_crc_history_read_only()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_enrolment_id uuid := case when tg_op='DELETE' then old.enrolment_id else new.enrolment_id end;
begin
  if v_enrolment_id is not null and exists(
    select 1
    from public.crc_custody_records r
    where r.enrolment_id=v_enrolment_id
      and r.custody_status='closed'
  ) then
    raise exception 'Transferred origin CRC history is read-only';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

revoke all on function app_private.enforce_transferred_crc_history_read_only()
from public,anon,authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'learner_prior_school_history',
    'learner_health_history',
    'learner_psychometric_records',
    'learner_development_observations',
    'learner_cumulative_notes'
  ] loop
    execute format('drop trigger if exists %I on public.%I',v_table||'_transferred_crc_read_only_trg',v_table);
    execute format(
      'create trigger %I before insert or update or delete on public.%I for each row execute function app_private.enforce_transferred_crc_history_read_only()',
      v_table||'_transferred_crc_read_only_trg',v_table
    );
  end loop;
end;
$$;

-- Refresh existing custody helpers to use delegated CRC custodian authority.
create or replace function public.prepare_crc_custody(
  p_learner_id uuid,
  p_receiving_school_id uuid,
  p_receiving_user_id uuid,
  p_custody_note text default null
)
returns table(custody_id uuid)
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_enrolment public.enrolments%rowtype;
  v_custody_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select e.* into v_enrolment
  from public.enrolments e
  where e.learner_id=p_learner_id
    and e.status='current'
    and e.enrolled_from<=(now() at time zone 'Africa/Windhoek')::date
    and (e.enrolled_to is null or e.enrolled_to>=(now() at time zone 'Africa/Windhoek')::date)
  order by e.enrolled_from desc,e.id
  limit 1;

  if v_enrolment.id is null then raise exception 'Learner has no current enrolment at a school'; end if;
  if not app_private.is_crc_custodian(auth.uid(),v_enrolment.school_id) then
    raise exception 'Permission denied: not an authorized custodian at the learner school';
  end if;
  if p_receiving_school_id=v_enrolment.school_id then raise exception 'CRC custody must be dispatched to a different school'; end if;
  if not exists(
    select 1 from public.schools s
    where s.id=p_receiving_school_id
      and s.tenant_id=v_enrolment.tenant_id
      and s.status='active'
  ) then raise exception 'Receiving school not found in learner tenant or inactive'; end if;
  if not app_private.is_crc_custodian(p_receiving_user_id,p_receiving_school_id) then
    raise exception 'Receiving user is not an authorized custodian at the receiving school';
  end if;

  insert into public.crc_custody_records(
    tenant_id,school_id,learner_id,enrolment_id,custody_status,
    prepared_by_user_id,receiving_school_id,receiving_user_id,custody_note
  )
  values(
    v_enrolment.tenant_id,v_enrolment.school_id,v_enrolment.learner_id,v_enrolment.id,
    'prepared',auth.uid(),p_receiving_school_id,p_receiving_user_id,
    nullif(btrim(coalesce(p_custody_note,'')),'')
  )
  returning id into v_custody_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  )
  values(
    v_enrolment.tenant_id,v_enrolment.school_id,auth.uid(),
    'crc_custody.prepared','crc_custody_record',v_custody_id,
    jsonb_build_object(
      'learner_id',v_enrolment.learner_id,
      'receiving_school_id',p_receiving_school_id,
      'receiving_user_id',p_receiving_user_id
    )
  );

  return query select v_custody_id;
end;
$$;

create or replace function public.search_crc_custody_receivers(p_school_id uuid)
returns table(user_id uuid,display_name text,role_key text)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_origin_school_id uuid;
  v_tenant_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select sm.school_id,sm.tenant_id into v_origin_school_id,v_tenant_id
  from public.school_memberships sm
  where sm.user_id=auth.uid()
    and sm.active_from<=(now() at time zone 'Africa/Windhoek')::date
    and (sm.active_to is null or sm.active_to>=(now() at time zone 'Africa/Windhoek')::date)
  order by sm.active_from desc,sm.id
  limit 1;

  if v_origin_school_id is null or not app_private.is_crc_custodian(auth.uid(),v_origin_school_id) then
    raise exception 'Permission denied: not an authorized custodian';
  end if;

  if p_school_id=v_origin_school_id
     or not exists(
       select 1 from public.schools s
       where s.id=p_school_id and s.tenant_id=v_tenant_id and s.status='active'
     ) then raise exception 'Receiving school is outside the authorized tenant scope'; end if;

  return query
  select distinct on (sm.user_id)
    sm.user_id,
    coalesce(up.display_name,concat_ws(' ',staff.first_name,staff.last_name),split_part(au.email,'@',1)),
    case
      when sm.role_key in ('counsellor','learner_support','social_worker') then sm.role_key
      else 'crc_custodian'
    end
  from public.school_memberships sm
  left join public.user_profiles up on up.user_id=sm.user_id
  left join public.staff_members staff on staff.id=sm.staff_member_id
  left join auth.users au on au.id=sm.user_id
  where sm.school_id=p_school_id
    and sm.active_from<=(now() at time zone 'Africa/Windhoek')::date
    and (sm.active_to is null or sm.active_to>=(now() at time zone 'Africa/Windhoek')::date)
    and app_private.is_crc_custodian(sm.user_id,p_school_id)
  order by sm.user_id,sm.active_from desc;
end;
$$;

create or replace function public.list_crc_custody_destination_schools()
returns table(school_id uuid,school_name text,school_town text)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_origin_school_id uuid;
  v_tenant_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select sm.school_id,sm.tenant_id into v_origin_school_id,v_tenant_id
  from public.school_memberships sm
  where sm.user_id=auth.uid()
    and sm.active_from<=(now() at time zone 'Africa/Windhoek')::date
    and (sm.active_to is null or sm.active_to>=(now() at time zone 'Africa/Windhoek')::date)
  order by sm.active_from desc,sm.id
  limit 1;

  if v_origin_school_id is null or not app_private.is_crc_custodian(auth.uid(),v_origin_school_id) then
    raise exception 'Permission denied: not an authorized custodian';
  end if;

  return query
  select s.id,s.name,s.town
  from public.schools s
  where s.tenant_id=v_tenant_id
    and s.status='active'
    and s.id<>v_origin_school_id
  order by s.name,s.id;
end;
$$;

create or replace function public.get_my_crc_custody_records()
returns table(
  custody_id uuid,custody_status text,learner_name text,admission_number text,
  origin_school_name text,receiving_school_name text,receiving_user_name text,
  custody_note text,prepared_at timestamptz,updated_at timestamptz,
  outgoing boolean,incoming boolean
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  return query
  select
    r.id,r.custody_status,concat_ws(' ',l.first_names,l.surname),e.admission_number,
    os.name,rs.name,coalesce(rup.display_name,split_part(rau.email,'@',1)),
    r.custody_note,r.created_at,r.updated_at,
    app_private.is_crc_custodian(auth.uid(),r.school_id),
    (r.receiving_user_id=auth.uid() and app_private.is_crc_custodian(auth.uid(),r.receiving_school_id))
  from public.crc_custody_records r
  join public.learners l on l.id=r.learner_id
  left join public.enrolments e on e.id=r.enrolment_id
  join public.schools os on os.id=r.school_id
  join public.schools rs on rs.id=r.receiving_school_id
  left join auth.users rau on rau.id=r.receiving_user_id
  left join public.user_profiles rup on rup.user_id=r.receiving_user_id
  where app_private.can_access_crc_custody_record(r.id)
  order by r.created_at desc;
end;
$$;

revoke all on function public.prepare_crc_custody(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.prepare_crc_custody(uuid,uuid,uuid,text) to authenticated;
revoke all on function public.search_crc_custody_receivers(uuid) from public,anon;
grant execute on function public.search_crc_custody_receivers(uuid) to authenticated;
revoke all on function public.list_crc_custody_destination_schools() from public,anon;
grant execute on function public.list_crc_custody_destination_schools() to authenticated;
revoke all on function public.get_my_crc_custody_records() from public,anon;
grant execute on function public.get_my_crc_custody_records() to authenticated;

-- Preserve #688 administration semantics: custody management may be delegated,
-- while confidential-support visibility remains limited to explicit support roles.
create or replace function public.get_crc_administration_summary(p_school_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_leadership boolean;
  v_custodian boolean;
  v_support boolean;
  v_year integer := extract(year from (now() at time zone 'Africa/Windhoek'))::integer;
  v_total integer;
  v_contributed integer;
  v_outgoing integer;
  v_incoming integer;
  v_requests integer;
  v_awaiting_ack integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_leadership:=app_private.is_school_leadership(auth.uid(),p_school_id);
  v_custodian:=app_private.is_crc_custodian(auth.uid(),p_school_id);
  v_support:=app_private.is_support_role_member(auth.uid(),p_school_id);
  if not (v_leadership or v_custodian) then raise exception 'Permission denied'; end if;

  select coalesce(max(ay.year),v_year) into v_year
  from public.academic_years ay
  where ay.school_id=p_school_id
    and ay.starts_on<=(now() at time zone 'Africa/Windhoek')::date
    and ay.ends_on>=(now() at time zone 'Africa/Windhoek')::date;

  select count(*)::integer into v_total
  from public.enrolments e
  where e.school_id=p_school_id and e.academic_year=v_year and e.status='current'
    and e.enrolled_from<=(now() at time zone 'Africa/Windhoek')::date
    and (e.enrolled_to is null or e.enrolled_to>=(now() at time zone 'Africa/Windhoek')::date);

  select count(distinct x.learner_id)::integer into v_contributed
  from(
    select d.learner_id from public.learner_development_observations d
    where d.school_id=p_school_id and d.academic_year=v_year
    union
    select n.learner_id
    from public.learner_cumulative_notes n
    join public.enrolments e on e.id=n.enrolment_id
    where n.school_id=p_school_id and n.sensitivity='routine' and e.academic_year=v_year
  ) x;

  select
    count(*) filter(where r.school_id=p_school_id)::integer,
    count(*) filter(where r.receiving_school_id=p_school_id)::integer,
    count(*) filter(where r.receiving_school_id=p_school_id and r.custody_status in ('dispatched','received'))::integer
  into v_outgoing,v_incoming,v_awaiting_ack
  from public.crc_custody_records r
  where (r.school_id=p_school_id or r.receiving_school_id=p_school_id)
    and app_private.can_access_crc_custody_record(r.id);

  select count(*)::integer into v_requests
  from public.crc_custody_requests q
  where (q.receiving_school_id=p_school_id or q.origin_school_id=p_school_id)
    and q.status in ('requested','accepted','escalated');

  return jsonb_build_object(
    'academic_year',v_year,
    'current_learners',coalesce(v_total,0),
    'learners_with_routine_crc_activity',coalesce(v_contributed,0),
    'learners_without_routine_crc_activity',greatest(coalesce(v_total,0)-coalesce(v_contributed,0),0),
    'outgoing_transfers',coalesce(v_outgoing,0),
    'incoming_transfers',coalesce(v_incoming,0),
    'requests_awaiting_action',coalesce(v_requests,0),
    'incoming_awaiting_acknowledgement',coalesce(v_awaiting_ack,0),
    'can_manage_custody',v_custodian,
    'can_view_confidential_support',v_support,
    'leadership_oversight',v_leadership
  );
end;
$$;

create or replace function public.list_crc_class_completeness(p_school_id uuid)
returns table(
  register_class_id uuid,register_class_label text,grade_label text,
  learner_count integer,contributed_count integer,follow_up_count integer
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_year integer := extract(year from (now() at time zone 'Africa/Windhoek'))::integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    app_private.is_school_leadership(auth.uid(),p_school_id)
    or app_private.is_crc_custodian(auth.uid(),p_school_id)
  ) then raise exception 'Permission denied'; end if;

  select coalesce(max(ay.year),v_year) into v_year
  from public.academic_years ay
  where ay.school_id=p_school_id
    and ay.starts_on<=(now() at time zone 'Africa/Windhoek')::date
    and ay.ends_on>=(now() at time zone 'Africa/Windhoek')::date;

  return query
  with current_enrolments as(
    select e.id,e.learner_id,e.register_class_id
    from public.enrolments e
    where e.school_id=p_school_id and e.academic_year=v_year and e.status='current'
      and e.enrolled_from<=(now() at time zone 'Africa/Windhoek')::date
      and (e.enrolled_to is null or e.enrolled_to>=(now() at time zone 'Africa/Windhoek')::date)
  ),
  contributed as(
    select distinct d.learner_id
    from public.learner_development_observations d
    where d.school_id=p_school_id and d.academic_year=v_year
    union
    select distinct n.learner_id
    from public.learner_cumulative_notes n
    join public.enrolments e on e.id=n.enrolment_id
    where n.school_id=p_school_id and n.sensitivity='routine' and e.academic_year=v_year
  )
  select rc.id,rc.display_name,g.display_name,
    count(ce.id)::integer,
    count(ce.id) filter(where c.learner_id is not null)::integer,
    count(ce.id) filter(where c.learner_id is null)::integer
  from public.register_classes rc
  join public.grades g on g.id=rc.grade_id
  left join current_enrolments ce on ce.register_class_id=rc.id
  left join contributed c on c.learner_id=ce.learner_id
  where rc.school_id=p_school_id and rc.academic_year=v_year
  group by rc.id,rc.display_name,g.display_name
  order by g.display_name,rc.display_name,rc.id;
end;
$$;

revoke all on function public.get_crc_administration_summary(uuid) from public,anon;
grant execute on function public.get_crc_administration_summary(uuid) to authenticated;
revoke all on function public.list_crc_class_completeness(uuid) from public,anon;
grant execute on function public.list_crc_class_completeness(uuid) to authenticated;

comment on function app_private.is_crc_custodian(uuid,uuid,date) is
'CRC custody-workflow authority: explicit learner-support role or effective crc_custodian school duty with current staff placement. Does not grant confidential learner-support access.';
comment on table public.crc_custody_requests is
'Governed requests for missing CRC custody from a known ScolaPro origin school or an external/non-ScolaPro school.';
comment on table public.crc_custody_request_escalations is
'Non-confidential escalation metadata for overdue CRC custody requests. Network officers access only effective circuit/region referrals through a limited RPC.';


-- Delegated CRC custodians use the same bounded learner search as explicit
-- support-role custodians; this does not expose confidential support content.
create or replace function public.search_crc_custody_learners(p_query text default '')
returns table(learner_id uuid,learner_name text,admission_number text,grade_label text)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_query text := '%'||lower(btrim(coalesce(p_query,'')))||'%';
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  return query
  select
    l.id,
    concat_ws(' ',l.first_names,l.surname),
    e.admission_number,
    g.display_name
  from public.learners l
  join public.enrolments e
    on e.learner_id=l.id
   and e.status='current'
   and e.enrolled_from<=(now() at time zone 'Africa/Windhoek')::date
   and (e.enrolled_to is null or e.enrolled_to>=(now() at time zone 'Africa/Windhoek')::date)
  left join public.grades g on g.id=e.grade_id
  where app_private.is_crc_custodian(auth.uid(),e.school_id)
    and (
      v_query='%%'
      or lower(concat_ws(' ',l.first_names,l.surname)) like v_query
      or lower(coalesce(l.preferred_name,'')) like v_query
      or lower(coalesce(e.admission_number,'')) like v_query
    )
  order by l.surname,l.first_names
  limit 25;
end;
$$;

revoke all on function public.search_crc_custody_learners(text) from public,anon;
grant execute on function public.search_crc_custody_learners(text) to authenticated;

create or replace function public.get_crc_custody_request_policy(p_school_id uuid)
returns smallint
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_days smallint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    app_private.is_crc_custodian(auth.uid(),p_school_id)
    or app_private.is_school_leadership(auth.uid(),p_school_id)
  ) then raise exception 'Permission denied'; end if;

  select response_days into v_days
  from public.crc_custody_request_policies
  where school_id=p_school_id;

  return coalesce(v_days,7);
end;
$$;

revoke all on function public.get_crc_custody_request_policy(uuid) from public,anon;
grant execute on function public.get_crc_custody_request_policy(uuid) to authenticated;

create or replace function public.acknowledge_crc_request_escalation(p_escalation_id uuid)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_escalation public.crc_custody_request_escalations%rowtype;
  v_request public.crc_custody_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_escalation
  from public.crc_custody_request_escalations
  where id=p_escalation_id
  for update;

  if v_escalation.id is null then raise exception 'CRC escalation not found'; end if;

  if not exists(
    select 1
    from public.education_network_memberships m
    where m.user_id=auth.uid()
      and m.active_from<=(now() at time zone 'Africa/Windhoek')::date
      and (m.active_to is null or m.active_to>=(now() at time zone 'Africa/Windhoek')::date)
      and (
        (v_escalation.scope_kind='circuit' and m.role_key='circuit_officer' and m.circuit_id=v_escalation.circuit_id)
        or
        (v_escalation.scope_kind='region' and m.role_key='regional_officer' and m.region_id=v_escalation.region_id)
      )
  ) then raise exception 'Permission denied'; end if;

  update public.crc_custody_request_escalations
  set status='acknowledged',
      acknowledged_by_user_id=auth.uid(),
      acknowledged_at=now()
  where id=v_escalation.id
    and status='open';

  select * into v_request
  from public.crc_custody_requests
  where id=v_escalation.request_id;

  if found then
    insert into public.audit_events(
      tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
    )
    values(
      v_request.tenant_id,
      v_request.receiving_school_id,
      auth.uid(),
      'crc_custody.escalation_acknowledged',
      'crc_custody_request',
      v_request.id,
      jsonb_build_object(
        'escalation_id',v_escalation.id,
        'scope_kind',v_escalation.scope_kind
      )
    );
  end if;

  return true;
end;
$$;

revoke all on function public.acknowledge_crc_request_escalation(uuid) from public,anon;
grant execute on function public.acknowledge_crc_request_escalation(uuid) to authenticated;


-- The canonical close helper previously selected the audit school via the
-- confidential-support predicate. Delegated CRC custodians are workflow actors,
-- not support actors, so choose the audit school from CRC custody authority.
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
  set custody_status='closed',
      closed_by_user_id=auth.uid(),
      closed_at=now(),
      updated_at=now()
  where id=p_custody_id
  returning * into v_record;

  if not found then raise exception 'CRC custody record not found'; end if;

  v_audit_school := case
    when v_record.receiving_user_id=auth.uid()
      and app_private.is_crc_custodian(auth.uid(),v_record.receiving_school_id)
      then v_record.receiving_school_id
    else v_record.school_id
  end;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  )
  values(
    v_record.tenant_id,
    v_audit_school,
    auth.uid(),
    'crc_custody.closed',
    'crc_custody_record',
    v_record.id,
    jsonb_build_object(
      'origin_school_id',v_record.school_id,
      'receiving_school_id',v_record.receiving_school_id
    )
  );
end;
$$;

revoke all on function public.close_crc_custody(uuid) from public,anon;
grant execute on function public.close_crc_custody(uuid) to authenticated;
