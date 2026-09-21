alter table public.lesson_preparations
  add column if not exists offline_client_mutation_id uuid;

create unique index if not exists lesson_preparations_offline_mutation_idx
  on public.lesson_preparations(offline_client_mutation_id)
  where offline_client_mutation_id is not null;

create or replace function public.save_lesson_preparation_offline_draft(
  p_schedule_id uuid,
  p_preparation jsonb,
  p_curriculum_snapshot jsonb,
  p_client_mutation_id uuid,
  p_expected_updated_at timestamptz default null
)
returns table(lesson_preparation_id uuid, preparation_status text, preparation_updated_at timestamptz, replayed boolean)
language plpgsql security definer
set search_path = pg_catalog, public, app_private, auth
as $$
declare
  v_schedule public.teaching_schedule_items%rowtype;
  v_existing public.lesson_preparations%rowtype;
  v_lesson_date date;
begin
  if auth.uid() is null or p_client_mutation_id is null then
    raise exception 'Authentication and mutation identity are required';
  end if;
  select * into v_schedule from public.teaching_schedule_items where id = p_schedule_id for share;
  if not found then raise exception 'The scheduled lesson is no longer available'; end if;
  v_lesson_date := coalesce(v_schedule.moved_to_date, v_schedule.planned_on);
  if not app_private.user_current_school_matches(auth.uid(), v_schedule.school_id)
     or not exists (
       select 1
       from public.teacher_allocations ta
       join public.staff_members st on st.id = ta.staff_member_id and st.user_id = auth.uid() and st.status = 'active'
       join public.school_memberships sm on sm.school_id = ta.school_id and sm.staff_member_id = ta.staff_member_id
         and sm.user_id = auth.uid() and sm.role_key in ('teacher','class_teacher')
         and sm.active_from <= current_date and (sm.active_to is null or sm.active_to >= current_date)
       where ta.id = v_schedule.teacher_allocation_id
         and ta.tenant_id = v_schedule.tenant_id and ta.school_id = v_schedule.school_id
         and ta.active_from <= v_lesson_date and (ta.active_to is null or ta.active_to >= v_lesson_date)
     ) then
    raise exception 'Current teacher allocation authority is required';
  end if;
  select * into v_existing from public.lesson_preparations
    where teaching_schedule_item_id = p_schedule_id for update;
  if v_existing.id is not null and v_existing.offline_client_mutation_id = p_client_mutation_id then
    if v_existing.preparation is distinct from coalesce(p_preparation, '{}'::jsonb) then
      raise exception 'Client mutation ID was already used with different lesson preparation data';
    end if;
    return query select v_existing.id, v_existing.status, v_existing.updated_at, true;
    return;
  end if;
  if v_existing.id is not null and v_existing.status <> 'draft' then
    raise exception 'This preparation is no longer an editable draft';
  end if;
  if v_existing.id is not null and (p_expected_updated_at is null or v_existing.updated_at is distinct from p_expected_updated_at) then
    raise exception 'The server draft changed while this device was offline';
  end if;
  if v_existing.id is null then
    insert into public.lesson_preparations(
      tenant_id, school_id, teaching_schedule_item_id, planned_on, curriculum_snapshot,
      preparation, status, prepared_by_user_id, offline_client_mutation_id
    ) values (
      v_schedule.tenant_id, v_schedule.school_id, v_schedule.id, v_lesson_date,
      coalesce(p_curriculum_snapshot, '{}'::jsonb), coalesce(p_preparation, '{}'::jsonb),
      'draft', auth.uid(), p_client_mutation_id
    ) returning id, status, updated_at into lesson_preparation_id, preparation_status, preparation_updated_at;
  else
    update public.lesson_preparations
       set preparation = coalesce(p_preparation, '{}'::jsonb),
           offline_client_mutation_id = p_client_mutation_id,
           updated_at = now()
     where id = v_existing.id
     returning id, status, updated_at into lesson_preparation_id, preparation_status, preparation_updated_at;
  end if;
  replayed := false;
  return next;
end;
$$;

revoke all on function public.save_lesson_preparation_offline_draft(uuid,jsonb,jsonb,uuid,timestamptz) from public, anon;
grant execute on function public.save_lesson_preparation_offline_draft(uuid,jsonb,jsonb,uuid,timestamptz) to authenticated;