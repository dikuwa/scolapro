create table if not exists public.room_inventory_custodians (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  room_id uuid not null references public.school_rooms(id) on delete restrict,
  staff_member_id uuid not null references public.staff_members(id) on delete restrict,
  effective_from date not null default current_date,
  effective_to date,
  assigned_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
create unique index if not exists room_inventory_one_current_custodian_uidx on public.room_inventory_custodians(room_id) where effective_to is null;
create index if not exists room_inventory_custodian_staff_idx on public.room_inventory_custodians(school_id, staff_member_id, effective_from desc);

create table if not exists public.room_inventory_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  room_id uuid not null references public.school_rooms(id) on delete restrict,
  item_name text not null check (btrim(item_name) <> ''),
  ownership text not null check (ownership in ('government','school','personal')),
  quantity integer not null default 1 check (quantity >= 0),
  condition text not null default 'good' check (condition in ('new','good','fair','poor','damaged','lost','disposed')),
  asset_number text,
  notes text,
  status text not null default 'active' check (status in ('active','disposed','transferred_out','lost')),
  version integer not null default 1 check (version > 0),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists room_inventory_asset_number_school_uidx on public.room_inventory_items(school_id, lower(btrim(asset_number))) where asset_number is not null and btrim(asset_number) <> '';
create index if not exists room_inventory_items_room_idx on public.room_inventory_items(room_id, status, item_name);

create table if not exists public.room_inventory_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  room_id uuid not null references public.school_rooms(id) on delete restrict,
  inventory_item_id uuid not null references public.room_inventory_items(id) on delete restrict,
  event_type text not null check (event_type in ('initial_capture','received','quantity_increase','quantity_decrease','transferred_in','transferred_out','damaged','lost','disposed','correction','ownership_correction')),
  quantity_delta integer not null default 0,
  resulting_quantity integer not null check (resulting_quantity >= 0),
  previous_condition text,
  resulting_condition text,
  previous_ownership text,
  resulting_ownership text,
  note text,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  occurred_at timestamptz not null default now()
);
create index if not exists room_inventory_events_item_idx on public.room_inventory_events(inventory_item_id, occurred_at desc);

create table if not exists public.room_inventory_verifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  room_id uuid not null references public.school_rooms(id) on delete restrict,
  verified_on date not null default current_date,
  verification_status text not null default 'confirmed' check (verification_status in ('confirmed','exceptions_noted')),
  verified_item_count integer not null default 0 check (verified_item_count >= 0),
  inventory_snapshot jsonb not null default '[]'::jsonb,
  notes text,
  verified_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists room_inventory_verifications_room_idx on public.room_inventory_verifications(room_id, verified_on desc, created_at desc);

create or replace function app_private.can_manage_room_inventory(target_school_id uuid)
returns boolean language sql stable security definer set search_path = public, app_private as $$
  select app_private.has_school_role(target_school_id, array['school_admin','principal','deputy_principal']);
$$;
create or replace function app_private.is_current_room_inventory_custodian(target_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.room_inventory_custodians ric
    join public.staff_members sm on sm.id = ric.staff_member_id
    where ric.room_id = target_room_id and sm.user_id = auth.uid() and sm.status = 'active'
      and ric.effective_from <= current_date and (ric.effective_to is null or ric.effective_to >= current_date)
  );
$$;
revoke all on function app_private.can_manage_room_inventory(uuid) from public, anon;
revoke all on function app_private.is_current_room_inventory_custodian(uuid) from public, anon;
grant execute on function app_private.can_manage_room_inventory(uuid) to authenticated;
grant execute on function app_private.is_current_room_inventory_custodian(uuid) to authenticated;

create or replace function app_private.enforce_room_inventory_scope()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_school_tenant uuid; v_room_tenant uuid; v_room_school uuid; v_staff_tenant uuid;
begin
  select s.tenant_id into v_school_tenant from public.schools s where s.id = new.school_id;
  select r.tenant_id, r.school_id into v_room_tenant, v_room_school from public.school_rooms r where r.id = new.room_id;
  if v_school_tenant is null or v_school_tenant <> new.tenant_id or v_room_tenant is null or v_room_tenant <> new.tenant_id or v_room_school <> new.school_id then
    raise exception 'Room inventory scope mismatch';
  end if;
  if tg_table_name = 'room_inventory_custodians' then
    select sm.tenant_id into v_staff_tenant from public.staff_members sm where sm.id = new.staff_member_id;
    if v_staff_tenant is null or v_staff_tenant <> new.tenant_id then raise exception 'Room inventory custodian must belong to the same tenant'; end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.enforce_room_inventory_scope() from public, anon, authenticated;
create trigger room_inventory_custodian_scope_trg before insert or update of tenant_id, school_id, room_id, staff_member_id on public.room_inventory_custodians for each row execute function app_private.enforce_room_inventory_scope();
create trigger room_inventory_item_scope_trg before insert or update of tenant_id, school_id, room_id on public.room_inventory_items for each row execute function app_private.enforce_room_inventory_scope();
create trigger room_inventory_verification_scope_trg before insert or update of tenant_id, school_id, room_id on public.room_inventory_verifications for each row execute function app_private.enforce_room_inventory_scope();

alter table public.room_inventory_custodians enable row level security;
alter table public.room_inventory_items enable row level security;
alter table public.room_inventory_events enable row level security;
alter table public.room_inventory_verifications enable row level security;
create policy "room inventory custodians readable in authorized scope" on public.room_inventory_custodians for select to authenticated using (app_private.can_manage_room_inventory(school_id) or app_private.is_current_room_inventory_custodian(room_id));
create policy "room inventory items readable in authorized scope" on public.room_inventory_items for select to authenticated using (app_private.can_manage_room_inventory(school_id) or app_private.is_current_room_inventory_custodian(room_id));
create policy "room inventory events readable in authorized scope" on public.room_inventory_events for select to authenticated using (app_private.can_manage_room_inventory(school_id) or app_private.is_current_room_inventory_custodian(room_id));
create policy "room inventory verifications readable in authorized scope" on public.room_inventory_verifications for select to authenticated using (app_private.can_manage_room_inventory(school_id) or app_private.is_current_room_inventory_custodian(room_id));
revoke insert, update, delete on public.room_inventory_custodians from authenticated;
revoke insert, update, delete on public.room_inventory_items from authenticated;
revoke insert, update, delete on public.room_inventory_events from authenticated;
revoke insert, update, delete on public.room_inventory_verifications from authenticated;

create or replace function public.assign_room_inventory_custodian(p_room_id uuid,p_staff_member_id uuid,p_effective_from date default current_date)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, app_private as $$
declare v_room public.school_rooms%rowtype; v_staff public.staff_members%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_room from public.school_rooms where id = p_room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if not app_private.can_manage_room_inventory(v_room.school_id) then raise exception 'Permission denied'; end if;
  select * into v_staff from public.staff_members where id = p_staff_member_id and status = 'active';
  if not found or v_staff.tenant_id <> v_room.tenant_id then raise exception 'Eligible staff member not found'; end if;
  if not exists (select 1 from public.staff_school_assignments ssa where ssa.staff_member_id=p_staff_member_id and ssa.school_id=v_room.school_id and ssa.effective_from<=p_effective_from and (ssa.effective_to is null or ssa.effective_to>=p_effective_from))
     and not exists (select 1 from public.school_memberships sm where sm.staff_member_id=p_staff_member_id and sm.school_id=v_room.school_id and sm.active_from<=p_effective_from and (sm.active_to is null or sm.active_to>=p_effective_from)) then
    raise exception 'Staff member is not assigned to this school';
  end if;
  update public.room_inventory_custodians set effective_to=p_effective_from-1 where room_id=p_room_id and effective_to is null and effective_from<p_effective_from;
  delete from public.room_inventory_custodians where room_id=p_room_id and effective_to is null and effective_from>=p_effective_from;
  insert into public.room_inventory_custodians(tenant_id,school_id,room_id,staff_member_id,effective_from,assigned_by_user_id)
  values(v_room.tenant_id,v_room.school_id,v_room.id,p_staff_member_id,p_effective_from,auth.uid()) returning id into v_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_room.tenant_id,v_room.school_id,auth.uid(),'room_inventory.custodian.assigned','room_inventory_custodian',v_id,jsonb_build_object('room_id',p_room_id,'staff_member_id',p_staff_member_id,'effective_from',p_effective_from));
  return v_id;
end;
$$;

create or replace function public.create_room_inventory_item(p_room_id uuid,p_item_name text,p_ownership text,p_quantity integer default 1,p_condition text default 'good',p_asset_number text default null,p_notes text default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, app_private as $$
declare v_room public.school_rooms%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_room from public.school_rooms where id=p_room_id;
  if not found then raise exception 'Room not found'; end if;
  if not (app_private.can_manage_room_inventory(v_room.school_id) or app_private.is_current_room_inventory_custodian(v_room.id)) then raise exception 'Permission denied'; end if;
  if btrim(coalesce(p_item_name,''))='' then raise exception 'Item name is required'; end if;
  if p_ownership not in ('government','school','personal') then raise exception 'Invalid ownership'; end if;
  if p_quantity is null or p_quantity<0 then raise exception 'Invalid quantity'; end if;
  if p_condition not in ('new','good','fair','poor','damaged','lost','disposed') then raise exception 'Invalid condition'; end if;
  insert into public.room_inventory_items(tenant_id,school_id,room_id,item_name,ownership,quantity,condition,asset_number,notes,created_by_user_id)
  values(v_room.tenant_id,v_room.school_id,v_room.id,btrim(p_item_name),p_ownership,p_quantity,p_condition,nullif(btrim(coalesce(p_asset_number,'')),''),nullif(btrim(coalesce(p_notes,'')),''),auth.uid()) returning id into v_id;
  insert into public.room_inventory_events(tenant_id,school_id,room_id,inventory_item_id,event_type,quantity_delta,resulting_quantity,resulting_condition,resulting_ownership,note,actor_user_id)
  values(v_room.tenant_id,v_room.school_id,v_room.id,v_id,'initial_capture',p_quantity,p_quantity,p_condition,p_ownership,p_notes,auth.uid());
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_room.tenant_id,v_room.school_id,auth.uid(),'room_inventory.item.created','room_inventory_item',v_id,jsonb_build_object('room_id',p_room_id));
  return v_id;
end;
$$;

create or replace function public.change_room_inventory_item(p_item_id uuid,p_event_type text,p_quantity_delta integer default 0,p_condition text default null,p_ownership text default null,p_note text default null)
returns integer language plpgsql security definer set search_path = pg_catalog, public, app_private as $$
declare v_item public.room_inventory_items%rowtype; v_new_quantity integer; v_condition text; v_ownership text; v_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_item from public.room_inventory_items where id=p_item_id for update;
  if not found then raise exception 'Inventory item not found'; end if;
  if not (app_private.can_manage_room_inventory(v_item.school_id) or app_private.is_current_room_inventory_custodian(v_item.room_id)) then raise exception 'Permission denied'; end if;
  if p_event_type not in ('received','quantity_increase','quantity_decrease','transferred_in','transferred_out','damaged','lost','disposed','correction','ownership_correction') then raise exception 'Invalid inventory event'; end if;
  v_new_quantity:=v_item.quantity+coalesce(p_quantity_delta,0);
  if v_new_quantity<0 then raise exception 'Quantity cannot be negative'; end if;
  v_condition:=coalesce(p_condition,v_item.condition); v_ownership:=coalesce(p_ownership,v_item.ownership);
  if v_condition not in ('new','good','fair','poor','damaged','lost','disposed') then raise exception 'Invalid condition'; end if;
  if v_ownership not in ('government','school','personal') then raise exception 'Invalid ownership'; end if;
  v_status:=case when p_event_type='disposed' then 'disposed' when p_event_type='lost' then 'lost' when p_event_type='transferred_out' and v_new_quantity=0 then 'transferred_out' else v_item.status end;
  update public.room_inventory_items set quantity=v_new_quantity,condition=v_condition,ownership=v_ownership,status=v_status,version=version+1,updated_at=now() where id=v_item.id;
  insert into public.room_inventory_events(tenant_id,school_id,room_id,inventory_item_id,event_type,quantity_delta,resulting_quantity,previous_condition,resulting_condition,previous_ownership,resulting_ownership,note,actor_user_id)
  values(v_item.tenant_id,v_item.school_id,v_item.room_id,v_item.id,p_event_type,coalesce(p_quantity_delta,0),v_new_quantity,v_item.condition,v_condition,v_item.ownership,v_ownership,p_note,auth.uid());
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_item.tenant_id,v_item.school_id,auth.uid(),'room_inventory.item.changed','room_inventory_item',v_item.id,jsonb_build_object('room_id',v_item.room_id,'change_type',p_event_type,'quantity',v_new_quantity));
  return v_new_quantity;
end;
$$;

create or replace function public.verify_room_inventory(p_room_id uuid,p_status text default 'confirmed',p_notes text default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, app_private as $$
declare v_room public.school_rooms%rowtype; v_id uuid; v_snapshot jsonb; v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_room from public.school_rooms where id=p_room_id;
  if not found then raise exception 'Room not found'; end if;
  if not (app_private.can_manage_room_inventory(v_room.school_id) or app_private.is_current_room_inventory_custodian(v_room.id)) then raise exception 'Permission denied'; end if;
  if p_status not in ('confirmed','exceptions_noted') then raise exception 'Invalid verification status'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'item_name',i.item_name,'ownership',i.ownership,'quantity',i.quantity,'condition',i.condition,'asset_number',i.asset_number,'status',i.status,'version',i.version) order by i.item_name,i.id),'[]'::jsonb),count(*)::integer
  into v_snapshot,v_count from public.room_inventory_items i where i.room_id=p_room_id and i.status<>'transferred_out';
  insert into public.room_inventory_verifications(tenant_id,school_id,room_id,verification_status,verified_item_count,inventory_snapshot,notes,verified_by_user_id)
  values(v_room.tenant_id,v_room.school_id,v_room.id,p_status,v_count,v_snapshot,nullif(btrim(coalesce(p_notes,'')),''),auth.uid()) returning id into v_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_room.tenant_id,v_room.school_id,auth.uid(),'room_inventory.verified','room_inventory_verification',v_id,jsonb_build_object('room_id',p_room_id,'status',p_status,'item_count',v_count));
  return v_id;
end;
$$;

revoke all on function public.assign_room_inventory_custodian(uuid,uuid,date) from public, anon;
revoke all on function public.create_room_inventory_item(uuid,text,text,integer,text,text,text) from public, anon;
revoke all on function public.change_room_inventory_item(uuid,text,integer,text,text,text) from public, anon;
revoke all on function public.verify_room_inventory(uuid,text,text) from public, anon;
grant execute on function public.assign_room_inventory_custodian(uuid,uuid,date) to authenticated;
grant execute on function public.create_room_inventory_item(uuid,text,text,integer,text,text,text) to authenticated;
grant execute on function public.change_room_inventory_item(uuid,text,integer,text,text,text) to authenticated;
grant execute on function public.verify_room_inventory(uuid,text,text) to authenticated;

comment on table public.room_inventory_items is 'Current school room inventory state with government, school, or personal ownership; history is retained in room_inventory_events.';
comment on table public.room_inventory_verifications is 'Immutable room inventory verification snapshots so unchanged inventory can be carried forward without re-entry.';
