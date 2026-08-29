-- Prevent ambiguous duplicate staff rows inside one staged import and overlapping
-- placements for the same staff member at the same school.

create unique index if not exists import_rows_batch_employee_number_unique_idx
on public.import_rows(batch_id,upper(btrim(normalized_data->>'employee_number')))
where nullif(btrim(normalized_data->>'employee_number'),'') is not null;

create or replace function app_private.enforce_staff_school_assignment_overlap()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
begin
  if exists(
    select 1
    from public.staff_school_assignments existing
    where existing.school_id=new.school_id
      and existing.staff_member_id=new.staff_member_id
      and existing.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid)
      and daterange(existing.effective_from,coalesce(existing.effective_to,'infinity'::date),'[]')
          && daterange(new.effective_from,coalesce(new.effective_to,'infinity'::date),'[]')
  ) then
    raise exception 'Staff member already has an overlapping assignment at this school';
  end if;
  return new;
end;
$$;

drop trigger if exists staff_school_assignment_overlap_trg on public.staff_school_assignments;
create trigger staff_school_assignment_overlap_trg
before insert or update of school_id,staff_member_id,effective_from,effective_to
on public.staff_school_assignments
for each row execute function app_private.enforce_staff_school_assignment_overlap();

revoke all on function app_private.enforce_staff_school_assignment_overlap() from public,anon,authenticated;

comment on index public.import_rows_batch_employee_number_unique_idx is
'Prevents duplicate employee numbers within one staged batch before staff commit.';
