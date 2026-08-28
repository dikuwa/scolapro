-- Existing grades can be corrected by administrators. Unused accidental grades
-- can be removed, while any grade that has entered an operational workflow is
-- protected as historical structure.

create or replace function public.update_school_grade(
  p_grade_id uuid,
  p_grade_code text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grade public.grades%rowtype;
  v_code text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_grade from public.grades where id = p_grade_id;
  if not found then raise exception 'Grade not found'; end if;
  if not app_private.can_manage_school_members(v_grade.school_id) then raise exception 'Permission denied'; end if;

  v_code := upper(btrim(p_grade_code));
  if v_code ~ '^\d+$' then v_code := 'G' || v_code; end if;
  if v_code = '' or btrim(p_display_name) = '' then raise exception 'Grade code and display name are required'; end if;

  update public.grades
  set grade_code = v_code,
      display_name = btrim(p_display_name)
  where id = p_grade_id;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (
    v_grade.tenant_id,
    v_grade.school_id,
    auth.uid(),
    'grade.updated',
    'grade',
    p_grade_id,
    jsonb_build_object(
      'previous_code', v_grade.grade_code,
      'previous_display_name', v_grade.display_name,
      'grade_code', v_code,
      'display_name', btrim(p_display_name)
    )
  );

  return p_grade_id;
end;
$$;

create or replace function public.delete_school_grade(p_grade_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grade public.grades%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_grade from public.grades where id = p_grade_id;
  if not found then return false; end if;
  if not app_private.can_manage_school_members(v_grade.school_id) then raise exception 'Permission denied'; end if;

  if exists (select 1 from public.register_classes where grade_id = p_grade_id)
    or exists (select 1 from public.enrolments where grade_id = p_grade_id)
    or exists (select 1 from public.subject_offerings where grade_id = p_grade_id)
    or exists (select 1 from public.admission_applications where requested_grade_id = p_grade_id)
    or exists (select 1 from public.year_end_progressions where source_grade_id = p_grade_id)
  then
    raise exception 'Grade is already in use and cannot be deleted';
  end if;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (
    v_grade.tenant_id,
    v_grade.school_id,
    auth.uid(),
    'grade.deleted',
    'grade',
    p_grade_id,
    jsonb_build_object('grade_code', v_grade.grade_code, 'display_name', v_grade.display_name)
  );

  delete from public.grades where id = p_grade_id;
  return true;
end;
$$;

revoke all on function public.update_school_grade(uuid,text,text) from public, anon;
grant execute on function public.update_school_grade(uuid,text,text) to authenticated;
revoke all on function public.delete_school_grade(uuid) from public, anon;
grant execute on function public.delete_school_grade(uuid) to authenticated;
