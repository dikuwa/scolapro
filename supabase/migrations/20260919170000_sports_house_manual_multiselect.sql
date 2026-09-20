-- Issue #588: batch manual learner allocation over the canonical assignment store.
-- Locked assignments are never silently moved or unlocked.

create or replace function public.assign_learner_sports_house(
  p_school_id uuid,p_academic_year integer,p_learner_id uuid,p_house_id uuid,
  p_assignment_source text default 'manual',p_is_locked boolean default false
) returns uuid
language plpgsql security definer set search_path=public,app_private
as $$
declare
  v_tenant uuid;
  v_id uuid;
  v_existing public.sports_learner_house_assignments%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_sports(p_school_id) then raise exception 'Permission denied'; end if;
  select tenant_id into v_tenant from public.schools where id=p_school_id;
  if v_tenant is null then raise exception 'School not found'; end if;
  select * into v_existing
  from public.sports_learner_house_assignments
  where school_id=p_school_id and academic_year=p_academic_year and learner_id=p_learner_id
  for update;
  if v_existing.is_locked and v_existing.house_id is distinct from p_house_id then
    raise exception 'Locked learner assignment cannot be moved';
  end if;
  insert into public.sports_learner_house_assignments(tenant_id,school_id,academic_year,learner_id,house_id,assignment_source,is_locked,assigned_by_user_id)
  values(v_tenant,p_school_id,p_academic_year,p_learner_id,p_house_id,p_assignment_source,(coalesce(v_existing.is_locked,false) or p_is_locked),auth.uid())
  on conflict(school_id,academic_year,learner_id) do update set house_id=excluded.house_id,
    assignment_source=excluded.assignment_source,is_locked=(public.sports_learner_house_assignments.is_locked or excluded.is_locked),assigned_by_user_id=auth.uid(),assigned_at=now(),updated_at=now()
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.assign_learners_sports_house(
  p_school_id uuid,p_academic_year integer,p_learner_ids uuid[],p_house_id uuid,
  p_assignment_source text default 'manual',p_is_locked boolean default false
) returns integer
language plpgsql security definer set search_path=public,app_private
as $$
declare
  v_tenant uuid;
  v_learner_id uuid;
  v_ids uuid[];
  v_expected integer;
  v_existing public.sports_learner_house_assignments%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_sports(p_school_id) then raise exception 'Permission denied'; end if;
  if p_learner_ids is null or cardinality(p_learner_ids)=0 then raise exception 'At least one learner is required'; end if;
  select tenant_id into v_tenant from public.schools where id=p_school_id;
  if v_tenant is null then raise exception 'School not found'; end if;
  if not exists(select 1 from public.sports_houses where id=p_house_id and tenant_id=v_tenant and school_id=p_school_id and status='active') then
    raise exception 'Sports house must be active in this school';
  end if;

  select array_agg(distinct id order by id),count(distinct id)::integer
    into v_ids,v_expected
  from unnest(p_learner_ids) as ids(id);
  if exists(
    select 1 from public.sports_learner_house_assignments a
    where a.school_id=p_school_id and a.academic_year=p_academic_year
      and a.learner_id=any(v_ids) and a.is_locked and a.house_id is distinct from p_house_id
  ) then
    raise exception 'Locked learner assignment cannot be moved';
  end if;

  if (select count(distinct e.learner_id)::integer
      from public.enrolments e
      where e.tenant_id=v_tenant and e.school_id=p_school_id and e.academic_year=p_academic_year
        and e.learner_id=any(v_ids) and e.status in ('current','completed','transferred')) <> v_expected then
    raise exception 'Learner must have an enrolment at the school for the sports year';
  end if;

  foreach v_learner_id in array v_ids loop
    select * into v_existing
    from public.sports_learner_house_assignments
    where school_id=p_school_id and academic_year=p_academic_year and learner_id=v_learner_id
    for update;
    if v_existing.is_locked and v_existing.house_id is distinct from p_house_id then
      raise exception 'Locked learner assignment cannot be moved';
    end if;
    insert into public.sports_learner_house_assignments(tenant_id,school_id,academic_year,learner_id,house_id,assignment_source,is_locked,assigned_by_user_id)
    values(v_tenant,p_school_id,p_academic_year,v_learner_id,p_house_id,p_assignment_source,(coalesce(v_existing.is_locked,false) or p_is_locked),auth.uid())
    on conflict(school_id,academic_year,learner_id) do update set house_id=excluded.house_id,
      assignment_source=excluded.assignment_source,is_locked=(public.sports_learner_house_assignments.is_locked or excluded.is_locked),assigned_by_user_id=auth.uid(),assigned_at=now(),updated_at=now();
  end loop;
  return v_expected;
end; $$;

revoke all on function public.assign_learner_sports_house(uuid,integer,uuid,uuid,text,boolean) from public,anon;
revoke all on function public.assign_learners_sports_house(uuid,integer,uuid[],uuid,text,boolean) from public,anon;
grant execute on function public.assign_learner_sports_house(uuid,integer,uuid,uuid,text,boolean) to authenticated;
grant execute on function public.assign_learners_sports_house(uuid,integer,uuid[],uuid,text,boolean) to authenticated;

comment on function public.assign_learners_sports_house(uuid,integer,uuid[],uuid,text,boolean) is
'Atomic manual learner house allocation over the canonical year-scoped assignment store. Locked assignments cannot move or unlock; school, tenant and enrolment scope remain trigger-enforced.';
