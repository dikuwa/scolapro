-- Issue #1050 operational recovery for Namib High School's 2026 learner
-- calendar. The source is the published Republic of Namibia / Ministry 2026
-- Government Schools learner calendar, mirrored at:
-- https://www.delta-school.com/downloads/2026_calender.pdf
--
-- Teacher and hostel dates are intentionally excluded. No holiday or event rows
-- are inferred by this recovery.

create or replace function app_private.recover_namib_high_2026_learner_calendar()
returns text
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $recovery$
declare
  v_tenant_id constant uuid := '11111111-1111-4111-8111-111111111111';
  v_school_id constant uuid := '22222222-2222-4222-8222-222222222222';
  v_year public.academic_years%rowtype;
  v_term public.academic_terms%rowtype;
  v_changed boolean := false;
  v_term_definition record;
begin
  perform pg_advisory_xact_lock(hashtextextended('issue-1050:namib-high:2026-calendar',0));

  -- A fresh local reset applies migrations before seed.sql. Only that completely
  -- empty bootstrap state may defer. Any populated environment must contain the
  -- exact active tenant/school identity or the migration fails closed.
  if not exists(select 1 from public.tenants) and not exists(select 1 from public.schools) then
    return 'deferred_empty_bootstrap';
  end if;

  perform 1
  from public.schools s
  join public.tenants t on t.id=s.tenant_id
  where s.id=v_school_id
    and s.tenant_id=v_tenant_id
    and s.name='Namib High School'
    and s.status='active'
    and t.status='active';
  if not found then
    raise exception 'Issue #1050 recovery requires the exact active Namib High School tenant identity';
  end if;

  perform 1 from public.schools where id=v_school_id for update;

  if not exists(
    select 1 from public.grades
    where tenant_id=v_tenant_id and school_id=v_school_id and academic_year=2026
  ) or not exists(
    select 1 from public.register_classes
    where tenant_id=v_tenant_id and school_id=v_school_id and academic_year=2026
  ) then
    raise exception 'Issue #1050 recovery requires the existing 2026 grade and register-class structure';
  end if;

  if exists(
    select 1 from public.academic_years
    where school_id=v_school_id and status='active' and year<>2026
  ) then
    raise exception 'Issue #1050 recovery refused: an incompatible academic year is already active';
  end if;

  select * into v_year
  from public.academic_years
  where school_id=v_school_id and year=2026
  for update;

  if found and (
    v_year.tenant_id<>v_tenant_id
    or v_year.starts_on is distinct from date '2026-01-12'
    or v_year.ends_on is distinct from date '2026-12-04'
    or v_year.status='closed'
  ) then
    raise exception 'Issue #1050 recovery refused: conflicting governed 2026 academic-year configuration exists';
  end if;

  if not found then
    insert into public.academic_years(tenant_id,school_id,year,status,starts_on,ends_on)
    values(v_tenant_id,v_school_id,2026,'active','2026-01-12','2026-12-04')
    returning * into v_year;
    v_changed := true;
  elsif v_year.status<>'active' then
    update public.academic_years
    set status='active',updated_at=now()
    where id=v_year.id
    returning * into v_year;
    v_changed := true;
  end if;

  if exists(
    select 1 from public.academic_terms
    where academic_year_id=v_year.id and term_number not in (1,2,3)
  ) then
    raise exception 'Issue #1050 recovery refused: 2026 contains terms outside the three-term learner calendar';
  end if;

  for v_term_definition in
    select * from (values
      (1::smallint,'Term 1'::text,date '2026-01-12',date '2026-04-28','closed'::text,75),
      (2::smallint,'Term 2'::text,date '2026-06-01',date '2026-08-20','closed'::text,59),
      (3::smallint,'Term 3'::text,date '2026-09-07',date '2026-12-04','active'::text,65)
    ) as expected(term_number,display_name,starts_on,ends_on,status,school_days)
  loop
    select * into v_term
    from public.academic_terms
    where academic_year_id=v_year.id
      and term_number=v_term_definition.term_number
    for update;

    if found and (
      v_term.tenant_id<>v_tenant_id
      or v_term.school_id<>v_school_id
      or v_term.display_name<>v_term_definition.display_name
      or v_term.starts_on is distinct from v_term_definition.starts_on
      or v_term.ends_on is distinct from v_term_definition.ends_on
      or (v_term_definition.status='active' and v_term.status='closed')
    ) then
      raise exception 'Issue #1050 recovery refused: conflicting governed Term % configuration exists',v_term_definition.term_number;
    end if;

    if not found then
      insert into public.academic_terms(
        tenant_id,school_id,academic_year_id,term_number,display_name,starts_on,ends_on,status
      ) values(
        v_tenant_id,v_school_id,v_year.id,v_term_definition.term_number,
        v_term_definition.display_name,v_term_definition.starts_on,
        v_term_definition.ends_on,v_term_definition.status
      );
      v_changed := true;
    elsif v_term.status<>v_term_definition.status then
      update public.academic_terms
      set status=v_term_definition.status,updated_at=now()
      where id=v_term.id;
      v_changed := true;
    end if;
  end loop;

  if (select count(*) from public.academic_terms where academic_year_id=v_year.id)<>3 then
    raise exception 'Issue #1050 recovery refused: the learner calendar is not exactly three terms';
  end if;

  if v_changed then
    insert into public.audit_events(
      tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
    ) values(
      v_tenant_id,v_school_id,null,'academic.calendar.operational_recovery',
      'academic_year',v_year.id,
      jsonb_build_object(
        'issue',1050,
        'academic_year',2026,
        'calendar_audience','learners',
        'school_days',199,
        'term_school_days',jsonb_build_array(75,59,65),
        'source_basis','Republic of Namibia / Ministry 2026 Government Schools learner calendar',
        'source_mirror','https://www.delta-school.com/downloads/2026_calender.pdf'
      )
    );
    return 'applied';
  end if;

  return 'already_configured';
end;
$recovery$;

revoke all on function app_private.recover_namib_high_2026_learner_calendar()
from public,anon,authenticated;

comment on function app_private.recover_namib_high_2026_learner_calendar() is
'Fail-closed, idempotent Issue #1050 recovery of the exact Namib High School 2026 Government Schools learner calendar. Excludes teacher/hostel dates and inferred events.';

select app_private.recover_namib_high_2026_learner_calendar();
