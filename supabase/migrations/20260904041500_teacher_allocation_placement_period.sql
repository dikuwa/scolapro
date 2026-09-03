-- Teacher allocation lifecycle must remain inside the teacher's governed school
-- placement. This also exposes a dated allocation RPC for planned timetable handovers
-- while preserving the existing five-argument RPC for current allocations.

create or replace function app_private.staff_member_covers_school_period(
  p_staff_member_id uuid,
  p_school_id uuid,
  p_active_from date,
  p_active_to date
)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select p_active_from is not null
    and (p_active_to is null or p_active_to>=p_active_from)
    and exists(
      select 1
      from public.staff_members staff
      where staff.id=p_staff_member_id
        and staff.status='active'
        and (
          exists(
            select 1
            from public.staff_school_assignments ssa
            where ssa.staff_member_id=staff.id
              and ssa.school_id=p_school_id
              and ssa.tenant_id=staff.tenant_id
              and ssa.effective_from<=p_active_from
              and (
                (p_active_to is null and ssa.effective_to is null)
                or (p_active_to is not null and (ssa.effective_to is null or ssa.effective_to>=p_active_to))
              )
          )
          or exists(
            select 1
            from public.school_memberships sm
            where sm.staff_member_id=staff.id
              and sm.school_id=p_school_id
              and sm.tenant_id=staff.tenant_id
              and sm.active_from<=p_active_from
              and (
                (p_active_to is null and sm.active_to is null)
                or (p_active_to is not null and (sm.active_to is null or sm.active_to>=p_active_to))
              )
          )
        )
    );
$$;
revoke all on function app_private.staff_member_covers_school_period(uuid,uuid,date,date) from public,anon,authenticated;

create or replace function app_private.enforce_teacher_allocation_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path='pg_catalog','public'
as $$
declare
  v_school_tenant uuid;
  v_offering_tenant uuid;
  v_offering_school uuid;
  v_offering_year integer;
  v_class_tenant uuid;
  v_class_school uuid;
  v_class_year integer;
  v_staff_tenant uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.academic_year is distinct from old.academic_year
    or new.subject_offering_id is distinct from old.subject_offering_id
    or new.register_class_id is distinct from old.register_class_id
    or new.staff_member_id is distinct from old.staff_member_id
  ) then
    raise exception 'Teacher allocation tenant, school, year, offering, class, and staff identity are immutable';
  end if;

  if new.active_to is not null and new.active_to<new.active_from then
    raise exception 'Teacher allocation active-to date cannot precede active-from date';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Teacher allocation scope mismatch: school does not belong to tenant';
  end if;

  select so.tenant_id, so.school_id, so.academic_year
    into v_offering_tenant, v_offering_school, v_offering_year
  from public.subject_offerings so
  where so.id = new.subject_offering_id;

  if v_offering_tenant is null
     or v_offering_tenant <> new.tenant_id
     or v_offering_school <> new.school_id
     or v_offering_year <> new.academic_year then
    raise exception 'Teacher allocation scope mismatch: subject offering does not belong to school/year';
  end if;

  select rc.tenant_id, rc.school_id, rc.academic_year
    into v_class_tenant, v_class_school, v_class_year
  from public.register_classes rc
  where rc.id = new.register_class_id;

  if v_class_tenant is null
     or v_class_tenant <> new.tenant_id
     or v_class_school <> new.school_id
     or v_class_year <> new.academic_year then
    raise exception 'Teacher allocation scope mismatch: register class does not belong to school/year';
  end if;

  select sm.tenant_id into v_staff_tenant
  from public.staff_members sm
  where sm.id = new.staff_member_id;

  if v_staff_tenant is null or v_staff_tenant <> new.tenant_id then
    raise exception 'Teacher allocation scope mismatch: staff member does not belong to tenant';
  end if;

  -- Trusted bootstrap/history writes may not have request identity. Governed application
  -- writes always do, and must stay inside the teacher's effective school placement.
  if auth.uid() is not null and not app_private.staff_member_covers_school_period(
    new.staff_member_id,new.school_id,new.active_from,new.active_to
  ) then
    raise exception 'Teacher allocation period must be covered by an active staff school placement';
  end if;

  -- If this allocation already owns active timetable slots, changing its dates must not
  -- create a class/teacher/room overlap with another active slot at the same timetable
  -- position.
  if tg_op='UPDATE'
    and (new.active_from is distinct from old.active_from or new.active_to is distinct from old.active_to)
    and exists(
      select 1
      from public.timetable_slots owned
      join public.timetable_slots other
        on other.id<>owned.id
       and other.status='active'
       and other.school_id=owned.school_id
       and other.academic_year=owned.academic_year
       and other.cycle_code=owned.cycle_code
       and other.weekday=owned.weekday
       and other.period_id=owned.period_id
      join public.teacher_allocations other_allocation
        on other_allocation.id=other.teacher_allocation_id
      where owned.teacher_allocation_id=new.id
        and owned.status='active'
        and other_allocation.id<>new.id
        and other_allocation.active_from<=coalesce(new.active_to,'infinity'::date)
        and new.active_from<=coalesce(other_allocation.active_to,'infinity'::date)
        and (
          other.register_class_id=owned.register_class_id
          or other_allocation.staff_member_id=new.staff_member_id
          or (owned.room_id is not null and other.room_id=owned.room_id)
        )
    ) then
      raise exception 'Teacher allocation period change would create an overlapping timetable conflict' using errcode='23505';
  end if;

  return new;
end;
$$;

create or replace function public.create_teacher_allocation_period(
  p_school_id uuid,
  p_academic_year integer,
  p_subject_offering_id uuid,
  p_register_class_id uuid,
  p_staff_member_id uuid,
  p_active_from date,
  p_active_to date default null
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_tenant_id uuid;
  v_id uuid;
  v_existing_active_to date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_school_members(p_school_id) then raise exception 'Permission denied'; end if;
  if p_active_from is null then raise exception 'Teacher allocation start date is required'; end if;
  if p_active_to is not null and p_active_to<p_active_from then raise exception 'Teacher allocation end date cannot precede start date'; end if;

  select tenant_id into v_tenant_id from public.schools where id=p_school_id and status='active';
  if v_tenant_id is null then raise exception 'School not found or inactive'; end if;

  if not exists (
    select 1 from public.subject_offerings
    where id=p_subject_offering_id and school_id=p_school_id and academic_year=p_academic_year and status='active'
  ) then raise exception 'Subject offering is outside school/year scope'; end if;
  if not exists (
    select 1 from public.register_classes
    where id=p_register_class_id and school_id=p_school_id and academic_year=p_academic_year
  ) then raise exception 'Register class is outside school/year scope'; end if;

  if not app_private.staff_member_covers_school_period(
    p_staff_member_id,p_school_id,p_active_from,p_active_to
  ) then
    raise exception 'Staff member placement does not cover teacher allocation period';
  end if;

  insert into public.teacher_allocations(
    tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from,active_to
  ) values(
    v_tenant_id,p_school_id,p_academic_year,p_subject_offering_id,p_register_class_id,p_staff_member_id,p_active_from,p_active_to
  )
  on conflict(subject_offering_id,register_class_id,staff_member_id,active_from) do nothing
  returning id into v_id;

  if v_id is null then
    select id,active_to into v_id,v_existing_active_to
    from public.teacher_allocations
    where subject_offering_id=p_subject_offering_id
      and register_class_id=p_register_class_id
      and staff_member_id=p_staff_member_id
      and active_from=p_active_from;
    if v_id is null then raise exception 'Teacher allocation could not be resolved'; end if;
    if v_existing_active_to is distinct from p_active_to then
      raise exception 'Teacher allocation already exists with a different end date';
    end if;
  end if;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_tenant_id,p_school_id,auth.uid(),'timetable.teacher_allocation.saved','teacher_allocation',v_id,
    jsonb_build_object(
      'staff_member_id',p_staff_member_id,
      'subject_offering_id',p_subject_offering_id,
      'register_class_id',p_register_class_id,
      'academic_year',p_academic_year,
      'active_from',p_active_from,
      'active_to',p_active_to
    ));

  return v_id;
end;
$$;
revoke all on function public.create_teacher_allocation_period(uuid,integer,uuid,uuid,uuid,date,date) from public,anon;
grant execute on function public.create_teacher_allocation_period(uuid,integer,uuid,uuid,uuid,date,date) to authenticated;

-- Backward-compatible current allocation entry point. A finite current placement now
-- automatically bounds the allocation instead of leaving stale open-ended timetable
-- authority after the teacher departs.
create or replace function public.create_teacher_allocation(
  p_school_id uuid,
  p_academic_year integer,
  p_subject_offering_id uuid,
  p_register_class_id uuid,
  p_staff_member_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_active_to date;
begin
  select case when bool_or(p.end_on is null) then null else max(p.end_on) end
    into v_active_to
  from (
    select ssa.effective_to as end_on
    from public.staff_school_assignments ssa
    join public.staff_members staff on staff.id=ssa.staff_member_id
    where ssa.staff_member_id=p_staff_member_id
      and ssa.school_id=p_school_id
      and staff.status='active'
      and ssa.effective_from<=current_date
      and (ssa.effective_to is null or ssa.effective_to>=current_date)
    union all
    select sm.active_to as end_on
    from public.school_memberships sm
    join public.staff_members staff on staff.id=sm.staff_member_id
    where sm.staff_member_id=p_staff_member_id
      and sm.school_id=p_school_id
      and staff.status='active'
      and sm.active_from<=current_date
      and (sm.active_to is null or sm.active_to>=current_date)
  ) p;

  return public.create_teacher_allocation_period(
    p_school_id,p_academic_year,p_subject_offering_id,p_register_class_id,p_staff_member_id,
    current_date,v_active_to
  );
end;
$$;
revoke all on function public.create_teacher_allocation(uuid,integer,uuid,uuid,uuid) from public,anon;
grant execute on function public.create_teacher_allocation(uuid,integer,uuid,uuid,uuid) to authenticated;
