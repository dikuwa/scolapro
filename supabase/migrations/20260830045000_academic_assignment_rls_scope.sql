-- Relationship-aware academic access must hold at the table boundary as well as RPCs.
-- Teachers may work only inside their active subject/class allocations. Leadership/HOD
-- keeps the existing oversight scope until department ownership is modelled explicitly.

create or replace function app_private.can_manage_assessment_instance_scope(
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
set search_path=public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal','hod'])
    or exists(
      select 1
      from public.school_memberships sm
      join public.staff_members staff on staff.id=sm.staff_member_id
      join public.teacher_allocations ta
        on ta.id=p_teacher_allocation_id
       and ta.staff_member_id=staff.id
       and ta.school_id=p_school_id
       and ta.academic_year=p_academic_year
       and ta.subject_offering_id=p_subject_offering_id
       and ta.register_class_id=p_register_class_id
       and ta.active_from<=current_date
       and (ta.active_to is null or ta.active_to>=current_date)
      where sm.school_id=p_school_id
        and sm.user_id=(select auth.uid())
        and sm.role_key in ('teacher','class_teacher')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
        and staff.status='active'
    );
$$;

revoke all on function app_private.can_manage_assessment_instance_scope(uuid,integer,uuid,uuid,uuid) from public,anon;
grant execute on function app_private.can_manage_assessment_instance_scope(uuid,integer,uuid,uuid,uuid) to authenticated;

create or replace function app_private.enforce_assessment_instance_allocation_scope()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_allocation public.teacher_allocations%rowtype;
begin
  if new.teacher_allocation_id is not null then
    select * into v_allocation
    from public.teacher_allocations
    where id=new.teacher_allocation_id;
    if not found then raise exception 'Teacher allocation does not exist'; end if;
    if v_allocation.tenant_id<>new.tenant_id
       or v_allocation.school_id<>new.school_id
       or v_allocation.academic_year<>new.academic_year
       or v_allocation.subject_offering_id<>new.subject_offering_id
       or v_allocation.register_class_id<>new.register_class_id then
      raise exception 'Assessment instance scope must match teacher allocation';
    end if;
  end if;
  if tg_op='UPDATE' and new.created_by_user_id is distinct from old.created_by_user_id then
    raise exception 'Assessment instance creator provenance is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists assessment_instance_allocation_scope_trg on public.assessment_instances;
create trigger assessment_instance_allocation_scope_trg
before insert or update on public.assessment_instances
for each row execute function app_private.enforce_assessment_instance_allocation_scope();

revoke all on function app_private.enforce_assessment_instance_allocation_scope() from public,anon,authenticated;

-- Replace the split policies with relationship-aware checks for the NEW row too.
drop policy if exists "academic staff can manage accessible assessment instances [insert]" on public.assessment_instances;
drop policy if exists "academic staff can manage accessible assessment instances [update]" on public.assessment_instances;

create policy "scoped academic staff insert assessment instances"
on public.assessment_instances for insert to authenticated
with check (
  created_by_user_id=(select auth.uid())
  and app_private.can_manage_assessment_instance_scope(
    school_id,academic_year,subject_offering_id,register_class_id,teacher_allocation_id
  )
);

create policy "scoped academic staff update assessment instances"
on public.assessment_instances for update to authenticated
using (app_private.can_access_assessment_instance(id))
with check (
  app_private.can_manage_assessment_instance_scope(
    school_id,academic_year,subject_offering_id,register_class_id,teacher_allocation_id
  )
);

comment on function app_private.can_manage_assessment_instance_scope(uuid,integer,uuid,uuid,uuid) is
'Assessment-instance mutation scope: Platform Admin or school academic leadership/HOD, otherwise an active teacher/class-teacher whose exact teacher allocation matches school, year, subject offering and register class.';

-- Official subject results contain learner-specific academic outcomes. Reference
-- configuration may be school-wide readable, but result rows are relationship-scoped.
create or replace function app_private.can_read_official_result(
  p_school_id uuid,
  p_enrolment_id uuid,
  p_subject_offering_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal','hod'])
    or exists(
      select 1
      from public.enrolments e
      join public.school_memberships sm on sm.school_id=e.school_id
      join public.staff_members staff on staff.id=sm.staff_member_id
      join public.teacher_allocations ta
        on ta.staff_member_id=staff.id
       and ta.school_id=e.school_id
       and ta.academic_year=e.academic_year
       and ta.register_class_id=e.register_class_id
       and ta.subject_offering_id=p_subject_offering_id
       and ta.active_from<=current_date
       and (ta.active_to is null or ta.active_to>=current_date)
      where e.id=p_enrolment_id
        and e.school_id=p_school_id
        and sm.user_id=(select auth.uid())
        and sm.role_key in ('teacher','class_teacher')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
        and staff.status='active'
    );
$$;

revoke all on function app_private.can_read_official_result(uuid,uuid,uuid) from public,anon;
grant execute on function app_private.can_read_official_result(uuid,uuid,uuid) to authenticated;

drop policy if exists "academic staff can read official results" on public.official_results;
drop policy if exists "scoped academic staff read official results" on public.official_results;
create policy "scoped academic staff read official results"
on public.official_results for select to authenticated
using (app_private.can_read_official_result(school_id,enrolment_id,subject_offering_id));

comment on policy "scoped academic staff read official results" on public.official_results is
'Learner-specific official results are visible to academic leadership/HOD or the teacher/class-teacher actively allocated to that exact learner class and subject offering.';
