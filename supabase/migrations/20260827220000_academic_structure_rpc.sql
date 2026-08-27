create or replace function public.upsert_school_grade(
  p_school_id uuid,
  p_academic_year integer,
  p_grade_code text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school public.schools%rowtype;
  v_grade_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_school_members(p_school_id) then raise exception 'Permission denied'; end if;
  if p_academic_year < 2000 or p_academic_year > 2200 then raise exception 'Academic year is invalid'; end if;
  if btrim(coalesce(p_grade_code, '')) = '' or btrim(coalesce(p_display_name, '')) = '' then raise exception 'Grade code and display name are required'; end if;

  select * into v_school from public.schools where id = p_school_id and status = 'active';
  if not found then raise exception 'School not found or inactive'; end if;

  insert into public.grades (tenant_id, school_id, academic_year, grade_code, display_name)
  values (v_school.tenant_id, p_school_id, p_academic_year, lower(btrim(p_grade_code)), btrim(p_display_name))
  on conflict (school_id, academic_year, grade_code)
  do update set display_name = excluded.display_name
  returning id into v_grade_id;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_school.tenant_id, p_school_id, auth.uid(), 'academic.grade.upserted', 'grade', v_grade_id, jsonb_build_object('academic_year', p_academic_year, 'grade_code', lower(btrim(p_grade_code))));

  return v_grade_id;
end;
$$;

create or replace function public.upsert_register_class(
  p_school_id uuid,
  p_academic_year integer,
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
  v_school public.schools%rowtype;
  v_class_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_school_members(p_school_id) then raise exception 'Permission denied'; end if;
  if btrim(coalesce(p_class_code, '')) = '' or btrim(coalesce(p_display_name, '')) = '' then raise exception 'Class code and display name are required'; end if;

  select * into v_school from public.schools where id = p_school_id and status = 'active';
  if not found then raise exception 'School not found or inactive'; end if;

  if not exists (
    select 1 from public.grades
    where id = p_grade_id and school_id = p_school_id and academic_year = p_academic_year
  ) then
    raise exception 'Grade does not belong to this school and academic year';
  end if;

  insert into public.register_classes (tenant_id, school_id, grade_id, academic_year, class_code, display_name)
  values (v_school.tenant_id, p_school_id, p_grade_id, p_academic_year, lower(btrim(p_class_code)), btrim(p_display_name))
  on conflict (school_id, academic_year, class_code)
  do update set grade_id = excluded.grade_id, display_name = excluded.display_name
  returning id into v_class_id;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_school.tenant_id, p_school_id, auth.uid(), 'academic.class.upserted', 'register_class', v_class_id, jsonb_build_object('academic_year', p_academic_year, 'class_code', lower(btrim(p_class_code)), 'grade_id', p_grade_id));

  return v_class_id;
end;
$$;

revoke all on function public.upsert_school_grade(uuid,integer,text,text) from public, anon;
grant execute on function public.upsert_school_grade(uuid,integer,text,text) to authenticated;
revoke all on function public.upsert_register_class(uuid,integer,uuid,text,text) from public, anon;
grant execute on function public.upsert_register_class(uuid,integer,uuid,text,text) to authenticated;
