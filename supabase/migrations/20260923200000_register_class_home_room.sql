-- Issue #701: Register Class → Home Room relationship
--
-- Adds a governed, same-school/same-tenant home_room_id column to
-- register_classes. The relationship is OPTIONAL and editable. It is NOT a
-- foreign key with cascade — historical register-to-room assignments must
-- survive room renumbering or deletion. Room references are validated by a
-- trigger that enforces tenant/school scope.
--
-- Register Teacher remains a separate field/domain (not merged with custodian).
--
-- Effective-dated history: home room is the CURRENT assignment on the row;
-- changes are logged to audit_events.

-- Add the home_room_id column (nullable, no FK cascade)
alter table public.register_classes
  add column if not exists home_room_id uuid references public.school_rooms(id) on delete set null;

-- Index for efficient lookups of classes assigned to a room
create index if not exists register_classes_home_room_idx
  on public.register_classes (home_room_id)
  where home_room_id is not null;

-- Trigger to enforce that the home room belongs to the same school and tenant
create or replace function app_private.enforce_home_room_scope()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_tenant uuid;
  v_school uuid;
begin
  if new.home_room_id is null then
    return new;
  end if;

  if new.tenant_id is null or new.school_id is null then
    return new;
  end if;

  select tenant_id, school_id into v_tenant, v_school
  from public.school_rooms
  where id = new.home_room_id;

  if v_tenant is null then
    raise exception 'Home room not found';
  end if;

  if v_tenant <> new.tenant_id or v_school <> new.school_id then
        raise exception 'Home room must belong to the same school and tenant as the register class'
    using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_home_room_scope() from public, anon, authenticated;

drop trigger if exists register_class_home_room_scope on public.register_classes;
create trigger register_class_home_room_scope
  before insert or update of home_room_id, school_id, tenant_id
  on public.register_classes
  for each row
  execute function app_private.enforce_home_room_scope();

-- RLS: home_room_id resolves to a room already visible to school-scoped users
-- per existing school_rooms policies. No special RLS needed for the column.

-- Create overloaded RPCs with optional home_room_id (PostgreSQL resolves by
-- parameter count, so original 5/4-param signatures coexist).
create or replace function public.upsert_register_class(
  p_school_id uuid,
  p_academic_year integer,
  p_grade_id uuid,
  p_class_code text,
  p_display_name text,
  p_home_room_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_class_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_school_members(p_school_id) then raise exception 'Permission denied'; end if;

  select tenant_id into v_tenant_id from public.schools where id = p_school_id and status = 'active';
  if v_tenant_id is null then raise exception 'School not found or inactive'; end if;

  if p_home_room_id is not null then
    if not exists (
      select 1 from public.school_rooms
      where id = p_home_room_id and tenant_id = v_tenant_id and school_id = p_school_id
    ) then
      raise exception 'Home room must belong to the same school and tenant as the register class';
        end if;
  end if;

  insert into public.register_classes (tenant_id, school_id, grade_id, academic_year, class_code, display_name, home_room_id)
  values (v_tenant_id, p_school_id, p_grade_id, p_academic_year, lower(btrim(p_class_code)), btrim(p_display_name), p_home_room_id)
  on conflict (school_id, academic_year, class_code)
  do update set grade_id = excluded.grade_id, display_name = excluded.display_name, home_room_id = excluded.home_room_id
  returning id into v_class_id;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_tenant_id, p_school_id, auth.uid(), 'academic.class.upserted', 'register_class', v_class_id,
    jsonb_build_object('academic_year', p_academic_year, 'class_code', lower(btrim(p_class_code)), 'grade_id', p_grade_id, 'home_room_id', p_home_room_id));

  return v_class_id;
end;
$$;

revoke all on function public.upsert_register_class(uuid,integer,uuid,text,text,uuid) from public, anon;
grant execute on function public.upsert_register_class(uuid,integer,uuid,text,text,uuid) to authenticated;

-- New overload: update_register_class with optional home_room_id
create or replace function public.update_register_class(
  p_class_id uuid,
  p_grade_id uuid,
  p_class_code text,
  p_display_name text,
  p_home_room_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class public.register_classes%rowtype;
  v_grade public.grades%rowtype;
  v_old_room uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_class from public.register_classes where id = p_class_id;
  if not found then raise exception 'Register class not found'; end if;
  if not app_private.can_manage_school_members(v_class.school_id) then raise exception 'Permission denied'; end if;

  select * into v_grade from public.grades
  where id = p_grade_id
    and school_id = v_class.school_id
    and academic_year = v_class.academic_year;
  if not found then raise exception 'Grade is not valid for this class'; end if;

  if p_home_room_id is not null then
    if not exists (
      select 1 from public.school_rooms
      where id = p_home_room_id and tenant_id = v_class.tenant_id and school_id = v_class.school_id
    ) then
      raise exception 'Home room must belong to the same school and tenant as the register class';
    end if;
  end if;

  v_old_room := v_class.home_room_id;

  update public.register_classes
  set grade_id = p_grade_id,
      class_code = upper(btrim(p_class_code)),
      display_name = btrim(p_display_name),
      home_room_id = p_home_room_id
  where id = p_class_id;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_class.tenant_id, v_class.school_id, auth.uid(), 'register_class.updated', 'register_class', p_class_id,
    jsonb_build_object('class_code', upper(btrim(p_class_code)), 'display_name', btrim(p_display_name), 'home_room_id', p_home_room_id, 'previous_home_room_id', v_old_room));

  return p_class_id;
end;
$$;

revoke all on function public.update_register_class(uuid,uuid,text,text,uuid) from public, anon;
grant execute on function public.update_register_class(uuid,uuid,text,text,uuid) to authenticated;

-- Application server actions pass home_room_id via the upsert/update RPCs.
-- The column is added above with a same-school trigger guarding all write paths.