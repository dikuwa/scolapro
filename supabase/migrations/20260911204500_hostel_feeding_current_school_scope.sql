-- Bind N15 hostel/feeding authorization to the deterministic current school.

create or replace function app_private.user_has_current_school_role(
  p_user_id uuid,
  p_school_id uuid,
  p_roles text[]
) returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  with current_school as (
    select sm.school_id
    from public.school_memberships sm
    where sm.user_id = p_user_id
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
    order by sm.active_from desc, sm.id asc
    limit 1
  )
  select exists (
    select 1
    from current_school cs
    join public.school_memberships sm
      on sm.school_id = cs.school_id
     and sm.user_id = p_user_id
    where cs.school_id = p_school_id
      and sm.role_key = any(p_roles)
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
  );
$$;
revoke all on function app_private.user_has_current_school_role(uuid,uuid,text[]) from public,anon;
grant execute on function app_private.user_has_current_school_role(uuid,uuid,text[]) to authenticated;

drop policy if exists "leadership reads hostel profiles" on public.school_hostels;
create policy "leadership reads hostel profiles" on public.school_hostels for select to authenticated
using (app_private.user_has_current_school_role((select auth.uid()),school_hostels.school_id,array['school_admin','principal','deputy_principal','hod']));

drop policy if exists "leadership reads hostel residencies" on public.hostel_residencies;
create policy "leadership reads hostel residencies" on public.hostel_residencies for select to authenticated
using (app_private.user_has_current_school_role((select auth.uid()),hostel_residencies.school_id,array['school_admin','principal','deputy_principal']));

drop policy if exists "leadership reads feeding programmes" on public.school_feeding_programmes;
create policy "leadership reads feeding programmes" on public.school_feeding_programmes for select to authenticated
using (app_private.user_has_current_school_role((select auth.uid()),school_feeding_programmes.school_id,array['school_admin','principal','deputy_principal','hod']));

drop policy if exists "leadership reads feeding service days" on public.feeding_service_days;
create policy "leadership reads feeding service days" on public.feeding_service_days for select to authenticated
using (app_private.user_has_current_school_role((select auth.uid()),feeding_service_days.school_id,array['school_admin','principal','deputy_principal','hod']));

create or replace function app_private.enforce_hostel_scope()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_school_tenant uuid;
  v_hostel public.school_hostels%rowtype;
  v_enrolment public.enrolments%rowtype;
begin
  select tenant_id into v_school_tenant from public.schools where id=new.school_id;
  if v_school_tenant is null then raise exception 'School not found'; end if;
  if new.tenant_id<>v_school_tenant then raise exception 'Tenant must match school'; end if;

  if tg_table_name='hostel_residencies' then
    select * into v_hostel from public.school_hostels where id=new.hostel_id;
    if not found or v_hostel.school_id<>new.school_id or v_hostel.tenant_id<>new.tenant_id then
      raise exception 'Hostel residency must use a hostel from the same school';
    end if;
    select * into v_enrolment from public.enrolments where id=new.enrolment_id;
    if not found or v_enrolment.school_id<>new.school_id or v_enrolment.tenant_id<>new.tenant_id then
      raise exception 'Hostel residency must use an enrolment from the same school';
    end if;
    if v_enrolment.status <> 'current' then
      raise exception 'Hostel residency requires a current enrolment';
    end if;
    if new.resident_from<v_enrolment.enrolled_from
       or (v_enrolment.enrolled_to is not null and (new.resident_to is null or new.resident_to>v_enrolment.enrolled_to)) then
      raise exception 'Hostel residency must remain within enrolment period';
    end if;
    if exists(
      select 1 from public.hostel_residencies r
      where r.enrolment_id=new.enrolment_id
        and r.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid)
        and daterange(r.resident_from,coalesce(r.resident_to,'infinity'::date),'[]')
            && daterange(new.resident_from,coalesce(new.resident_to,'infinity'::date),'[]')
    ) then raise exception 'Learner already has an overlapping hostel residency'; end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.enforce_hostel_scope() from public,anon,authenticated;

create or replace function public.record_school_hostel(
  p_school_id uuid,p_hostel_type text,p_capacity integer,p_active_from date,
  p_opens_on date default null,p_closes_on date default null,p_home_weekend_notes text default null,p_staff_count integer default 0
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_school public.schools%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_school from public.schools where id=p_school_id; if not found then raise exception 'School not found'; end if;
  if not app_private.user_has_current_school_role(auth.uid(),p_school_id,array['school_admin','principal','deputy_principal']) then raise exception 'Permission denied'; end if;
  insert into public.school_hostels(tenant_id,school_id,hostel_type,capacity,opens_on,closes_on,home_weekend_notes,staff_count,active_from,created_by_user_id)
  values(v_school.tenant_id,p_school_id,p_hostel_type,p_capacity,p_opens_on,p_closes_on,nullif(btrim(coalesce(p_home_weekend_notes,'')),''),p_staff_count,p_active_from,auth.uid()) returning id into v_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_school.tenant_id,p_school_id,auth.uid(),'hostel.profile.created','school_hostel',v_id,jsonb_build_object('capacity',p_capacity,'active_from',p_active_from));
  return v_id;
end; $$;

create or replace function public.record_hostel_residency(p_hostel_id uuid,p_enrolment_id uuid,p_resident_from date,p_resident_to date default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_hostel public.school_hostels%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_hostel from public.school_hostels where id=p_hostel_id; if not found then raise exception 'Hostel not found'; end if;
  if not app_private.user_has_current_school_role(auth.uid(),v_hostel.school_id,array['school_admin','principal','deputy_principal']) then raise exception 'Permission denied'; end if;
  insert into public.hostel_residencies(tenant_id,school_id,hostel_id,enrolment_id,resident_from,resident_to,created_by_user_id)
  values(v_hostel.tenant_id,v_hostel.school_id,p_hostel_id,p_enrolment_id,p_resident_from,p_resident_to,auth.uid()) returning id into v_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_hostel.tenant_id,v_hostel.school_id,auth.uid(),'hostel.residency.recorded','hostel_residency',v_id,jsonb_build_object('resident_from',p_resident_from,'resident_to',p_resident_to));
  return v_id;
end; $$;

create or replace function public.create_feeding_programme(p_school_id uuid,p_programme_name text,p_programme_type text,p_active_from date,p_active_to date default null,p_source_name text default null,p_target_beneficiaries integer default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_school public.schools%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_school from public.schools where id=p_school_id; if not found then raise exception 'School not found'; end if;
  if not app_private.user_has_current_school_role(auth.uid(),p_school_id,array['school_admin','principal','deputy_principal']) then raise exception 'Permission denied'; end if;
  insert into public.school_feeding_programmes(tenant_id,school_id,programme_name,programme_type,source_name,active_from,active_to,target_beneficiaries,created_by_user_id)
  values(v_school.tenant_id,p_school_id,btrim(p_programme_name),p_programme_type,nullif(btrim(coalesce(p_source_name,'')),''),p_active_from,p_active_to,p_target_beneficiaries,auth.uid()) returning id into v_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_school.tenant_id,p_school_id,auth.uid(),'feeding.programme.created','school_feeding_programme',v_id,jsonb_build_object('active_from',p_active_from,'active_to',p_active_to));
  return v_id;
end; $$;

create or replace function public.record_feeding_service_day(p_programme_id uuid,p_service_date date,p_beneficiary_count integer,p_meal_count integer,p_interruption_reason text default null,p_stock_alert text default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_programme public.school_feeding_programmes%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_programme from public.school_feeding_programmes where id=p_programme_id; if not found then raise exception 'Feeding programme not found'; end if;
  if not app_private.user_has_current_school_role(auth.uid(),v_programme.school_id,array['school_admin','principal','deputy_principal']) then raise exception 'Permission denied'; end if;
  insert into public.feeding_service_days(tenant_id,school_id,programme_id,service_date,beneficiary_count,meal_count,interruption_reason,stock_alert,created_by_user_id)
  values(v_programme.tenant_id,v_programme.school_id,p_programme_id,p_service_date,p_beneficiary_count,p_meal_count,nullif(btrim(coalesce(p_interruption_reason,'')),''),nullif(btrim(coalesce(p_stock_alert,'')),''),auth.uid()) returning id into v_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_programme.tenant_id,v_programme.school_id,auth.uid(),'feeding.service_day.recorded','feeding_service_day',v_id,jsonb_build_object('service_date',p_service_date,'beneficiary_count',p_beneficiary_count,'meal_count',p_meal_count));
  return v_id;
end; $$;

create or replace function public.hostel_occupancy_summary_as_of(p_school_id uuid,p_as_of date default current_date)
returns table(hostel_id uuid,capacity integer,current_residents integer,female_residents integer,male_residents integer,other_or_unspecified_residents integer,occupancy_percent numeric)
language plpgsql stable security definer set search_path=pg_catalog,public,app_private as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.user_has_current_school_role(auth.uid(),p_school_id,array['school_admin','principal','deputy_principal','hod']) then raise exception 'Permission denied'; end if;
  return query
  select h.id,h.capacity,count(r.id)::integer,
    count(*) filter(where l.sex='female')::integer,
    count(*) filter(where l.sex='male')::integer,
    count(*) filter(where coalesce(l.sex,'unspecified') not in ('female','male'))::integer,
    case when h.capacity=0 then 0::numeric else round((count(r.id)::numeric*100)/h.capacity,2) end
  from public.school_hostels h
  left join public.hostel_residencies r on r.hostel_id=h.id and r.resident_from<=p_as_of and (r.resident_to is null or r.resident_to>=p_as_of)
  left join public.enrolments e on e.id=r.enrolment_id
  left join public.learners l on l.id=e.learner_id
  where h.school_id=p_school_id and h.active_from<=p_as_of and (h.active_to is null or h.active_to>=p_as_of)
  group by h.id,h.capacity;
end; $$;

create or replace function public.feeding_monthly_summary(p_school_id uuid,p_month date)
returns table(month_start date,serving_days integer,total_beneficiary_servings bigint,total_meals bigint,interruption_days integer,stock_alert_days integer)
language plpgsql stable security definer set search_path=pg_catalog,public,app_private as $$
declare v_start date:=date_trunc('month',p_month)::date; v_end date:=(date_trunc('month',p_month)+interval '1 month - 1 day')::date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_month is null then raise exception 'Month is required'; end if;
  if not app_private.user_has_current_school_role(auth.uid(),p_school_id,array['school_admin','principal','deputy_principal','hod']) then raise exception 'Permission denied'; end if;
  return query select v_start,count(*)::integer,coalesce(sum(d.beneficiary_count),0)::bigint,coalesce(sum(d.meal_count),0)::bigint,
    count(*) filter(where d.interruption_reason is not null)::integer,count(*) filter(where d.stock_alert is not null)::integer
  from public.feeding_service_days d where d.school_id=p_school_id and d.service_date between v_start and v_end;
end; $$;