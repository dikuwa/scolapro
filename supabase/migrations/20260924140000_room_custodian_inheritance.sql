-- Issue #702: Room Inventory — default custodian inheritance + manual override.
--
-- MODEL RULE: inheritance/default only.
-- The register teacher is NOT merged into the room-inventory custodian
-- responsibility, and register-teacher data is NOT duplicated. The existing
-- public.room_inventory_custodians table remains the explicit (manual) custodian
-- of record that already exists today; the inherited default is DERIVED from the
-- canonical home-room relationship delivered by #701:
--
--   Register Class -> register_classes.home_room_id -> register_classes.register_teacher_staff_id
--
-- Effective custodian resolution for the current date:
--   1. manual    - a current room_inventory_custodians row (manual override wins)
--   2. inherited - exactly one eligible register teacher across the room's home-room classes
--   3. ambiguous - more than one DIFFERENT eligible register teacher (never silently chosen)
--   4. none      - no manual row and no eligible register teacher (reason reported)
--
-- Eligible register teacher = declared on a home-room register class in the same
-- tenant and school, still an active staff member, and still covering this school
-- for the current date through governed effective placement history.
--
-- AUTHORITY IS UNCHANGED: app_private.is_current_room_inventory_custodian() still
-- requires an explicit room_inventory_custodians row, so inheriting a default
-- grants no new room-inventory privilege. Converting a default into explicit
-- custodian authority stays a governed manager action through the existing
-- assign_room_inventory_custodian RPC.
--
-- HISTORY: effective-dated room_inventory_custodians rows and audit_events remain
-- the historical custodian record. Derived defaults never rewrite or duplicate it.

create or replace function app_private.resolve_room_custodian_core(p_room_id uuid)
returns table(
  source text,
  staff_member_id uuid,
  manual_staff_member_id uuid,
  manual_effective_from date,
  inherited_staff_member_id uuid,
  home_room_class_count integer,
  home_room_teacher_count integer,
  home_room_class_ids uuid[],
  reason text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_room public.school_rooms%rowtype;
  v_today date := current_date;
  v_manual_staff uuid;
  v_manual_from date;
  v_class_ids uuid[] := array[]::uuid[];
  v_teachers uuid[] := array[]::uuid[];
  v_declared_teachers integer := 0;
  v_out_source text;
  v_out_staff uuid;
  v_out_reason text;
begin

  select r.* into v_room
  from public.school_rooms r
  where r.id = p_room_id;

  if not found then
    raise exception 'Room not found';
  end if;

  -- 1. Explicit (manual) custodian of record takes precedence.
  select ric.staff_member_id, ric.effective_from
    into v_manual_staff, v_manual_from
  from public.room_inventory_custodians ric
  where ric.room_id = v_room.id
    and ric.school_id = v_room.school_id
    and ric.tenant_id = v_room.tenant_id
    and ric.effective_from <= v_today
    and (ric.effective_to is null or ric.effective_to >= v_today)
  order by ric.effective_from desc, ric.id
  limit 1;

  -- Register classes that name this room as their home room (same tenant/school).
  select coalesce(array_agg(x.id order by x.class_code, x.id), array[]::uuid[])
    into v_class_ids
  from (
    select rc.id, rc.class_code
    from public.register_classes rc
    where rc.home_room_id = v_room.id
      and rc.school_id = v_room.school_id
      and rc.tenant_id = v_room.tenant_id
  ) x;

  -- Eligible register teachers: active staff still covering this school today.
  select coalesce(array_agg(distinct rc.register_teacher_staff_id), array[]::uuid[])
    into v_teachers
  from public.register_classes rc
  join public.staff_members staff
    on staff.id = rc.register_teacher_staff_id
  where rc.home_room_id = v_room.id
    and rc.school_id = v_room.school_id
    and rc.tenant_id = v_room.tenant_id
    and rc.register_teacher_staff_id is not null
    and staff.status = 'active'
    and app_private.staff_member_covers_school_period(
      rc.register_teacher_staff_id,
      v_room.school_id,
      v_today,
      v_today
    );

  -- Declared (not necessarily eligible) teachers, so an unresolved state can
  -- distinguish "nobody assigned" from "assigned but no longer current".
  select count(distinct rc.register_teacher_staff_id)
    into v_declared_teachers
  from public.register_classes rc
  where rc.home_room_id = v_room.id
    and rc.school_id = v_room.school_id
    and rc.tenant_id = v_room.tenant_id
    and rc.register_teacher_staff_id is not null;

  if v_manual_staff is not null then
    v_out_source := 'manual';
    v_out_staff := v_manual_staff;
    v_out_reason := 'explicit_custodian_assignment';
  elsif coalesce(array_length(v_teachers, 1), 0) = 1 then
    v_out_source := 'inherited';
    v_out_staff := v_teachers[1];
    v_out_reason := 'home_room_register_teacher';
  elsif coalesce(array_length(v_teachers, 1), 0) > 1 then
    v_out_source := 'ambiguous';
    v_out_staff := null;
    v_out_reason := 'multiple_register_teachers';
  elsif coalesce(array_length(v_class_ids, 1), 0) = 0 then
    v_out_source := 'none';
    v_out_staff := null;
    v_out_reason := 'no_home_room_class';
  elsif v_declared_teachers = 0 then
    v_out_source := 'none';
    v_out_staff := null;
    v_out_reason := 'home_room_teacher_unassigned';
  else
    v_out_source := 'none';
    v_out_staff := null;
    v_out_reason := 'home_room_teacher_not_current';
  end if;

  return query
  select
    v_out_source,
    v_out_staff,
    v_manual_staff,
    v_manual_from,
    case when coalesce(array_length(v_teachers, 1), 0) = 1 then v_teachers[1] else null end,
    coalesce(array_length(v_class_ids, 1), 0),
    coalesce(array_length(v_teachers, 1), 0),
    v_class_ids,
    v_out_reason;
end;
$$;

revoke all on function app_private.resolve_room_custodian_core(uuid) from public, anon, authenticated;

comment on function app_private.resolve_room_custodian_core(uuid) is
  'Internal canonical room custodian resolution: manual override wins, then the derived home-room register-teacher default, otherwise an explicit ambiguous/unresolved reason. Never duplicates register-teacher data.';

create or replace function public.resolve_room_inventory_custodian(p_room_id uuid)
returns table(
  source text,
  staff_member_id uuid,
  manual_staff_member_id uuid,
  manual_effective_from date,
  inherited_staff_member_id uuid,
  home_room_class_count integer,
  home_room_teacher_count integer,
  home_room_class_ids uuid[],
  reason text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.school_rooms r
    where r.id = p_room_id
      and app_private.has_school_access(r.school_id)
  ) then
    raise exception 'Permission denied';
  end if;

  return query
  select * from app_private.resolve_room_custodian_core(p_room_id);
end;
$$;

revoke all on function public.resolve_room_inventory_custodian(uuid) from public, anon;
grant execute on function public.resolve_room_inventory_custodian(uuid) to authenticated;

create or replace function public.resolve_school_room_custodians(p_school_id uuid)
returns table(
  room_id uuid,
  source text,
  staff_member_id uuid,
  manual_staff_member_id uuid,
  manual_effective_from date,
  inherited_staff_member_id uuid,
  home_room_class_count integer,
  home_room_teacher_count integer,
  home_room_class_ids uuid[],
  reason text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not app_private.has_school_access(p_school_id) then
    raise exception 'Permission denied';
  end if;

  return query
  select r.id, c.*
  from public.school_rooms r
  cross join lateral app_private.resolve_room_custodian_core(r.id) c
  where r.school_id = p_school_id
  order by r.block_name, r.display_name, r.id;
end;
$$;

revoke all on function public.resolve_school_room_custodians(uuid) from public, anon;
grant execute on function public.resolve_school_room_custodians(uuid) to authenticated;

comment on function public.resolve_school_room_custodians(uuid) is
  'Current custodian resolution for every room in one school: manual override, derived home-room register-teacher default, or an explicit ambiguous/unresolved state. Returns identifiers only so names resolve through existing RLS.';

comment on function public.resolve_room_inventory_custodian(uuid) is
  'Current custodian resolution for one room in the actor''s accessible school: manual override first, then the derived home-room register-teacher default, otherwise an explicit ambiguous/unresolved reason.';

-- Clearing a manual override restores the inherited default. Rows that were
-- already effective are ended (never rewritten) so custodian history survives.
-- Future-dated rows that never took effect are cancelled, mirroring the existing
-- assign_room_inventory_custodian convention, and are recorded in the audit event.
create or replace function public.clear_room_inventory_custodian(
  p_room_id uuid,
  p_effective_on date default current_date
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_room public.school_rooms%rowtype;
  v_ended_id uuid;
  v_ended integer := 0;
  v_cancelled integer := 0;
  v_cleared_staff uuid[] := array[]::uuid[];
  v_restored_source text;
  v_restored_staff uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_effective_on is null then
    raise exception 'Effective date is required';
  end if;

  select r.* into v_room
  from public.school_rooms r
  where r.id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found';
  end if;

  if not app_private.can_manage_room_inventory(v_room.school_id) then
    raise exception 'Permission denied';
  end if;

  select coalesce(array_agg(ric.staff_member_id), array[]::uuid[])
    into v_cleared_staff
  from public.room_inventory_custodians ric
  where ric.room_id = v_room.id
    and ric.effective_to is null;

  select ric.id
    into v_ended_id
  from public.room_inventory_custodians ric
  where ric.room_id = v_room.id
    and ric.effective_to is null
    and ric.effective_from < p_effective_on
  order by ric.effective_from desc, ric.id
  limit 1;

  update public.room_inventory_custodians
  set effective_to = p_effective_on - 1
  where room_id = v_room.id
    and effective_to is null
    and effective_from < p_effective_on;
  get diagnostics v_ended = row_count;

  delete from public.room_inventory_custodians
  where room_id = v_room.id
    and effective_to is null
    and effective_from >= p_effective_on;
  get diagnostics v_cancelled = row_count;

  if v_ended = 0 and v_cancelled = 0 then
    raise exception 'No manual custodian override to clear';
  end if;

  select c.source, c.staff_member_id
    into v_restored_source, v_restored_staff
  from app_private.resolve_room_custodian_core(v_room.id) c;

  insert into public.audit_events(
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  ) values (
    v_room.tenant_id,
    v_room.school_id,
    auth.uid(),
    'room_inventory.custodian.cleared',
    'room_inventory_custodian',
    v_ended_id,
    jsonb_build_object(
      'room_id', v_room.id,
      'effective_on', p_effective_on,
      'ended_manual_rows', v_ended,
      'cancelled_future_rows', v_cancelled,
      'cleared_staff_member_ids', to_jsonb(v_cleared_staff),
      'restored_source', v_restored_source,
      'restored_staff_member_id', v_restored_staff
    )
  );

  return v_ended + v_cancelled;
end;
$$;

revoke all on function public.clear_room_inventory_custodian(uuid, date) from public, anon;
grant execute on function public.clear_room_inventory_custodian(uuid, date) to authenticated;

comment on function public.clear_room_inventory_custodian(uuid, date) is
  'Manager-governed clearing of a manual room custodian override. Effective-dated rows are ended rather than rewritten so historical provenance survives, and the audit event records the restored default source.';

-- Inheritance must not broaden authority: the custodian check still requires an
-- explicit room_inventory_custodians row and never reads register_classes.
do $$
begin
  if position('register_classes' in pg_get_functiondef('app_private.is_current_room_inventory_custodian(uuid)'::regprocedure)) > 0 then
    raise exception 'Room inventory custodian authority must not derive from register_classes';
  end if;
end;
$$;

