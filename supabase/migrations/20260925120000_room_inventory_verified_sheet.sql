-- Issue #708: finalized Room Inventory A4 sheet foundation.
-- A room verification is the immutable source record. Export reads only that
-- frozen snapshot; export/preview never mutates workflow state.

alter table public.room_inventory_verifications
  add column if not exists room_display_name_snapshot text,
  add column if not exists block_name_snapshot text,
  add column if not exists linked_classes_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists custodian_snapshot jsonb not null default '{}'::jsonb;

create or replace function public.verify_room_inventory(
  p_room_id uuid,
  p_status text default 'confirmed',
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_room public.school_rooms%rowtype;
  v_id uuid;
  v_snapshot jsonb;
  v_count integer;
  v_classes jsonb;
  v_custodian jsonb;
  v_custodian_source text;
  v_custodian_staff_id uuid;
  v_custodian_name text;
  v_created_at timestamptz;
  v_revision integer;
  v_previous_verification_id uuid;
  v_registered record;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_room
  from public.school_rooms
  where id = p_room_id;

  if not found then raise exception 'Room not found'; end if;

  if not (
    app_private.can_manage_room_inventory(v_room.school_id)
    or app_private.is_current_room_inventory_custodian(v_room.id)
  ) then
    raise exception 'Permission denied';
  end if;

  if p_status not in ('confirmed','exceptions_noted') then
    raise exception 'Invalid verification status';
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'item_name', i.item_name,
          'ownership', i.ownership,
          'quantity', i.quantity,
          'condition', i.condition,
          'asset_number', i.asset_number,
          'notes', i.notes,
          'status', i.status,
          'version', i.version
        )
        order by i.item_name, i.id
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into v_snapshot, v_count
  from public.room_inventory_items i
  where i.room_id = p_room_id
    and i.status <> 'transferred_out';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', rc.id,
        'display_name', rc.display_name
      )
      order by rc.display_name, rc.id
    ),
    '[]'::jsonb
  )
  into v_classes
  from public.register_classes rc
  where rc.room_id is null;

  -- The previous query intentionally cannot bind to a non-existent generic room_id.
  -- Replace it with the canonical home-room relationship.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', rc.id,
        'display_name', rc.display_name
      )
      order by rc.display_name, rc.id
    ),
    '[]'::jsonb
  )
  into v_classes
  from public.register_classes rc
  where rc.home_room_id = p_room_id
    and rc.school_id = v_room.school_id
    and rc.tenant_id = v_room.tenant_id;

  select c.source, c.staff_member_id
    into v_custodian_source, v_custodian_staff_id
  from app_private.resolve_room_custodian_core(p_room_id) c;

  if v_custodian_staff_id is not null then
    select concat_ws(' ', sm.first_name, sm.last_name)
      into v_custodian_name
    from public.staff_members sm
    where sm.id = v_custodian_staff_id;
  end if;

  v_custodian := jsonb_build_object(
    'source', coalesce(v_custodian_source, 'none'),
    'staff_member_id', v_custodian_staff_id,
    'staff_name', v_custodian_name
  );

  insert into public.room_inventory_verifications(
    tenant_id,
    school_id,
    room_id,
    verification_status,
    verified_item_count,
    inventory_snapshot,
    notes,
    verified_by_user_id,
    room_display_name_snapshot,
    block_name_snapshot,
    linked_classes_snapshot,
    custodian_snapshot
  )
  values(
    v_room.tenant_id,
    v_room.school_id,
    v_room.id,
    p_status,
    v_count,
    v_snapshot,
    nullif(btrim(coalesce(p_notes,'')),''),
    auth.uid(),
    v_room.display_name,
    v_room.block_name,
    v_classes,
    v_custodian
  )
  returning id, created_at into v_id, v_created_at;

  select odv.id, odv.revision
    into v_previous_verification_id, v_revision
  from public.official_document_verifications odv
  where odv.tenant_id = v_room.tenant_id
    and odv.school_id = v_room.school_id
    and odv.document_type_key = 'room_inventory_a4_sheet'
    and odv.source_lineage_id = v_room.id
  order by odv.revision desc
  limit 1;

  v_revision := coalesce(v_revision, 0) + 1;

  select *
    into v_registered
  from app_private.register_official_document_verification(
    v_room.tenant_id,
    v_room.school_id,
    'room_inventory_a4_sheet',
    v_id,
    v_room.id,
    v_revision,
    v_previous_verification_id,
    current_date,
    v_created_at,
    auth.uid()
  );

  insert into public.audit_events(
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  )
  values(
    v_room.tenant_id,
    v_room.school_id,
    auth.uid(),
    'room_inventory.verified',
    'room_inventory_verification',
    v_id,
    jsonb_build_object(
      'room_id', p_room_id,
      'status', p_status,
      'item_count', v_count,
      'scolapro_reference', v_registered.scolapro_reference
    )
  );

  return v_id;
end;
$$;

revoke all on function public.verify_room_inventory(uuid,text,text) from public, anon;
grant execute on function public.verify_room_inventory(uuid,text,text) to authenticated;

create or replace function public.get_verified_room_inventory_sheet(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_room public.school_rooms%rowtype;
  v_verification public.room_inventory_verifications%rowtype;
  v_provenance public.official_document_verifications%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_room
  from public.school_rooms
  where id = p_room_id;

  if not found then raise exception 'Room not found'; end if;

  if not (
    app_private.can_manage_room_inventory(v_room.school_id)
    or app_private.is_current_room_inventory_custodian(v_room.id)
  ) then
    raise exception 'Permission denied';
  end if;

  select riv.*
    into v_verification
  from public.room_inventory_verifications riv
  join public.official_document_verifications odv
    on odv.source_record_id = riv.id
   and odv.document_type_key = 'room_inventory_a4_sheet'
  where riv.room_id = p_room_id
    and riv.school_id = v_room.school_id
    and riv.tenant_id = v_room.tenant_id
  order by riv.created_at desc, riv.id desc
  limit 1;

  if v_verification.id is null then
    return null;
  end if;

  select *
    into v_provenance
  from public.official_document_verifications odv
  where odv.source_record_id = v_verification.id
    and odv.document_type_key = 'room_inventory_a4_sheet';

  return jsonb_build_object(
    'verification_id', v_verification.id,
    'room_id', v_verification.room_id,
    'room_display_name', v_verification.room_display_name_snapshot,
    'block_name', v_verification.block_name_snapshot,
    'linked_classes', v_verification.linked_classes_snapshot,
    'custodian', v_verification.custodian_snapshot,
    'verified_on', v_verification.verified_on,
    'verification_status', v_verification.verification_status,
    'verified_item_count', v_verification.verified_item_count,
    'inventory', v_verification.inventory_snapshot,
    'verification_notes', v_verification.notes,
    'finalized_at', v_verification.created_at,
    'revision', v_provenance.revision,
    'scolapro_reference', v_provenance.scolapro_reference,
    'verification_token', v_provenance.verification_token,
    'verification_path', '/verify/' || v_provenance.verification_token
  );
end;
$$;

revoke all on function public.get_verified_room_inventory_sheet(uuid) from public, anon;
grant execute on function public.get_verified_room_inventory_sheet(uuid) to authenticated;

comment on function public.get_verified_room_inventory_sheet(uuid) is
'Returns the latest finalized room-inventory verification snapshot and its private verification token only to an authenticated actor with current governed room-inventory access. Export is read-only and never mutates verification state.';
