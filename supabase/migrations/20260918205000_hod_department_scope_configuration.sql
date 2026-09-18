-- Issue #478: configurable HOD responsibility configuration boundary.
--
-- The existing subject_department_responsibilities table remains the single
-- authorization source for HOD teaching review and, via #479,
-- teaching-plan authoring. This migration does not add a department authority
-- table or alter hod_responsible_for_subject/can_author_teaching_plan.
--
-- Configuration writes are narrowed to deterministic current-school leadership
-- (plus Platform Admin for platform governance). Platform Support and HODs do
-- not gain configuration authority. Responsibility identity/provenance is
-- immutable after insert; changes are represented by ending an effective-dated
-- row and creating another row, preserving historical scope.

drop policy if exists "school leaders manage subject department responsibilities"
  on public.subject_department_responsibilities;

drop policy if exists "current school leaders create subject department responsibilities"
  on public.subject_department_responsibilities;
create policy "current school leaders create subject department responsibilities"
on public.subject_department_responsibilities
for insert
to authenticated
with check (
  created_by_user_id = (select auth.uid())
  and (
    app_private.has_platform_role(array['platform_admin'])
    or (
      app_private.user_current_school_matches((select auth.uid()), school_id)
      and app_private.has_school_role(
        school_id,
        array['school_admin','principal','deputy_principal']
      )
    )
  )
);

drop policy if exists "current school leaders update subject department responsibilities"
  on public.subject_department_responsibilities;
create policy "current school leaders update subject department responsibilities"
on public.subject_department_responsibilities
for update
to authenticated
using (
  app_private.has_platform_role(array['platform_admin'])
  or (
    app_private.user_current_school_matches((select auth.uid()), school_id)
    and app_private.has_school_role(
      school_id,
      array['school_admin','principal','deputy_principal']
    )
  )
)
with check (
  app_private.has_platform_role(array['platform_admin'])
  or (
    app_private.user_current_school_matches((select auth.uid()), school_id)
    and app_private.has_school_role(
      school_id,
      array['school_admin','principal','deputy_principal']
    )
  )
);

-- Historical responsibility rows are not deletable through client RLS.
drop policy if exists "current school leaders delete subject department responsibilities"
  on public.subject_department_responsibilities;

create or replace function app_private.preserve_subject_department_responsibility_provenance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.tenant_id is distinct from old.tenant_id
     or new.school_id is distinct from old.school_id
     or new.subject_id is distinct from old.subject_id
     or new.department_head_staff_assignment_id is distinct from old.department_head_staff_assignment_id
     or new.effective_from is distinct from old.effective_from
     or new.created_by_user_id is distinct from old.created_by_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'HOD responsibility provenance is immutable; end the row and create a new responsibility'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function app_private.preserve_subject_department_responsibility_provenance()
  from public, anon, authenticated;

drop trigger if exists subject_department_responsibility_provenance_guard
  on public.subject_department_responsibilities;
create trigger subject_department_responsibility_provenance_guard
before update on public.subject_department_responsibilities
for each row execute function app_private.preserve_subject_department_responsibility_provenance();

comment on function app_private.preserve_subject_department_responsibility_provenance() is
'Issue #478: subject/HOD responsibility identity is append/end historical provenance. Only effective_to may change after insert; authorization continues to derive from subject_department_responsibilities and #479 planning predicates remain unchanged.';
