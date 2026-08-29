-- Staff code (short initial) and default teaching room for timetable display.
-- These are per-school-assignment values, not derived from legal name.

alter table public.staff_school_assignments
  add column if not exists staff_code text,
  add column if not exists default_room_id uuid references public.school_rooms(id) on delete set null;

create unique index if not exists staff_school_assignments_code_per_school_uidx
  on public.staff_school_assignments (school_id, lower(btrim(staff_code)))
  where staff_code is not null and btrim(staff_code) <> '' and effective_to is null;

create index if not exists staff_school_assignments_default_room_idx
  on public.staff_school_assignments(default_room_id)
  where default_room_id is not null;

create or replace function app_private.enforce_staff_default_room_scope()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_school_id uuid;
begin
  if new.default_room_id is null then
    return new;
  end if;

  select school_id into v_school_id
  from public.school_rooms
  where id=new.default_room_id;

  if v_school_id is null or v_school_id<>new.school_id then
    raise exception 'Default room must belong to the same school as the staff assignment.' using errcode='23514';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_staff_default_room_scope() from public,anon,authenticated;
drop trigger if exists staff_school_assignments_default_room_scope on public.staff_school_assignments;
create trigger staff_school_assignments_default_room_scope
before insert or update of default_room_id,school_id
on public.staff_school_assignments
for each row execute function app_private.enforce_staff_default_room_scope();

comment on column public.staff_school_assignments.staff_code is
'Short school-assigned code or initial for timetable and internal use (e.g. MK). Not derived from legal name.';
comment on column public.staff_school_assignments.default_room_id is
'Default teaching room or base location for this staff assignment, constrained to the same school.';
