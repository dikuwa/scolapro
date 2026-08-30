-- Give school administrators a safe correction path for subject names/codes.
-- Unused mistakes can be deleted; referenced subjects are archived so historical
-- offerings, allocations, timetable slots, assessment and result chains remain intact.

create or replace function public.upsert_school_subject(
  p_school_id uuid,
  p_subject_code text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_tenant_id uuid;
  v_subject_id uuid;
  v_code text := upper(btrim(coalesce(p_subject_code, '')));
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_school_members(p_school_id) then raise exception 'Permission denied'; end if;
  if v_code = '' then raise exception 'Subject code is required'; end if;
  if v_name = '' then raise exception 'Subject name is required'; end if;

  select tenant_id into v_tenant_id
  from public.schools
  where id = p_school_id and status = 'active';
  if v_tenant_id is null then raise exception 'School not found or inactive'; end if;

  if exists(
    select 1 from public.subjects s
    where s.school_id = p_school_id
      and s.status = 'active'
      and lower(btrim(s.display_name)) = lower(v_name)
      and upper(btrim(s.subject_code)) <> v_code
  ) then
    raise exception 'An active subject with this name already exists';
  end if;

  insert into public.subjects (tenant_id, school_id, subject_code, display_name)
  values (v_tenant_id, p_school_id, v_code, v_name)
  on conflict (school_id, subject_code) do update
  set display_name = excluded.display_name,
      status = 'active',
      updated_at = now()
  returning id into v_subject_id;

  return v_subject_id;
end;
$$;

revoke all on function public.upsert_school_subject(uuid,text,text) from public, anon;
grant execute on function public.upsert_school_subject(uuid,text,text) to authenticated;

create or replace function public.update_school_subject(
  p_subject_id uuid,
  p_subject_code text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_subject public.subjects%rowtype;
  v_code text := upper(btrim(coalesce(p_subject_code, '')));
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_subject
  from public.subjects
  where id = p_subject_id
  for update;
  if not found then raise exception 'Subject not found'; end if;
  if not app_private.can_manage_school_members(v_subject.school_id) then raise exception 'Permission denied'; end if;
  if v_code = '' then raise exception 'Subject code is required'; end if;
  if v_name = '' then raise exception 'Subject name is required'; end if;

  if exists(
    select 1 from public.subjects s
    where s.school_id = v_subject.school_id
      and s.id <> v_subject.id
      and upper(btrim(s.subject_code)) = v_code
  ) then
    raise exception 'Subject code is already in use';
  end if;

  if exists(
    select 1 from public.subjects s
    where s.school_id = v_subject.school_id
      and s.id <> v_subject.id
      and s.status = 'active'
      and lower(btrim(s.display_name)) = lower(v_name)
  ) then
    raise exception 'An active subject with this name already exists';
  end if;

  update public.subjects
  set subject_code = v_code,
      display_name = v_name,
      updated_at = now()
  where id = v_subject.id;

  return v_subject.id;
end;
$$;

revoke all on function public.update_school_subject(uuid,text,text) from public, anon;
grant execute on function public.update_school_subject(uuid,text,text) to authenticated;

create or replace function public.retire_school_subject(p_subject_id uuid)
returns text
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_subject public.subjects%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_subject
  from public.subjects
  where id = p_subject_id
  for update;
  if not found then raise exception 'Subject not found'; end if;
  if not app_private.can_manage_school_members(v_subject.school_id) then raise exception 'Permission denied'; end if;

  if exists(select 1 from public.subject_offerings so where so.subject_id = v_subject.id) then
    update public.subjects
    set status = 'archived', updated_at = now()
    where id = v_subject.id;
    return 'archived';
  end if;

  delete from public.subjects where id = v_subject.id;
  return 'deleted';
end;
$$;

revoke all on function public.retire_school_subject(uuid) from public, anon;
grant execute on function public.retire_school_subject(uuid) to authenticated;

comment on function public.update_school_subject(uuid,text,text) is
'Corrects a school subject code/name in place while preserving its stable ID and all downstream academic history. Rejects duplicate code or active display name conflicts.';
comment on function public.retire_school_subject(uuid) is
'Deletes a subject only when it has never been offered. Referenced subjects are archived instead so academic and timetable history remains intact.';
