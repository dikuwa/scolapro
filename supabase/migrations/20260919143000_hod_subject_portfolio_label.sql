-- Issue #574: grouped HOD subject portfolios remain descriptive metadata over
-- the existing effective-dated subject responsibility authority.

alter table public.subject_department_responsibilities
  add column if not exists department_label text;

alter table public.subject_department_responsibilities
  drop constraint if exists subject_department_responsibilities_department_label_check;

alter table public.subject_department_responsibilities
  add constraint subject_department_responsibilities_department_label_check
  check (department_label is null or char_length(btrim(department_label)) between 1 and 120);

comment on column public.subject_department_responsibilities.department_label is
'Optional school-defined descriptive portfolio label. It never replaces subject-based HOD authorization.';

-- The earlier provenance guard predates department_label and rejects every
-- update except effective_to. Keep identity/provenance immutable while allowing
-- the descriptive label to be edited by the grouped portfolio save.
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

comment on function app_private.preserve_subject_department_responsibility_provenance() is
'Subject/HOD/school/tenant/effective-from/creator provenance remains immutable. effective_to may change to end responsibility, and department_label may change because it is descriptive metadata only. Subject responsibility remains the authorization source.';

create or replace function public.save_hod_subject_portfolio(
  p_school_id uuid,
  p_subject_ids uuid[],
  p_assignment_id uuid,
  p_department_label text,
  p_effective_from date,
  p_effective_to date
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $$
declare
  v_school public.schools%rowtype;
  v_assignment public.staff_school_assignments%rowtype;
  v_subject_count integer;
  v_requested_count integer;
  v_label text := nullif(btrim(p_department_label), '');
begin
  if not app_private.user_current_school_matches(auth.uid(), p_school_id)
     or not app_private.has_school_role(p_school_id, array['school_admin','principal','deputy_principal']) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  if p_subject_ids is null or cardinality(p_subject_ids) = 0 then
    raise exception 'At least one subject is required' using errcode = '22023';
  end if;
  if p_effective_to is not null and p_effective_to < p_effective_from then
    raise exception 'The end date cannot be before the start date' using errcode = '22023';
  end if;
  if v_label is not null and char_length(v_label) > 120 then
    raise exception 'The portfolio label is too long' using errcode = '22023';
  end if;

  select * into v_school
  from public.schools
  where id = p_school_id;
  if v_school.id is null then
    raise exception 'School not found' using errcode = '23503';
  end if;

  select * into v_assignment
  from public.staff_school_assignments
  where id = p_assignment_id
    and school_id = p_school_id
    and tenant_id = v_school.tenant_id;
  if v_assignment.id is null
     or v_assignment.effective_from > p_effective_from
     or (v_assignment.effective_to is not null and v_assignment.effective_to < p_effective_from)
     or not exists (
       select 1
       from public.school_memberships sm
       where sm.school_id = p_school_id
         and sm.staff_member_id = v_assignment.staff_member_id
         and sm.role_key = 'hod'
         and sm.active_from <= p_effective_from
         and (sm.active_to is null or sm.active_to >= p_effective_from)
     ) then
    raise exception 'The selected staff placement is not an effective HOD placement' using errcode = '22023';
  end if;

  select count(*) into v_requested_count
  from (select distinct subject_id from unnest(p_subject_ids) subject_id) requested;

  select count(*) into v_subject_count
  from public.subjects s
  where s.school_id = p_school_id
    and s.tenant_id = v_school.tenant_id
    and s.id = any(p_subject_ids);
  if v_subject_count <> v_requested_count then
    raise exception 'One or more subjects are outside the current school' using errcode = '42501';
  end if;

  insert into public.subject_department_responsibilities(
    tenant_id, school_id, subject_id, department_head_staff_assignment_id,
    department_label, effective_from, effective_to, created_by_user_id
  )
  select
    v_school.tenant_id, p_school_id, subject_id, p_assignment_id,
    v_label, p_effective_from, p_effective_to, auth.uid()
  from (select distinct subject_id from unnest(p_subject_ids) subject_id) requested
  on conflict (school_id, subject_id, department_head_staff_assignment_id, effective_from)
  do update set
    department_label = excluded.department_label,
    effective_to = excluded.effective_to,
    updated_at = now();
end;
$$;

revoke all on function public.save_hod_subject_portfolio(uuid,uuid[],uuid,text,date,date)
  from public, anon;
grant execute on function public.save_hod_subject_portfolio(uuid,uuid[],uuid,text,date,date)
  to authenticated;

comment on function public.save_hod_subject_portfolio(uuid,uuid[],uuid,text,date,date) is
'Atomic grouped HOD portfolio save. Subject_department_responsibilities remains the effective-dated authorization source; the optional label is descriptive only.';
