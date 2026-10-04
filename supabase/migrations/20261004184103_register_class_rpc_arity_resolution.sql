-- Resolve legacy/new register-class RPC overload ambiguity.
-- Keep both arities, but only the wider home-room-aware overload accepts
-- the explicit home_room_id argument; it no longer has a trailing default.

drop function if exists public.upsert_register_class(uuid,integer,uuid,text,text,uuid);

create function public.upsert_register_class(
  p_school_id uuid,
  p_academic_year integer,
  p_grade_id uuid,
  p_class_code text,
  p_display_name text,
  p_home_room_id uuid
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

-- Home-room-aware update_register_class keeps its explicit five-argument signature.
drop function if exists public.update_register_class(uuid,uuid,text,text,uuid);

create function public.update_register_class(
  p_class_id uuid,
  p_grade_id uuid,
  p_class_code text,
  p_display_name text,
  p_home_room_id uuid
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
