-- Confidential Cumulative Record Card (CRC) custody.
--
-- A learner's CRC contains ordinary longitudinal history AND confidential material
-- (safeguarding, social-work casework, sensitive family circumstances, protected
-- notes/attachments, restricted correspondence). Transferring the CRC between
-- schools is governed custody, not casual file sharing:
--
--     Prepare -> Authorize -> Secure dispatch -> Recipient receives
--     -> Recipient acknowledges -> Custody transferred/closed
--
-- Design rules:
-- * Mutations are RPC-only. Authenticated clients get no direct INSERT/UPDATE/DELETE
--   on custody records or their document mapping.
-- * Dispatch is school-to-school and recipient-scoped: the destination school and an
--   explicit receiving custodian with an active support role there are required.
-- * Every transition binds its actor to auth.uid() at a physical trigger boundary so
--   trusted/RLS-bypassing paths cannot forge provenance.
-- * Sensitive attachments live in a private bucket with no authenticated storage
--   policies; downloads are authorized against the custody record before a short-lived
--   signed URL is minted by the application.
-- * Platform administration has no automatic visibility: platform_admin is not a
--   support role and is deliberately absent from every custody helper.

create table if not exists public.crc_custody_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  enrolment_id uuid references public.enrolments(id) on delete restrict,
  custody_status text not null default 'prepared'
    check (custody_status in ('prepared','authorized','dispatched','received','acknowledged','closed')),
  prepared_by_user_id uuid not null references auth.users(id) on delete restrict,
  authorized_by_user_id uuid references auth.users(id) on delete set null,
  authorized_at timestamptz,
  dispatched_by_user_id uuid references auth.users(id) on delete set null,
  dispatched_at timestamptz,
  receiving_school_id uuid not null references public.schools(id) on delete restrict,
  receiving_user_id uuid not null references auth.users(id) on delete restrict,
  received_by_user_id uuid references auth.users(id) on delete set null,
  received_at timestamptz,
  acknowledged_by_user_id uuid references auth.users(id) on delete set null,
  acknowledged_at timestamptz,
  closed_by_user_id uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  custody_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (receiving_school_id <> school_id),
  check (authorized_at is null or authorized_at >= created_at),
  check (dispatched_at is null or dispatched_at >= coalesce(authorized_at, created_at)),
  check (received_at is null or received_at >= coalesce(dispatched_at, authorized_at, created_at)),
  check (acknowledged_at is null or acknowledged_at >= coalesce(received_at, dispatched_at, authorized_at, created_at)),
  check (closed_at is null or closed_at >= coalesce(acknowledged_at, received_at, dispatched_at, authorized_at, created_at))
);

create table if not exists public.crc_custody_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  custody_record_id uuid not null references public.crc_custody_records(id) on delete restrict,
  storage_path text not null,
  file_name text,
  mime_type text,
  uploaded_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists crc_custody_records_origin_idx
  on public.crc_custody_records (school_id, custody_status, created_at desc);
create index if not exists crc_custody_records_receiving_idx
  on public.crc_custody_records (receiving_school_id, receiving_user_id, custody_status);
create index if not exists crc_custody_records_learner_idx
  on public.crc_custody_records (learner_id, created_at desc);
create index if not exists crc_custody_documents_record_idx
  on public.crc_custody_documents (custody_record_id, created_at desc);

alter table public.crc_custody_records enable row level security;
alter table public.crc_custody_documents enable row level security;

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------

create or replace function app_private.is_support_role_member(p_user_id uuid, p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists(
    select 1
    from public.school_memberships sm
    where sm.school_id = p_school_id
      and sm.user_id = p_user_id
      and sm.role_key in ('counsellor','learner_support','social_worker')
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
  );
$$;

revoke all on function app_private.is_support_role_member(uuid,uuid) from public, anon, authenticated;

create or replace function app_private.is_school_leadership(p_user_id uuid, p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists(
    select 1
    from public.school_memberships sm
    where sm.school_id = p_school_id
      and sm.user_id = p_user_id
      and sm.role_key in ('school_admin','principal','deputy_principal')
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
  );
$$;

revoke all on function app_private.is_school_leadership(uuid,uuid) from public, anon, authenticated;

-- Need-to-know custody visibility:
--   * explicit support role at the originating school (custodian);
--   * leadership oversight at the originating school;
--   * the explicit receiving custodian (support role at the receiving school);
--   * leadership oversight at the receiving school.
-- Platform administration and generic school membership are deliberately absent.
create or replace function app_private.can_access_crc_custody_record(p_custody_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists(
    select 1
    from public.crc_custody_records r
    where r.id = p_custody_id
      and (
        app_private.is_support_role_member((select auth.uid()), r.school_id)
        or app_private.is_school_leadership((select auth.uid()), r.school_id)
        or (
          r.receiving_user_id = (select auth.uid())
          and app_private.is_support_role_member((select auth.uid()), r.receiving_school_id)
        )
        or app_private.is_school_leadership((select auth.uid()), r.receiving_school_id)
      )
  );
$$;

revoke all on function app_private.can_access_crc_custody_record(uuid) from public, anon, authenticated;

-- Outgoing custodian authority: explicit support role at the originating school.
create or replace function app_private.can_manage_crc_custody_outgoing(p_custody_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists(
    select 1
    from public.crc_custody_records r
    where r.id = p_custody_id
      and app_private.is_support_role_member((select auth.uid()), r.school_id)
  );
$$;

revoke all on function app_private.can_manage_crc_custody_outgoing(uuid) from public, anon, authenticated;

-- Receiving-custodian authority: the explicit recipient with a support role at the
-- receiving school.
create or replace function app_private.can_manage_crc_custody_incoming(p_custody_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists(
    select 1
    from public.crc_custody_records r
    where r.id = p_custody_id
      and r.receiving_user_id = (select auth.uid())
      and app_private.is_support_role_member((select auth.uid()), r.receiving_school_id)
  );
$$;

revoke all on function app_private.can_manage_crc_custody_incoming(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

drop policy if exists "need to know users read custody records" on public.crc_custody_records;
create policy "need to know users read custody records"
on public.crc_custody_records for select to authenticated
using (app_private.can_access_crc_custody_record(id));

drop policy if exists "need to know users read custody documents" on public.crc_custody_documents;
create policy "need to know users read custody documents"
on public.crc_custody_documents for select to authenticated
using (app_private.can_access_crc_custody_record(custody_record_id));

-- Custody is mutated exclusively through governed RPCs so every transition runs
-- through the same authorized lifecycle and actor binding.
revoke insert, update, delete on public.crc_custody_records from authenticated;
revoke insert, update, delete on public.crc_custody_documents from authenticated;

-- ---------------------------------------------------------------------------
-- Physical lifecycle + provenance guard (defense in depth for trusted paths)
-- ---------------------------------------------------------------------------

create or replace function app_private.enforce_crc_custody_lifecycle_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if new.custody_status <> 'prepared' then
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
    if not app_private.is_support_role_member(new.prepared_by_user_id, new.school_id) then
      raise exception 'CRC custody preparer is not an authorized custodian';
    end if;
    if not app_private.is_support_role_member(new.receiving_user_id, new.receiving_school_id) then
      raise exception 'CRC custody recipient is not an authorized receiving custodian';
    end if;
    if new.receiving_school_id = new.school_id then
      raise exception 'CRC custody must be dispatched to a different school';
    end if;
    return new;
  end if;

  -- UPDATE: provenance immutability
  if new.tenant_id is distinct from old.tenant_id
     or new.school_id is distinct from old.school_id
     or new.learner_id is distinct from old.learner_id
     or new.enrolment_id is distinct from old.enrolment_id
     or new.prepared_by_user_id is distinct from old.prepared_by_user_id
     or new.receiving_school_id is distinct from old.receiving_school_id
     or new.receiving_user_id is distinct from old.receiving_user_id then
    raise exception 'CRC custody provenance is immutable';
  end if;

  if new.custody_status = old.custody_status then
    return new;
  end if;

  -- Ordering rules per transition.
  case new.custody_status
    when 'authorized' then
      if old.custody_status <> 'prepared' then
        raise exception 'CRC custody must be authorized from prepared';
      end if;
      if new.authorized_by_user_id is null or new.authorized_at is null then
        raise exception 'CRC custody authorization requires provenance';
      end if;
      if v_actor is not null and new.authorized_by_user_id is distinct from v_actor then
        raise exception 'CRC custody authorizer must match authenticated actor';
      end if;
      if not app_private.is_school_leadership(new.authorized_by_user_id, new.school_id) then
        raise exception 'CRC custody authorizer is not school leadership';
      end if;
    when 'dispatched' then
      if old.custody_status <> 'authorized' then
        raise exception 'CRC custody must be dispatched from authorized';
      end if;
      if new.dispatched_by_user_id is null or new.dispatched_at is null then
        raise exception 'CRC custody dispatch requires provenance';
      end if;
      if v_actor is not null and new.dispatched_by_user_id is distinct from v_actor then
        raise exception 'CRC custody dispatcher must match authenticated actor';
      end if;
      if not app_private.is_support_role_member(new.dispatched_by_user_id, new.school_id) then
        raise exception 'CRC custody dispatcher is not an authorized custodian';
      end if;
    when 'received' then
      if old.custody_status <> 'dispatched' then
        raise exception 'CRC custody must be received from dispatched';
      end if;
      if new.received_by_user_id is null or new.received_at is null then
        raise exception 'CRC custody receipt requires provenance';
      end if;
      if v_actor is not null and new.received_by_user_id is distinct from v_actor then
        raise exception 'CRC custody receiver must match authenticated actor';
      end if;
      if not app_private.is_support_role_member(new.received_by_user_id, new.receiving_school_id) then
        raise exception 'CRC custody receiver is not the authorized receiving custodian';
      end if;
      if new.received_by_user_id <> new.receiving_user_id then
        raise exception 'CRC custody must be received by the authorized receiving custodian';
      end if;
    when 'acknowledged' then
      if old.custody_status <> 'received' then
        raise exception 'CRC custody must be acknowledged from received';
      end if;
      if new.acknowledged_by_user_id is null or new.acknowledged_at is null then
        raise exception 'CRC custody acknowledgement requires provenance';
      end if;
      if v_actor is not null and new.acknowledged_by_user_id is distinct from v_actor then
        raise exception 'CRC custody acknowledger must match authenticated actor';
      end if;
      if new.acknowledged_by_user_id <> new.receiving_user_id
         or not app_private.is_support_role_member(new.acknowledged_by_user_id, new.receiving_school_id) then
        raise exception 'CRC custody must be acknowledged by the authorized receiving custodian';
      end if;
    when 'closed' then
      if old.custody_status not in ('received','acknowledged') then
        raise exception 'CRC custody must be closed from received or acknowledged';
      end if;
      if new.closed_by_user_id is null or new.closed_at is null then
        raise exception 'CRC custody closure requires provenance';
      end if;
      if v_actor is not null and new.closed_by_user_id is distinct from v_actor then
        raise exception 'CRC custody closer must match authenticated actor';
      end if;
      if not (
        app_private.is_support_role_member(new.closed_by_user_id, new.receiving_school_id)
        or app_private.is_support_role_member(new.closed_by_user_id, new.school_id)
      ) then
        raise exception 'CRC custody closer is not the receiving custodian or originating custodian';
      end if;
    else
      raise exception 'Unknown CRC custody status';
  end case;

  return new;
end;
$$;

revoke all on function app_private.enforce_crc_custody_lifecycle_integrity()
  from public, anon, authenticated;

drop trigger if exists crc_custody_lifecycle_integrity_trg on public.crc_custody_records;
create trigger crc_custody_lifecycle_integrity_trg
before insert or update of custody_status, prepared_by_user_id, authorized_by_user_id,
  authorized_at, dispatched_by_user_id, dispatched_at, received_by_user_id, received_at,
  acknowledged_by_user_id, acknowledged_at, closed_by_user_id, closed_at
on public.crc_custody_records
for each row execute function app_private.enforce_crc_custody_lifecycle_integrity();

-- ---------------------------------------------------------------------------
-- Governed custody RPCs
-- ---------------------------------------------------------------------------

create or replace function public.prepare_crc_custody(
  p_learner_id uuid,
  p_receiving_school_id uuid,
  p_receiving_user_id uuid,
  p_custody_note text default null
)
returns table(custody_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
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
    and e.enrolled_from <= current_date
    and (e.enrolled_to is null or e.enrolled_to >= current_date)
  order by e.enrolled_from desc
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

  if not exists(
    select 1 from public.schools s
    where s.id = p_receiving_school_id and s.status = 'active'
  ) then
    raise exception 'Receiving school not found or inactive';
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

revoke all on function public.prepare_crc_custody(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.prepare_crc_custody(uuid,uuid,uuid,text) to authenticated;

create or replace function public.authorize_crc_custody(p_custody_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not app_private.is_school_leadership(auth.uid(), (select school_id from public.crc_custody_records where id = p_custody_id)) then
    raise exception 'Permission denied: only school leadership may authorize CRC custody';
  end if;

  update public.crc_custody_records
  set custody_status = 'authorized', authorized_by_user_id = auth.uid(), authorized_at = now()
  where id = p_custody_id;

  if not found then
    raise exception 'CRC custody record not found';
  end if;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id)
  select tenant_id, school_id, auth.uid(), 'crc_custody.authorized', 'crc_custody_record', id
  from public.crc_custody_records
  where id = p_custody_id;
end;
$$;

revoke all on function public.authorize_crc_custody(uuid) from public, anon;
grant execute on function public.authorize_crc_custody(uuid) to authenticated;

create or replace function public.dispatch_crc_custody(p_custody_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not app_private.can_manage_crc_custody_outgoing(p_custody_id) then
    raise exception 'Permission denied: only the originating custodian may dispatch CRC custody';
  end if;

  update public.crc_custody_records
  set custody_status = 'dispatched', dispatched_by_user_id = auth.uid(), dispatched_at = now()
  where id = p_custody_id;

  if not found then
    raise exception 'CRC custody record not found';
  end if;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id)
  select tenant_id, school_id, auth.uid(), 'crc_custody.dispatched', 'crc_custody_record', id
  from public.crc_custody_records
  where id = p_custody_id;
end;
$$;

revoke all on function public.dispatch_crc_custody(uuid) from public, anon;
grant execute on function public.dispatch_crc_custody(uuid) to authenticated;

create or replace function public.receive_crc_custody(p_custody_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not app_private.can_manage_crc_custody_incoming(p_custody_id) then
    raise exception 'Permission denied: only the authorized receiving custodian may receive CRC custody';
  end if;

  update public.crc_custody_records
  set custody_status = 'received', received_by_user_id = auth.uid(), received_at = now()
  where id = p_custody_id;

  if not found then
    raise exception 'CRC custody record not found';
  end if;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id)
  select tenant_id, school_id, auth.uid(), 'crc_custody.received', 'crc_custody_record', id
  from public.crc_custody_records
  where id = p_custody_id;
end;
$$;

revoke all on function public.receive_crc_custody(uuid) from public, anon;
grant execute on function public.receive_crc_custody(uuid) to authenticated;

create or replace function public.acknowledge_crc_custody(p_custody_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not app_private.can_manage_crc_custody_incoming(p_custody_id) then
    raise exception 'Permission denied: only the authorized receiving custodian may acknowledge CRC custody';
  end if;

  update public.crc_custody_records
  set custody_status = 'acknowledged', acknowledged_by_user_id = auth.uid(), acknowledged_at = now()
  where id = p_custody_id;

  if not found then
    raise exception 'CRC custody record not found';
  end if;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id)
  select tenant_id, school_id, auth.uid(), 'crc_custody.acknowledged', 'crc_custody_record', id
  from public.crc_custody_records
  where id = p_custody_id;
end;
$$;

revoke all on function public.acknowledge_crc_custody(uuid) from public, anon;
grant execute on function public.acknowledge_crc_custody(uuid) to authenticated;

create or replace function public.close_crc_custody(p_custody_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not (
    app_private.can_manage_crc_custody_incoming(p_custody_id)
    or app_private.can_manage_crc_custody_outgoing(p_custody_id)
  ) then
    raise exception 'Permission denied: only the receiving or originating custodian may close CRC custody';
  end if;

  update public.crc_custody_records
  set custody_status = 'closed', closed_by_user_id = auth.uid(), closed_at = now()
  where id = p_custody_id;

  if not found then
    raise exception 'CRC custody record not found';
  end if;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id)
  select tenant_id, school_id, auth.uid(), 'crc_custody.closed', 'crc_custody_record', id
  from public.crc_custody_records
  where id = p_custody_id;
end;
$$;

revoke all on function public.close_crc_custody(uuid) from public, anon;
grant execute on function public.close_crc_custody(uuid) to authenticated;

-- Learners the caller may prepare custody for: currently enrolled at a school where
-- the caller holds an explicit support role.
create or replace function public.search_crc_custody_learners(p_query text default '')
returns table(learner_id uuid, learner_name text, admission_number text, grade_label text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_query text := '%' || lower(btrim(coalesce(p_query, ''))) || '%';
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    l.id,
    concat_ws(' ', l.first_names, l.surname),
    e.admission_number,
    g.display_name
  from public.learners l
  join public.enrolments e
    on e.learner_id = l.id
    and e.status = 'current'
    and e.enrolled_from <= current_date
    and (e.enrolled_to is null or e.enrolled_to >= current_date)
  left join public.grades g on g.id = e.grade_id
  where app_private.is_support_role_member(auth.uid(), e.school_id)
    and (
      v_query = '%%'
      or lower(concat_ws(' ', l.first_names, l.surname)) like v_query
      or lower(coalesce(l.preferred_name, '')) like v_query
      or lower(coalesce(e.admission_number, '')) like v_query
    )
  order by l.surname, l.first_names
  limit 25;
end;
$$;

revoke all on function public.search_crc_custody_learners(text) from public, anon;
grant execute on function public.search_crc_custody_learners(text) to authenticated;

-- Authorized receiving custodians at a destination school.
create or replace function public.search_crc_custody_receivers(p_school_id uuid)
returns table(user_id uuid, display_name text, role_key text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  return query
  select distinct on (sm.user_id)
    sm.user_id,
    coalesce(up.display_name, concat_ws(' ', smf.first_name, smf.last_name), split_part(au.email, '@', 1)),
    sm.role_key
  from public.school_memberships sm
  left join public.user_profiles up on up.user_id = sm.user_id
  left join public.staff_members smf on smf.id = sm.staff_member_id
  left join auth.users au on au.id = sm.user_id
  where sm.school_id = p_school_id
    and sm.role_key in ('counsellor','learner_support','social_worker')
    and sm.active_from <= current_date
    and (sm.active_to is null or sm.active_to >= current_date)
  order by sm.user_id, sm.active_from desc;
end;
$$;

revoke all on function public.search_crc_custody_receivers(uuid) from public, anon;
grant execute on function public.search_crc_custody_receivers(uuid) to authenticated;

-- Destination schools for custody dispatch: minimal school-name metadata available
-- only to users holding an explicit support role, and never the caller's own school.
create or replace function public.list_crc_custody_destination_schools()
returns table(school_id uuid, school_name text, school_town text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists(
    select 1
    from public.school_memberships sm
    where sm.user_id = auth.uid()
      and sm.role_key in ('counsellor','learner_support','social_worker')
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
  ) then
    raise exception 'Permission denied: not an authorized custodian';
  end if;

  return query
  select s.id, s.name, s.town
  from public.schools s
  where s.status = 'active'
    and not exists(
      select 1
      from public.school_memberships own
      where own.school_id = s.id
        and own.user_id = auth.uid()
        and own.active_from <= current_date
        and (own.active_to is null or own.active_to >= current_date)
    )
  order by s.name;
end;
$$;

revoke all on function public.list_crc_custody_destination_schools() from public, anon;
grant execute on function public.list_crc_custody_destination_schools() to authenticated;

-- Custody records the caller may see (need-to-know scope), enriched for the UI.
create or replace function public.get_my_crc_custody_records()
returns table(
  custody_id uuid,
  custody_status text,
  learner_name text,
  admission_number text,
  origin_school_name text,
  receiving_school_name text,
  receiving_user_name text,
  custody_note text,
  prepared_at timestamptz,
  updated_at timestamptz,
  outgoing boolean,
  incoming boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    r.id,
    r.custody_status,
    concat_ws(' ', l.first_names, l.surname),
    e.admission_number,
    os.name,
    rs.name,
    coalesce(rup.display_name, split_part(rau.email, '@', 1)),
    r.custody_note,
    r.created_at,
    r.updated_at,
    app_private.is_support_role_member(auth.uid(), r.school_id),
    (r.receiving_user_id = auth.uid() and app_private.is_support_role_member(auth.uid(), r.receiving_school_id))
  from public.crc_custody_records r
  join public.learners l on l.id = r.learner_id
  left join public.enrolments e on e.id = r.enrolment_id
  join public.schools os on os.id = r.school_id
  join public.schools rs on rs.id = r.receiving_school_id
  left join auth.users rau on rau.id = r.receiving_user_id
  left join public.user_profiles rup on rup.user_id = r.receiving_user_id
  where app_private.can_access_crc_custody_record(r.id)
  order by r.created_at desc;
end;
$$;

revoke all on function public.get_my_crc_custody_records() from public, anon;
grant execute on function public.get_my_crc_custody_records() to authenticated;

-- Register one uploaded private attachment against a custody record the caller may
-- manage as outgoing custodian.
create or replace function public.register_crc_custody_document(
  p_custody_id uuid,
  p_storage_path text,
  p_file_name text default null,
  p_mime_type text default null
)
returns table(document_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
declare
  v_record public.crc_custody_records%rowtype;
  v_document_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_record
  from public.crc_custody_records
  where id = p_custody_id;
  if v_record.id is null then
    raise exception 'CRC custody record not found';
  end if;

  if not app_private.can_manage_crc_custody_outgoing(p_custody_id) then
    raise exception 'Permission denied: only the originating custodian may attach documents';
  end if;

  if p_storage_path is not null and p_storage_path <> '' then
    if p_storage_path not like p_custody_id::text || '/docs/%' then
      raise exception 'Custody document path does not belong to this record';
    end if;
    if not exists(
      select 1
      from storage.objects o
      where o.bucket_id = 'crc-confidential-documents'
        and o.name = p_storage_path
    ) then
      raise exception 'Uploaded custody document object was not found';
    end if;
  else
    raise exception 'Custody document storage path is required';
  end if;

  insert into public.crc_custody_documents (
    tenant_id, custody_record_id, storage_path, file_name, mime_type, uploaded_by_user_id
  )
  values (
    v_record.tenant_id, p_custody_id, p_storage_path,
    nullif(btrim(coalesce(p_file_name, '')), ''),
    nullif(btrim(coalesce(p_mime_type, '')), ''),
    auth.uid()
  )
  returning id into v_document_id;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (
    v_record.tenant_id, v_record.school_id, auth.uid(),
    'crc_custody.document_registered', 'crc_custody_document', v_document_id,
    jsonb_build_object('custody_record_id', p_custody_id, 'storage_path', p_storage_path)
  );

  return query select v_document_id;
end;
$$;

revoke all on function public.register_crc_custody_document(uuid,text,text,text) from public, anon;
grant execute on function public.register_crc_custody_document(uuid,text,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Private confidential attachment storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'crc-confidential-documents',
  'crc-confidential-documents',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Custody documents select" on storage.objects;
create policy "Custody documents select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'crc-confidential-documents'
  and (storage.foldername(name))[2] = 'docs'
  and exists (
    select 1
    from public.crc_custody_records r
    where r.id::text = (storage.foldername(name))[1]
      and app_private.can_access_crc_custody_record(r.id)
  )
);

drop policy if exists "Custody documents insert" on storage.objects;
create policy "Custody documents insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'crc-confidential-documents'
  and lower(storage.extension(name)) in ('pdf','jpg','jpeg','png')
  and (storage.foldername(name))[2] = 'docs'
  and exists (
    select 1
    from public.crc_custody_records r
    where r.id::text = (storage.foldername(name))[1]
      and app_private.can_manage_crc_custody_outgoing(r.id)
  )
);

-- Intentionally no UPDATE or DELETE policy. Confidential custody attachments are
-- immutable and remain reproducible for the audit trail.
drop policy if exists "Custody documents update" on storage.objects;
drop policy if exists "Custody documents delete" on storage.objects;

comment on table public.crc_custody_records is
'Governed confidential CRC custody lifecycle: prepared, authorized, dispatched, received, acknowledged, closed. School-to-school dispatch requires an explicit authorized receiving custodian; mutations are RPC-only with actor-bound provenance.';
comment on table public.crc_custody_documents is
'Private confidential CRC custody attachments. Storage is private; access follows the need-to-know custody scope and downloads require authorized short-lived signed URLs.';