-- Issue #1246: close a complete HOD portfolio appointment or an explicit
-- selection of standalone subject responsibilities in a single transaction.
-- A portfolio-owned subject cannot be independently ended: doing so would leave
-- the effective-dated appointment and its advertised scope inconsistent.
create or replace function public.end_hod_scope_responsibilities(
  p_school_id uuid,
  p_appointment_id uuid,
  p_responsibility_ids uuid[],
  p_effective_to date
) returns integer
language plpgsql security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_appointment public.hod_portfolio_appointments%rowtype;
  v_count integer;
  v_selected integer;
begin
  if auth.uid() is null
    or not app_private.user_current_school_matches(auth.uid(),p_school_id)
    or not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'School leadership authorization required' using errcode='42501';
  end if;
  if p_effective_to is null
    or ((p_appointment_id is null) = (p_responsibility_ids is null)) then
    raise exception 'Choose exactly one scope or subject selection and an end date' using errcode='22023';
  end if;

  if p_appointment_id is not null then
    select a.* into v_appointment
    from public.hod_portfolio_appointments a
    join public.hod_subject_portfolios p on p.id=a.portfolio_id
    where a.id=p_appointment_id and a.school_id=p_school_id
      and p.school_id=p_school_id and p.tenant_id=(select tenant_id from public.schools where id=p_school_id)
    for update of a;

    if v_appointment.id is null or v_appointment.effective_to is not null
      or p_effective_to<v_appointment.effective_from then
      raise exception 'Appointment is unavailable or end date invalid' using errcode='22023';
    end if;

    update public.hod_portfolio_appointments
      set effective_to=p_effective_to where id=v_appointment.id and effective_to is null;
    update public.subject_department_responsibilities
      set effective_to=p_effective_to
      where school_id=p_school_id and portfolio_appointment_id=v_appointment.id
        and effective_to is null;
    get diagnostics v_count=row_count;
    return v_count;
  end if;

  v_selected=cardinality(p_responsibility_ids);
  if v_selected is null or v_selected not between 1 and 100
    or exists(select 1 from unnest(p_responsibility_ids) as sid where sid is null)
    or (select count(distinct sid) from unnest(p_responsibility_ids) sid)<>v_selected then
    raise exception 'Choose 1 to 100 unique responsibilities' using errcode='22023';
  end if;

  -- Lock and validate *every* selected row before writing any of them.
  perform 1 from public.subject_department_responsibilities r
    where r.id=any(p_responsibility_ids) for update;
  select count(*) into v_count from public.subject_department_responsibilities r
    join public.schools s on s.id=r.school_id and s.tenant_id=r.tenant_id
    where r.id=any(p_responsibility_ids) and r.school_id=p_school_id
      and r.portfolio_appointment_id is null and r.effective_to is null
      and r.effective_from<=p_effective_to;
  if v_count<>v_selected then
    raise exception 'One or more subject responsibilities cannot be ended' using errcode='22023';
  end if;
  update public.subject_department_responsibilities
    set effective_to=p_effective_to
    where school_id=p_school_id and id=any(p_responsibility_ids)
      and portfolio_appointment_id is null and effective_to is null;
  get diagnostics v_count=row_count;
  if v_count<>v_selected then
    raise exception 'Concurrent responsibility change detected' using errcode='40001';
  end if;
  return v_count;
end;
$$;
revoke all on function public.end_hod_scope_responsibilities(uuid,uuid,uuid[],date) from public,anon;
grant execute on function public.end_hod_scope_responsibilities(uuid,uuid,uuid[],date) to authenticated;
