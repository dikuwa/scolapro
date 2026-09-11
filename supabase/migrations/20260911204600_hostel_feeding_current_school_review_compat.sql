-- Preserve N15 Control Room review semantics while applying deterministic current-school authorization.

create or replace function public.end_hostel_residency(
  p_residency_id uuid,
  p_resident_to date default current_date
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_residency public.hostel_residencies%rowtype;
  v_enrolment public.enrolments%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_residency
  from public.hostel_residencies
  where id=p_residency_id
  for update;
  if not found then raise exception 'Hostel residency not found'; end if;

  if not app_private.user_has_current_school_role(
    auth.uid(),v_residency.school_id,array['school_admin','principal','deputy_principal']
  ) then raise exception 'Permission denied'; end if;

  if v_residency.resident_to is not null then
    raise exception 'Hostel residency is already closed';
  end if;
  if p_resident_to is null or p_resident_to<v_residency.resident_from then
    raise exception 'Resident-to date cannot precede resident-from date';
  end if;

  select * into v_enrolment from public.enrolments where id=v_residency.enrolment_id;
  if not found or v_enrolment.school_id<>v_residency.school_id or v_enrolment.tenant_id<>v_residency.tenant_id then
    raise exception 'Hostel residency enrolment scope is invalid';
  end if;
  if v_enrolment.enrolled_to is not null and p_resident_to>v_enrolment.enrolled_to then
    raise exception 'Resident-to date cannot extend beyond enrolment end';
  end if;

  update public.hostel_residencies
  set resident_to=p_resident_to,updated_at=now()
  where id=v_residency.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_residency.tenant_id,v_residency.school_id,auth.uid(),'hostel.residency.ended','hostel_residency',v_residency.id,
    jsonb_build_object('resident_from',v_residency.resident_from,'resident_to',p_resident_to,'enrolment_id',v_residency.enrolment_id));

  return true;
end;
$$;

create or replace function public.hostel_occupancy_summary_as_of(p_school_id uuid,p_as_of date default current_date)
returns table(hostel_id uuid,capacity integer,current_residents integer,female_residents integer,male_residents integer,other_or_unspecified_residents integer,occupancy_percent numeric)
language plpgsql stable security definer set search_path=pg_catalog,public,app_private as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.user_has_current_school_role(auth.uid(),p_school_id,array['school_admin','principal','deputy_principal','hod']) then raise exception 'Permission denied'; end if;
  return query
  select h.id,h.capacity,count(r.id)::integer,
    count(r.id) filter(where l.sex='female')::integer,
    count(r.id) filter(where l.sex='male')::integer,
    count(r.id) filter(where coalesce(l.sex,'unspecified') not in ('female','male'))::integer,
    case when h.capacity=0 then 0::numeric else round((count(r.id)::numeric*100)/h.capacity,2) end
  from public.school_hostels h
  left join public.hostel_residencies r on r.hostel_id=h.id and r.resident_from<=p_as_of and (r.resident_to is null or r.resident_to>=p_as_of)
  left join public.enrolments e on e.id=r.enrolment_id
  left join public.learners l on l.id=e.learner_id
  where h.school_id=p_school_id and h.active_from<=p_as_of and (h.active_to is null or h.active_to>=p_as_of)
  group by h.id,h.capacity;
end;
$$;

create or replace function public.feeding_monthly_summary(p_school_id uuid,p_month date)
returns table(month_start date,serving_days integer,total_beneficiary_servings bigint,total_meals bigint,interruption_days integer,stock_alert_days integer)
language plpgsql stable security definer set search_path=pg_catalog,public,app_private as $$
declare v_start date:=date_trunc('month',p_month)::date; v_end date:=(date_trunc('month',p_month)+interval '1 month - 1 day')::date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_month is null then raise exception 'Month is required'; end if;
  if not app_private.user_has_current_school_role(auth.uid(),p_school_id,array['school_admin','principal','deputy_principal','hod']) then raise exception 'Permission denied'; end if;
  return query select v_start,
    count(distinct d.service_date)::integer,
    coalesce(sum(d.beneficiary_count),0)::bigint,
    coalesce(sum(d.meal_count),0)::bigint,
    count(distinct d.service_date) filter(where d.interruption_reason is not null)::integer,
    count(distinct d.service_date) filter(where d.stock_alert is not null)::integer
  from public.feeding_service_days d where d.school_id=p_school_id and d.service_date between v_start and v_end;
end;
$$;