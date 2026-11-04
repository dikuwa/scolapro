create or replace function app_private.audit_sports_year_reference_date()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $audit_sports_year_reference_date$
begin
  if tg_op = 'UPDATE'
     and new.age_reference_date is not distinct from old.age_reference_date then
    return new;
  end if;

  insert into public.audit_events(
    tenant_id,
    school_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values(
    new.tenant_id,
    new.school_id,
    auth.uid(),
    case when tg_op = 'INSERT'
      then 'sports.year_reference_date.configured'
      else 'sports.year_reference_date.updated'
    end,
    'sports_year_settings',
    new.id,
    jsonb_build_object(
      'academic_year', new.academic_year,
      'previous_age_reference_date', case when tg_op = 'UPDATE' then old.age_reference_date else null end,
      'age_reference_date', new.age_reference_date
    )
  );
  return new;
end;
$audit_sports_year_reference_date$;

revoke all on function app_private.audit_sports_year_reference_date() from public,anon,authenticated;

drop trigger if exists sports_year_reference_date_audit_trg on public.sports_year_settings;
create trigger sports_year_reference_date_audit_trg
after insert or update of age_reference_date on public.sports_year_settings
for each row execute function app_private.audit_sports_year_reference_date();

create or replace function public.set_sports_year_reference_date(
  p_school_id uuid,
  p_academic_year integer,
  p_age_reference_date date,
  p_school_approval_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $set_sports_year_reference_date$
declare
  v_tenant_id uuid;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if app_private.has_platform_role(array['platform_support']) then raise exception 'Permission denied'; end if;
  if not app_private.can_manage_sports(p_school_id) then raise exception 'Permission denied'; end if;
  if p_academic_year is null or p_academic_year < 2000 or p_academic_year > 2200 then
    raise exception 'Academic year is invalid';
  end if;
  if p_age_reference_date is null
     or extract(year from p_age_reference_date)::integer <> p_academic_year then
    raise exception 'Age reference date must be within the selected academic year';
  end if;
  if p_school_approval_confirmed is not true then
    raise exception 'Confirm school approval before saving the reference date';
  end if;

  select s.tenant_id into v_tenant_id
  from public.schools s
  where s.id=p_school_id and s.status='active';
  if v_tenant_id is null then raise exception 'School not found or inactive'; end if;

  insert into public.sports_year_settings(
    tenant_id,
    school_id,
    academic_year,
    age_reference_date,
    created_by_user_id
  )
  values(
    v_tenant_id,
    p_school_id,
    p_academic_year,
    p_age_reference_date,
    auth.uid()
  )
  on conflict(school_id,academic_year) do update
    set age_reference_date=excluded.age_reference_date,
        updated_at=now()
  returning id into v_id;

  return v_id;
end;
$set_sports_year_reference_date$;

revoke all on function public.set_sports_year_reference_date(uuid,integer,date,boolean) from public,anon;
grant execute on function public.set_sports_year_reference_date(uuid,integer,date,boolean) to authenticated;

comment on function public.set_sports_year_reference_date(uuid,integer,date,boolean) is
'Explicit, school-approved Sports age reference-date setup for an existing school/year source of truth. Updates only the reference date and records immutable actor audit evidence; no age groups or dates are inferred.';
