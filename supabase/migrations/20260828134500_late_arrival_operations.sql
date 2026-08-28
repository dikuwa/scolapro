-- Operational helpers for delegated school late-arrival duty. A temporary duty is
-- preferable to creating another permanent system role.

create or replace function public.assign_school_duty(
  p_school_id uuid,
  p_staff_member_id uuid,
  p_duty_key text,
  p_active_from date default current_date,
  p_active_to date default null
)
returns uuid
language plpgsql security definer set search_path=public,app_private as $$
declare v_school public.schools%rowtype; v_staff public.staff_members%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_school from public.schools where id=p_school_id;
  if not found then raise exception 'School not found'; end if;
  if not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal']) and not app_private.has_platform_role(array['platform_admin']) then raise exception 'Permission denied'; end if;
  select sm.* into v_staff
  from public.staff_members sm
  where sm.id=p_staff_member_id and sm.tenant_id=v_school.tenant_id and sm.status='active'
    and exists(
      select 1 from public.school_memberships membership
      where membership.school_id=p_school_id and membership.staff_member_id=sm.id
        and membership.active_from<=p_active_from
        and (membership.active_to is null or membership.active_to>=p_active_from)
    );
  if not found then raise exception 'Active staff member not found in school'; end if;
  if btrim(coalesce(p_duty_key,''))='' then raise exception 'Duty key is required'; end if;
  if p_active_to is not null and p_active_to<p_active_from then raise exception 'Duty end date cannot precede start date'; end if;

  insert into public.school_duty_assignments(tenant_id,school_id,staff_member_id,duty_key,active_from,active_to,assigned_by_user_id)
  values(v_school.tenant_id,v_school.id,v_staff.id,btrim(p_duty_key),p_active_from,p_active_to,auth.uid())
  returning id into v_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_school.tenant_id,v_school.id,auth.uid(),'school_duty.assigned','staff_member',v_staff.id,jsonb_build_object('duty_key',btrim(p_duty_key),'active_from',p_active_from,'active_to',p_active_to));
  return v_id;
end; $$;

create or replace function public.end_school_duty(p_assignment_id uuid,p_active_to date default current_date)
returns boolean
language plpgsql security definer set search_path=public,app_private as $$
declare v_duty public.school_duty_assignments%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_duty from public.school_duty_assignments where id=p_assignment_id;
  if not found then raise exception 'Duty assignment not found'; end if;
  if not app_private.has_school_role(v_duty.school_id,array['school_admin','principal','deputy_principal']) and not app_private.has_platform_role(array['platform_admin']) then raise exception 'Permission denied'; end if;
  if p_active_to<v_duty.active_from then raise exception 'Duty end date cannot precede start date'; end if;
  update public.school_duty_assignments set active_to=p_active_to where id=v_duty.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_duty.tenant_id,v_duty.school_id,auth.uid(),'school_duty.ended','staff_member',v_duty.staff_member_id,jsonb_build_object('duty_key',v_duty.duty_key,'active_to',p_active_to));
  return true;
end; $$;

create or replace view public.late_arrival_weekly_readiness with (security_invoker=true) as
with week_events as (
  select school_id,tenant_id,learner_id,
    arrival_date-((extract(isodow from arrival_date)::int)-1) as week_start,
    count(*)::integer late_count,
    array_agg(arrival_date order by arrival_date) late_dates
  from public.school_late_arrival_events
  group by school_id,tenant_id,learner_id,arrival_date-((extract(isodow from arrival_date)::int)-1)
)
select w.school_id,w.tenant_id,w.learner_id,w.week_start,w.late_count,w.late_dates,
  p.weekly_threshold,
  (w.late_count>=p.weekly_threshold) qualifies_for_detention,
  d.id obligation_id,d.due_on,d.status detention_status
from week_events w
join public.school_late_arrival_policies p on p.school_id=w.school_id and p.active=true
left join public.late_detention_obligations d on d.school_id=w.school_id and d.learner_id=w.learner_id and d.qualifying_week_start=w.week_start;

grant select on public.late_arrival_weekly_readiness to authenticated;
revoke all on function public.assign_school_duty(uuid,uuid,text,date,date) from public,anon; grant execute on function public.assign_school_duty(uuid,uuid,text,date,date) to authenticated;
revoke all on function public.end_school_duty(uuid,date) from public,anon; grant execute on function public.end_school_duty(uuid,date) to authenticated;
