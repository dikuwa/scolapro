create or replace function app_private.user_can_manage_assessment_instance_scope(
  p_user_id uuid,
  p_school_id uuid,
  p_academic_year integer,
  p_subject_offering_id uuid,
  p_register_class_id uuid,
  p_teacher_allocation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.user_is_academic_leader(p_user_id, p_school_id)
    or exists(
      select 1
      from public.school_memberships sm
      join public.staff_members staff
        on staff.id = sm.staff_member_id
      join public.teacher_allocations ta
        on ta.id = p_teacher_allocation_id
       and ta.staff_member_id = staff.id
       and ta.school_id = p_school_id
       and ta.academic_year = p_academic_year
       and ta.subject_offering_id = p_subject_offering_id
       and ta.register_class_id = p_register_class_id
       and ta.active_from <= current_date
       and (ta.active_to is null or ta.active_to >= current_date)
      where sm.school_id = p_school_id
        and sm.user_id = p_user_id
        and sm.role_key in ('teacher','class_teacher')
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
        and staff.status = 'active'
    );
$$;

revoke all on function app_private.user_can_manage_assessment_instance_scope(uuid,uuid,integer,uuid,uuid,uuid)
  from public, anon, authenticated;

comment on function app_private.user_can_manage_assessment_instance_scope(uuid,uuid,integer,uuid,uuid,uuid) is
'Arbitrary-user mirror of assessment-instance management authority for physical creator-provenance validation.';

create or replace function app_private.enforce_assessment_instance_creator_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'UPDATE'
     and new.created_by_user_id is distinct from old.created_by_user_id then
    raise exception 'Assessment instance creator provenance is immutable';
  end if;

  if auth.uid() is not null
     and tg_op = 'INSERT'
     and new.created_by_user_id is distinct from auth.uid() then
    raise exception 'Assessment instance creator must match authenticated actor';
  end if;

  if not app_private.user_can_manage_assessment_instance_scope(
    new.created_by_user_id,
    new.school_id,
    new.academic_year,
    new.subject_offering_id,
    new.register_class_id,
    new.teacher_allocation_id
  ) then
    raise exception 'Assessment instance creator is not authorized for scope';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_assessment_instance_creator_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_assessment_instance_creator_integrity() is
'Prevents trusted or authenticated writes from crediting assessment instances to users who lack the academic-leader or exact teacher-allocation authority required for that instance.';

drop trigger if exists assessment_instance_creator_integrity_trg on public.assessment_instances;
create trigger assessment_instance_creator_integrity_trg
before insert or update of created_by_user_id
on public.assessment_instances
for each row execute function app_private.enforce_assessment_instance_creator_integrity();