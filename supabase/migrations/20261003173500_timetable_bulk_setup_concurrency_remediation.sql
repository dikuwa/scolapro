-- Issue #1035 post-merge remediation.
-- Existing subject offerings and historical teacher-allocation overlaps are
-- preserved. New bulk writes are duplicate-safe and overlap-aware.

create or replace function public.bulk_create_subject_offerings(
  p_school_id uuid,
  p_academic_year integer,
  p_subject_ids uuid[],
  p_grade_ids uuid[],
  p_periods_per_cycle smallint
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $bulk_subject_offerings$
declare
  v_tenant_id uuid;
  v_subject_ids uuid[];
  v_grade_ids uuid[];
  v_subject_id uuid;
  v_grade_id uuid;
  v_existing_id uuid;
  v_created integer:=0;
  v_existing integer:=0;
  v_requested integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_school_members(p_school_id) then raise exception 'Permission denied'; end if;
  if p_academic_year<2000 or p_academic_year>2200 then raise exception 'Academic year is invalid'; end if;
  if p_periods_per_cycle is null or p_periods_per_cycle<1 or p_periods_per_cycle>30 then
    raise exception 'Periods per cycle must be between 1 and 30';
  end if;

  select s.tenant_id into v_tenant_id
  from public.schools s
  where s.id=p_school_id and s.status='active';
  if v_tenant_id is null then raise exception 'School not found or inactive'; end if;

  select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into v_subject_ids
  from unnest(coalesce(p_subject_ids,'{}'::uuid[])) x where x is not null;
  select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into v_grade_ids
  from unnest(coalesce(p_grade_ids,'{}'::uuid[])) x where x is not null;

  if cardinality(v_subject_ids)=0 then raise exception 'Choose at least one subject'; end if;
  if cardinality(v_grade_ids)=0 then raise exception 'Choose at least one grade'; end if;
  v_requested:=cardinality(v_subject_ids)*cardinality(v_grade_ids);
  if v_requested>200 then raise exception 'Bulk offering selection exceeds the 200-combination safety limit'; end if;

  if (select count(*) from public.subjects s where s.id=any(v_subject_ids) and s.school_id=p_school_id and s.status='active')
     <>cardinality(v_subject_ids) then
    raise exception 'Subject selection is outside school scope';
  end if;
  if (select count(*) from public.grades g where g.id=any(v_grade_ids) and g.school_id=p_school_id and g.academic_year=p_academic_year)
     <>cardinality(v_grade_ids) then
    raise exception 'Grade selection is outside school/year scope';
  end if;

  foreach v_subject_id in array v_subject_ids loop
    foreach v_grade_id in array v_grade_ids loop
      insert into public.subject_offerings(
        tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle
      ) values(
        v_tenant_id,p_school_id,p_academic_year,v_subject_id,v_grade_id,p_periods_per_cycle
      )
      on conflict (school_id,academic_year,subject_id,grade_id) do nothing
      returning id into v_existing_id;

      if found then
        v_created:=v_created+1;
      else
        v_existing:=v_existing+1;
      end if;
      v_existing_id:=null;
    end loop;
  end loop;

  return jsonb_build_object('requested',v_requested,'created',v_created,'existing',v_existing);
end;
$bulk_subject_offerings$;

revoke all on function public.bulk_create_subject_offerings(
  uuid,integer,uuid[],uuid[],smallint
) from public,anon;
grant execute on function public.bulk_create_subject_offerings(
  uuid,integer,uuid[],uuid[],smallint
) to authenticated;

comment on function public.bulk_create_subject_offerings(
  uuid,integer,uuid[],uuid[],smallint
) is
'Transactional subject x grade bulk setup. Creation is atomic with ON CONFLICT DO NOTHING; existing combinations of any status are reported and never reactivated or rewritten, including under concurrent requests.';

create or replace function public.bulk_create_teacher_allocations(
  p_school_id uuid,
  p_academic_year integer,
  p_subject_offering_ids uuid[],
  p_register_class_ids uuid[],
  p_teaching_group_ids uuid[],
  p_staff_member_id uuid,
  p_active_from date,
  p_active_to date default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $bulk_teacher_allocations$
declare
  v_tenant_id uuid;
  v_offering_ids uuid[];
  v_class_ids uuid[];
  v_group_ids uuid[];
  v_offering record;
  v_class record;
  v_group record;
  v_existing_id uuid;
  v_existing_start date;
  v_existing_end date;
  v_allocation record;
  v_allocation_id uuid;
  v_link_id uuid;
  v_link_from date;
  v_link_to date;
  v_group_had_allocation boolean;
  v_requested integer;
  v_created integer:=0;
  v_duplicates integer:=0;
  v_conflicts integer:=0;
  v_incompatible integer:=0;
  v_group_links_created integer:=0;
  v_group_links_existing integer:=0;
  v_group_link_conflicts integer:=0;
  v_groups_without_allocations integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_school_members(p_school_id) then raise exception 'Permission denied'; end if;
  if p_academic_year<2000 or p_academic_year>2200 then raise exception 'Academic year is invalid'; end if;
  if p_active_from is null then raise exception 'Teacher allocation start date is required'; end if;
  if p_active_to is not null and p_active_to<p_active_from then raise exception 'Teacher allocation end date cannot precede start date'; end if;

  select s.tenant_id into v_tenant_id from public.schools s where s.id=p_school_id and s.status='active';
  if v_tenant_id is null then raise exception 'School not found or inactive'; end if;

  select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into v_offering_ids
  from unnest(coalesce(p_subject_offering_ids,'{}'::uuid[])) x where x is not null;
  select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into v_class_ids
  from unnest(coalesce(p_register_class_ids,'{}'::uuid[])) x where x is not null;
  select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into v_group_ids
  from unnest(coalesce(p_teaching_group_ids,'{}'::uuid[])) x where x is not null;

  if cardinality(v_offering_ids)=0 then raise exception 'Choose at least one subject offering'; end if;
  if cardinality(v_class_ids)=0 then raise exception 'Choose at least one register class'; end if;
  v_requested:=cardinality(v_offering_ids)*cardinality(v_class_ids);
  if v_requested>300 then raise exception 'Bulk teacher allocation selection exceeds the 300-combination safety limit'; end if;

  if (select count(*) from public.subject_offerings so
      where so.id=any(v_offering_ids) and so.school_id=p_school_id
        and so.academic_year=p_academic_year and so.status='active')<>cardinality(v_offering_ids) then
    raise exception 'Subject offering selection is outside school/year scope';
  end if;
  if (select count(*) from public.register_classes rc
      where rc.id=any(v_class_ids) and rc.school_id=p_school_id
        and rc.academic_year=p_academic_year)<>cardinality(v_class_ids) then
    raise exception 'Register class selection is outside school/year scope';
  end if;
  if not app_private.staff_member_covers_school_period(p_staff_member_id,p_school_id,p_active_from,p_active_to) then
    raise exception 'Staff member placement does not cover teacher allocation period';
  end if;

  if cardinality(v_group_ids)>0 then
    if (select count(*) from public.teaching_groups tg
        where tg.id=any(v_group_ids) and tg.school_id=p_school_id
          and tg.academic_year=p_academic_year and tg.status='active')<>cardinality(v_group_ids) then
      raise exception 'Teaching group selection is outside school/year scope';
    end if;
    if exists(select 1 from public.teaching_groups tg
              where tg.id=any(v_group_ids) and not (tg.subject_offering_id=any(v_offering_ids))) then
      raise exception 'Teaching group selection must match the selected subject offerings';
    end if;
  end if;

  for v_offering in
    select so.id,so.grade_id from public.subject_offerings so
    where so.id=any(v_offering_ids) order by so.id
  loop
    for v_class in
      select rc.id,rc.grade_id from public.register_classes rc
      where rc.id=any(v_class_ids) order by rc.id
    loop
      if v_class.grade_id<>v_offering.grade_id then
        v_incompatible:=v_incompatible+1;
        continue;
      end if;

      -- Serialize this canonical offering/class/teacher key before overlap
      -- classification so concurrent bulk requests cannot both create a row.
      perform pg_advisory_xact_lock(
        hashtextextended(
          v_offering.id::text||':'||v_class.id::text||':'||p_staff_member_id::text,
          1035
        )
      );

      select ta.id,ta.active_from,ta.active_to
        into v_existing_id,v_existing_start,v_existing_end
      from public.teacher_allocations ta
      where ta.subject_offering_id=v_offering.id
        and ta.register_class_id=v_class.id
        and ta.staff_member_id=p_staff_member_id
        and ta.active_from<=coalesce(p_active_to,'infinity'::date)
        and p_active_from<=coalesce(ta.active_to,'infinity'::date)
      order by
        (
          ta.active_from=p_active_from
          and ta.active_to is not distinct from p_active_to
        ) desc,
        ta.active_from,
        ta.id
      limit 1;

      if v_existing_id is not null then
        if v_existing_start=p_active_from
           and v_existing_end is not distinct from p_active_to then
          v_duplicates:=v_duplicates+1;
        else
          v_conflicts:=v_conflicts+1;
        end if;
      else
        v_allocation_id:=public.create_teacher_allocation_period(
          p_school_id,p_academic_year,v_offering.id,v_class.id,p_staff_member_id,p_active_from,p_active_to
        );
        v_created:=v_created+1;
      end if;
      v_existing_id:=null;
      v_existing_start:=null;
      v_existing_end:=null;
      v_allocation_id:=null;
    end loop;
  end loop;

  for v_group in
    select tg.id,tg.subject_offering_id,tg.effective_from,tg.effective_to
    from public.teaching_groups tg where tg.id=any(v_group_ids) order by tg.id
  loop
    v_group_had_allocation:=false;
    v_link_from:=greatest(p_active_from,v_group.effective_from);
    v_link_to:=case
      when p_active_to is null then v_group.effective_to
      when v_group.effective_to is null then p_active_to
      else least(p_active_to,v_group.effective_to)
    end;
    if v_link_to is not null and v_link_to<v_link_from then
      v_groups_without_allocations:=v_groups_without_allocations+1;
      continue;
    end if;

    for v_allocation in
      select ta.id from public.teacher_allocations ta
      where ta.subject_offering_id=v_group.subject_offering_id
        and ta.register_class_id=any(v_class_ids)
        and ta.staff_member_id=p_staff_member_id
        and ta.active_from=p_active_from
        and ta.active_to is not distinct from p_active_to
      order by ta.id
    loop
      v_group_had_allocation:=true;
      select tga.id,tga.effective_to into v_existing_id,v_existing_end
      from public.teaching_group_allocations tga
      where tga.teaching_group_id=v_group.id and tga.teacher_allocation_id=v_allocation.id
        and tga.effective_from=v_link_from;

      if v_existing_id is not null then
        if v_existing_end is not distinct from v_link_to then v_group_links_existing:=v_group_links_existing+1;
        else v_group_link_conflicts:=v_group_link_conflicts+1;
        end if;
      else
        insert into public.teaching_group_allocations(
          tenant_id,school_id,academic_year,teaching_group_id,teacher_allocation_id,
          effective_from,effective_to,source,created_by_user_id
        ) values(
          v_tenant_id,p_school_id,p_academic_year,v_group.id,v_allocation.id,
          v_link_from,v_link_to,'manual:bulk_timetable_setup',auth.uid()
        ) returning id into v_link_id;

        insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
        values(v_tenant_id,p_school_id,auth.uid(),'timetable.teaching_group_allocation.saved',
          'teaching_group_allocation',v_link_id,
          jsonb_build_object('teaching_group_id',v_group.id,'teacher_allocation_id',v_allocation.id,
            'academic_year',p_academic_year,'effective_from',v_link_from,'effective_to',v_link_to,
            'source','manual:bulk_timetable_setup'));
        v_group_links_created:=v_group_links_created+1;
      end if;
      v_existing_id:=null; v_existing_end:=null; v_link_id:=null;
    end loop;
    if not v_group_had_allocation then v_groups_without_allocations:=v_groups_without_allocations+1; end if;
  end loop;

  return jsonb_build_object(
    'requested',v_requested,'created',v_created,'duplicates',v_duplicates,'conflicts',v_conflicts,
    'incompatible',v_incompatible,'group_links_created',v_group_links_created,
    'group_links_existing',v_group_links_existing,'group_link_conflicts',v_group_link_conflicts,
    'groups_without_allocations',v_groups_without_allocations
  );
end;
$bulk_teacher_allocations$;

revoke all on function public.bulk_create_teacher_allocations(
  uuid,integer,uuid[],uuid[],uuid[],uuid,date,date
) from public,anon;
grant execute on function public.bulk_create_teacher_allocations(
  uuid,integer,uuid[],uuid[],uuid[],uuid,date,date
) to authenticated;

comment on function public.bulk_create_teacher_allocations(
  uuid,integer,uuid[],uuid[],uuid[],uuid,date,date
) is
'Transactional bulk teacher setup. Grade-compatible canonical combinations are serialized before inclusive effective-range overlap checks; exact repeats are duplicates and any other overlap is reported as a conflict without creating another allocation.';
