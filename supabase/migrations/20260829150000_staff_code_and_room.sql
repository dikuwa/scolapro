-- Staff code (short initial) and default teaching room for timetable display.
-- These are per-school-assignment values, not derived from legal name.

alter table public.staff_school_assignments
  add column if not exists staff_code text,
  add column if not exists default_room_id uuid references public.rooms(id) on delete set null;

create unique index if not exists staff_school_assignments_code_per_school_uidx
  on public.staff_school_assignments (school_id, lower(btrim(staff_code)))
  where staff_code is not null and btrim(staff_code) <> '' and effective_to is null;

comment on column public.staff_school_assignments.staff_code is
'Short school-assigned code or initial for timetable and internal use (e.g. MK). Not derived from legal name.';
comment on column public.staff_school_assignments.default_room_id is
'Default teaching room or base location for this staff assignment.';
