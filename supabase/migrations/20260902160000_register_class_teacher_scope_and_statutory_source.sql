create or replace function app_private.enforce_register_class_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_grade_tenant uuid;
  v_grade_school uuid;
  v_grade_year integer;
  v_staff_tenant uuid;
  v_year_start date;
  v_year_end date;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.grade_id is distinct from old.grade_id
    or new.academic_year is distinct from old.academic_year
  ) then
    raise exception 'Register class tenant, school, grade, and academic year are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id=new.school_id;
  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Register class scope mismatch: school does not belong to tenant';
  end if;

  select g.tenant_id,g.school_id,g.academic_year
  into v_grade_tenant,v_grade_school,v_grade_year
  from public.grades g
  where g.id=new.grade_id;
  if v_grade_tenant is null
     or v_grade_tenant <> new.tenant_id
     or v_grade_school <> new.school_id
     or v_grade_year <> new.academic_year then
    raise exception 'Register class scope mismatch: grade does not belong to tenant, school, and academic year';
  end if;

  if new.register_teacher_staff_id is not null then
    select sm.tenant_id into v_staff_tenant
    from public.staff_members sm
    where sm.id=new.register_teacher_staff_id;

    if v_staff_tenant is null or v_staff_tenant <> new.tenant_id then
      raise exception 'Register class teacher scope mismatch: staff member does not belong to tenant';
    end if;

    select coalesce(ay.starts_on,make_date(new.academic_year,1,1)),
           coalesce(ay.ends_on,make_date(new.academic_year,12,31))
    into v_year_start,v_year_end
    from public.academic_years ay
    where ay.school_id=new.school_id and ay.year=new.academic_year
    order by ay.created_at desc
    limit 1;

    v_year_start:=coalesce(v_year_start,make_date(new.academic_year,1,1));
    v_year_end:=coalesce(v_year_end,make_date(new.academic_year,12,31));

    if not exists(
      select 1
      from public.staff_school_assignments ssa
      where ssa.staff_member_id=new.register_teacher_staff_id
        and ssa.tenant_id=new.tenant_id
        and ssa.school_id=new.school_id
        and ssa.effective_from<=v_year_end
        and (ssa.effective_to is null or ssa.effective_to>=v_year_start)
    ) then
      raise exception 'Register class teacher scope mismatch: staff member has no school assignment overlapping the academic year';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_register_class_scope_integrity() from public,anon,authenticated;

drop trigger if exists register_class_scope_integrity_trg on public.register_classes;
create trigger register_class_scope_integrity_trg
before insert or update of tenant_id,school_id,grade_id,academic_year,register_teacher_staff_id
on public.register_classes
for each row execute function app_private.enforce_register_class_scope_integrity();

create or replace function app_private.build_register_class_teacher_statutory_source(
  p_school_id uuid,
  p_academic_year integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'classes',coalesce(jsonb_agg(jsonb_build_object(
      'class_id',x.class_id,
      'class_code',x.class_code,
      'class_name',x.class_name,
      'grade_id',x.grade_id,
      'grade_code',x.grade_code,
      'grade_name',x.grade_name,
      'register_teacher',case
        when x.staff_member_id is null then null
        else jsonb_build_object(
          'staff_member_id',x.staff_member_id,
          'employee_number',x.employee_number,
          'initials',x.initials,
          'first_name',x.first_name,
          'last_name',x.last_name
        )
      end
    ) order by x.grade_code,x.class_code),'[]'::jsonb),
    'total_classes',count(*)::integer,
    'assigned_classes',count(*) filter(where x.staff_member_id is not null)::integer,
    'unassigned_classes',count(*) filter(where x.staff_member_id is null)::integer
  )
  from (
    select
      rc.id class_id,
      rc.class_code,
      rc.display_name class_name,
      g.id grade_id,
      g.grade_code,
      g.display_name grade_name,
      sm.id staff_member_id,
      sm.employee_number,
      sm.initials,
      sm.first_name,
      sm.last_name
    from public.register_classes rc
    join public.grades g on g.id=rc.grade_id
    left join public.staff_members sm on sm.id=rc.register_teacher_staff_id
    where rc.school_id=p_school_id
      and rc.academic_year=p_academic_year
  ) x;
$$;

revoke all on function app_private.build_register_class_teacher_statutory_source(uuid,integer) from public,anon,authenticated;

create or replace function public.generate_statutory_snapshot(p_reporting_cycle_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_cycle public.statutory_reporting_cycles%rowtype;
  v_values jsonb;
  v_number integer;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_cycle from public.statutory_reporting_cycles where id=p_reporting_cycle_id for update;
  if not found then raise exception 'Reporting cycle not found'; end if;
  if not app_private.can_manage_statutory(v_cycle.school_id) then raise exception 'Permission denied'; end if;
  if v_cycle.status in ('certified','locked','submitted','archived') then
    raise exception 'Reporting cycle is no longer open for a new provisional snapshot';
  end if;

  v_values:=public.build_school_operational_snapshot(v_cycle.school_id,v_cycle.academic_year,v_cycle.reference_date);
  v_values:=jsonb_set(
    v_values,
    '{structure,register_class_teacher_source}',
    app_private.build_register_class_teacher_statutory_source(v_cycle.school_id,v_cycle.academic_year),
    true
  );

  select coalesce(max(snapshot_number),0)+1 into v_number
  from public.statutory_snapshots
  where reporting_cycle_id=v_cycle.id;

  insert into public.statutory_snapshots(
    tenant_id,school_id,reporting_cycle_id,snapshot_number,values,source_summary,generated_by_user_id,status
  ) values(
    v_cycle.tenant_id,v_cycle.school_id,v_cycle.id,v_number,v_values,
    jsonb_build_object(
      'generator','school-operational-v2',
      'generated_from','live_operational_tables',
      'reference_date',v_cycle.reference_date,
      'includes',jsonb_build_array('register_class_teacher_source')
    ),
    auth.uid(),'provisional'
  ) returning id into v_id;

  update public.statutory_reporting_cycles
  set status='review',updated_at=now()
  where id=v_cycle.id and status='open';

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_cycle.tenant_id,v_cycle.school_id,auth.uid(),'statutory.snapshot.generated','statutory_snapshot',v_id,
    jsonb_build_object(
      'reporting_cycle_id',v_cycle.id,
      'snapshot_number',v_number,
      'reference_date',v_cycle.reference_date,
      'source_generator','school-operational-v2'
    )
  );
  return v_id;
end;
$$;

revoke all on function public.generate_statutory_snapshot(uuid) from public,anon;
grant execute on function public.generate_statutory_snapshot(uuid) to authenticated;

comment on function app_private.build_register_class_teacher_statutory_source(uuid,integer) is
  'Private statutory source for configured register-class teacher identity and missing-assignment counts. Teacher contact, ID and signatures remain outside this source until governed staff data exists.';
comment on function public.generate_statutory_snapshot(uuid) is
  'Creates a numbered provisional statutory snapshot from fixed-reference operational facts, including register-class teacher assignment readiness, without re-entering known data.';
