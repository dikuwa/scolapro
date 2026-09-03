-- Teacher allocations are validated when created, but their authoritative staff
-- placement can change later. Prevent placement/status mutations from leaving current or
-- future allocations operationally orphaned while preserving ended historical records.

create or replace function app_private.assert_live_teacher_allocations_covered(
  p_staff_member_id uuid,
  p_school_id uuid
)
returns void
language plpgsql
security definer
set search_path=public,app_private
as $$
begin
  if p_staff_member_id is null or p_school_id is null then
    return;
  end if;

  if exists(
    select 1
    from public.teacher_allocations ta
    where ta.staff_member_id=p_staff_member_id
      and ta.school_id=p_school_id
      and (ta.active_to is null or ta.active_to>=current_date)
      and not app_private.staff_member_covers_school_period(
        ta.staff_member_id,ta.school_id,ta.active_from,ta.active_to
      )
  ) then
    raise exception 'Staff placement change would leave a current or future teacher allocation uncovered';
  end if;
end;
$$;
revoke all on function app_private.assert_live_teacher_allocations_covered(uuid,uuid) from public,anon,authenticated;

create or replace function app_private.revalidate_teacher_allocations_after_staff_assignment_change()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
begin
  perform app_private.assert_live_teacher_allocations_covered(old.staff_member_id,old.school_id);
  return coalesce(new,old);
end;
$$;

create or replace function app_private.revalidate_teacher_allocations_after_membership_change()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
begin
  if old.staff_member_id is not null then
    perform app_private.assert_live_teacher_allocations_covered(old.staff_member_id,old.school_id);
  end if;
  return coalesce(new,old);
end;
$$;

create or replace function app_private.prevent_staff_deactivation_with_live_teacher_allocations()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
begin
  if old.status='active' and new.status<>'active' and exists(
    select 1
    from public.teacher_allocations ta
    where ta.staff_member_id=new.id
      and (ta.active_to is null or ta.active_to>=current_date)
  ) then
    raise exception 'Staff member cannot be deactivated while current or future teacher allocations remain';
  end if;
  return new;
end;
$$;

drop trigger if exists teacher_allocation_staff_assignment_revalidation_trg on public.staff_school_assignments;
create trigger teacher_allocation_staff_assignment_revalidation_trg
after update of school_id,staff_member_id,effective_from,effective_to or delete
on public.staff_school_assignments
for each row execute function app_private.revalidate_teacher_allocations_after_staff_assignment_change();

drop trigger if exists teacher_allocation_membership_revalidation_trg on public.school_memberships;
create trigger teacher_allocation_membership_revalidation_trg
after update of school_id,staff_member_id,active_from,active_to or delete
on public.school_memberships
for each row execute function app_private.revalidate_teacher_allocations_after_membership_change();

drop trigger if exists teacher_allocation_staff_status_revalidation_trg on public.staff_members;
create trigger teacher_allocation_staff_status_revalidation_trg
before update of status on public.staff_members
for each row execute function app_private.prevent_staff_deactivation_with_live_teacher_allocations();
