-- Governed school rooms/blocks for optional timetable allocation.
-- Timetable slots may continue without a room; existing free-text room_label remains compatible.

create table public.school_rooms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  room_code text not null,
  display_name text not null,
  block_name text,
  capacity integer check (capacity is null or capacity > 0),
  status text not null default 'active' check (status in ('active','inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, room_code)
);
create index school_rooms_school_status_idx on public.school_rooms (school_id, status, display_name);
alter table public.timetable_slots add column if not exists room_id uuid references public.school_rooms(id) on delete set null;
create index if not exists timetable_slots_room_idx on public.timetable_slots (room_id, weekday, period_id) where room_id is not null;
create or replace function app_private.enforce_timetable_room_scope() returns trigger language plpgsql security definer set search_path = public, app_private as $$ declare v_tenant_id uuid; v_school_id uuid; begin if new.room_id is null then return new; end if; select tenant_id, school_id into v_tenant_id, v_school_id from public.school_rooms where id = new.room_id; if v_tenant_id is null or v_tenant_id <> new.tenant_id or v_school_id <> new.school_id then raise exception 'Timetable room must belong to the same school and tenant.' using errcode = '23514'; end if; return new; end; $$;
revoke execute on function app_private.enforce_timetable_room_scope() from public, anon, authenticated;
drop trigger if exists timetable_slots_room_scope on public.timetable_slots;
create trigger timetable_slots_room_scope before insert or update of room_id, school_id, tenant_id on public.timetable_slots for each row execute function app_private.enforce_timetable_room_scope();
alter table public.school_rooms enable row level security;
create policy "school members read rooms" on public.school_rooms for select to authenticated using (app_private.has_platform_role(array['platform_admin']) or app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']));
create policy "school admins insert rooms" on public.school_rooms for insert to authenticated with check (app_private.has_school_role(school_id, array['school_admin']));
create policy "school admins update rooms" on public.school_rooms for update to authenticated using (app_private.has_school_role(school_id, array['school_admin'])) with check (app_private.has_school_role(school_id, array['school_admin']));
create policy "school admins delete rooms" on public.school_rooms for delete to authenticated using (app_private.has_school_role(school_id, array['school_admin']));
revoke all on public.school_rooms from anon;
grant select, insert, update, delete on public.school_rooms to authenticated;
create or replace function public.upsert_school_room(p_school_id uuid,p_room_id uuid default null,p_room_code text default null,p_display_name text default null,p_block_name text default null,p_capacity integer default null,p_status text default 'active',p_notes text default null) returns uuid language plpgsql security definer set search_path = public, app_private as $$ declare v_tenant_id uuid; v_room_id uuid; begin if not app_private.has_school_role(p_school_id, array['school_admin']) then raise exception 'Permission denied' using errcode='42501'; end if; select tenant_id into v_tenant_id from public.schools where id=p_school_id and status='active'; if v_tenant_id is null then raise exception 'School is not available.' using errcode='22023'; end if; if nullif(btrim(p_room_code),'') is null or nullif(btrim(p_display_name),'') is null then raise exception 'Room code and display name are required.' using errcode='22023'; end if; if p_status not in ('active','inactive') then raise exception 'Invalid room status.' using errcode='22023'; end if; if p_room_id is null then insert into public.school_rooms(tenant_id,school_id,room_code,display_name,block_name,capacity,status,notes) values(v_tenant_id,p_school_id,upper(btrim(p_room_code)),btrim(p_display_name),nullif(btrim(p_block_name),''),p_capacity,p_status,nullif(btrim(p_notes),'')) returning id into v_room_id; else update public.school_rooms set room_code=upper(btrim(p_room_code)), display_name=btrim(p_display_name), block_name=nullif(btrim(p_block_name),''),capacity=p_capacity, status=p_status, notes=nullif(btrim(p_notes),''), updated_at=now() where id=p_room_id and school_id=p_school_id returning id into v_room_id; if v_room_id is null then raise exception 'Room not found.' using errcode='22023'; end if; end if; insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata) values(v_tenant_id,p_school_id,auth.uid(),case when p_room_id is null then 'school_room.created' else 'school_room.updated' end,'school_room',v_room_id,jsonb_build_object('room_code',upper(btrim(p_room_code)),'display_name',btrim(p_display_name),'status',p_status)); return v_room_id; end; $$;
create or replace function public.delete_school_room(p_room_id uuid) returns void language plpgsql security definer set search_path = public, app_private as $$ declare v_room public.school_rooms%rowtype; begin select * into v_room from public.school_rooms where id=p_room_id; if not found then raise exception 'Room not found.' using errcode='22023'; end if; if not app_private.has_school_role(v_room.school_id, array['school_admin']) then raise exception 'Permission denied' using errcode='42501'; end if; if exists(select 1 from public.timetable_slots where room_id=p_room_id) then raise exception 'Rooms already used by timetable slots cannot be deleted. Mark the room inactive instead.' using errcode='23503'; end if; delete from public.school_rooms where id=p_room_id; insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata) values(v_room.tenant_id,v_room.school_id,auth.uid(),'school_room.deleted','school_room',p_room_id,jsonb_build_object('room_code',v_room.room_code,'display_name',v_room.display_name)); end; $$;
revoke all on function public.upsert_school_room(uuid,uuid,text,text,text,integer,text,text) from public, anon;
revoke all on function public.delete_school_room(uuid) from public, anon;
grant execute on function public.upsert_school_room(uuid,uuid,text,text,text,integer,text,text) to authenticated;
grant execute on function public.delete_school_room(uuid) to authenticated;
