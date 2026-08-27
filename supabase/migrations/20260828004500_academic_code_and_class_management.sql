-- Normalize academic identifiers and add governed class correction/removal.

update public.grades
set grade_code = case
  when upper(btrim(grade_code)) ~ '^[0-9]+$' then 'G' || upper(btrim(grade_code))
  else upper(btrim(grade_code))
end
where grade_code <> case
  when upper(btrim(grade_code)) ~ '^[0-9]+$' then 'G' || upper(btrim(grade_code))
  else upper(btrim(grade_code))
end;

update public.register_classes
set class_code = upper(btrim(class_code))
where class_code <> upper(btrim(class_code));

update public.subjects
set subject_code = upper(btrim(subject_code))
where subject_code <> upper(btrim(subject_code));

create or replace function public.update_register_class(
  p_class_id uuid,
  p_grade_id uuid,
  p_class_code text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class public.register_classes%rowtype;
  v_grade public.grades%rowtype;
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

  update public.register_classes
  set grade_id = p_grade_id,
      class_code = upper(btrim(p_class_code)),
      display_name = btrim(p_display_name)
  where id = p_class_id;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_class.tenant_id, v_class.school_id, auth.uid(), 'register_class.updated', 'register_class', p_class_id,
    jsonb_build_object('class_code', upper(btrim(p_class_code)), 'display_name', btrim(p_display_name)));

  return p_class_id;
end;
$$;

create or replace function public.delete_register_class(p_class_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class public.register_classes%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_class from public.register_classes where id = p_class_id;
  if not found then return false; end if;
  if not app_private.can_manage_school_members(v_class.school_id) then raise exception 'Permission denied'; end if;

  if exists (select 1 from public.enrolments where register_class_id = p_class_id)
    or exists (select 1 from public.teacher_allocations where register_class_id = p_class_id)
    or exists (select 1 from public.timetable_slots where register_class_id = p_class_id)
    or exists (select 1 from public.attendance_events where register_class_id = p_class_id)
    or exists (select 1 from public.attendance_register_submissions where register_class_id = p_class_id)
  then
    raise exception 'Register class is already in use and cannot be deleted';
  end if;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_class.tenant_id, v_class.school_id, auth.uid(), 'register_class.deleted', 'register_class', p_class_id,
    jsonb_build_object('class_code', v_class.class_code, 'display_name', v_class.display_name));

  delete from public.register_classes where id = p_class_id;
  return true;
end;
$$;

revoke all on function public.update_register_class(uuid,uuid,text,text) from public, anon;
grant execute on function public.update_register_class(uuid,uuid,text,text) to authenticated;
revoke all on function public.delete_register_class(uuid) from public, anon;
grant execute on function public.delete_register_class(uuid) to authenticated;
