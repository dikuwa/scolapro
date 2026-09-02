create table public.learner_subject_registrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  enrolment_id uuid not null references public.enrolments(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  subject_offering_id uuid not null references public.subject_offerings(id) on delete restrict,
  status text not null default 'active' check (status in ('active','withdrawn')),
  source text not null default 'manual' check (btrim(source)<>''),
  registered_by_user_id uuid not null,
  registered_at timestamptz not null default now(),
  withdrawn_by_user_id uuid,
  withdrawn_at timestamptz,
  withdrawal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(enrolment_id,subject_offering_id),
  check (
    (status='active' and withdrawn_by_user_id is null and withdrawn_at is null)
    or (status='withdrawn' and withdrawn_by_user_id is not null and withdrawn_at is not null)
  )
);

create index learner_subject_registrations_school_year_idx
  on public.learner_subject_registrations(school_id,academic_year,status);
create index learner_subject_registrations_learner_idx
  on public.learner_subject_registrations(learner_id,academic_year,status);
create index learner_subject_registrations_offering_idx
  on public.learner_subject_registrations(subject_offering_id,status);

alter table public.learner_subject_registrations enable row level security;

create policy "school members can read learner subject registrations"
on public.learner_subject_registrations
for select
to authenticated
using (app_private.has_school_access(school_id));

revoke all on table public.learner_subject_registrations from public,anon,authenticated;
grant select on table public.learner_subject_registrations to authenticated;

create or replace function app_private.enforce_learner_subject_registration_integrity()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_school_tenant uuid;
  v_enrolment_tenant uuid;
  v_enrolment_school uuid;
  v_enrolment_year integer;
  v_enrolment_learner uuid;
  v_enrolment_grade uuid;
  v_offering_tenant uuid;
  v_offering_school uuid;
  v_offering_year integer;
  v_offering_grade uuid;
  v_offering_status text;
begin
  if tg_op='UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.academic_year is distinct from old.academic_year
    or new.enrolment_id is distinct from old.enrolment_id
    or new.learner_id is distinct from old.learner_id
    or new.subject_offering_id is distinct from old.subject_offering_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Learner subject registration scope and identity are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s where s.id=new.school_id;
  if v_school_tenant is null or v_school_tenant<>new.tenant_id then
    raise exception 'Learner subject registration scope mismatch: school does not belong to tenant';
  end if;

  select e.tenant_id,e.school_id,e.academic_year,e.learner_id,e.grade_id
  into v_enrolment_tenant,v_enrolment_school,v_enrolment_year,v_enrolment_learner,v_enrolment_grade
  from public.enrolments e where e.id=new.enrolment_id;
  if v_enrolment_tenant is null
     or v_enrolment_tenant<>new.tenant_id
     or v_enrolment_school<>new.school_id
     or v_enrolment_year<>new.academic_year
     or v_enrolment_learner<>new.learner_id then
    raise exception 'Learner subject registration scope mismatch: enrolment does not match tenant, school, year, and learner';
  end if;
  if v_enrolment_grade is null then
    raise exception 'Learner subject registration requires an enrolment grade';
  end if;

  select so.tenant_id,so.school_id,so.academic_year,so.grade_id,so.status
  into v_offering_tenant,v_offering_school,v_offering_year,v_offering_grade,v_offering_status
  from public.subject_offerings so where so.id=new.subject_offering_id;
  if v_offering_tenant is null
     or v_offering_tenant<>new.tenant_id
     or v_offering_school<>new.school_id
     or v_offering_year<>new.academic_year then
    raise exception 'Learner subject registration scope mismatch: subject offering does not match tenant, school, and year';
  end if;
  if v_offering_grade<>v_enrolment_grade then
    raise exception 'Learner subject registration scope mismatch: subject offering grade does not match enrolment grade';
  end if;
  if new.status='active' and v_offering_status<>'active' then
    raise exception 'Learner subject registration requires an active subject offering';
  end if;

  if new.status='active' then
    new.withdrawn_by_user_id:=null;
    new.withdrawn_at:=null;
    new.withdrawal_reason:=null;
  elsif new.withdrawn_by_user_id is null or new.withdrawn_at is null then
    raise exception 'Withdrawn learner subject registration requires withdrawal actor and timestamp';
  end if;

  new.source:=btrim(new.source);
  new.updated_at:=now();
  return new;
end;
$$;

revoke all on function app_private.enforce_learner_subject_registration_integrity() from public,anon,authenticated;

create trigger learner_subject_registration_integrity_trg
before insert or update
on public.learner_subject_registrations
for each row execute function app_private.enforce_learner_subject_registration_integrity();

create or replace function app_private.can_manage_learner_subject_registrations(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal','hod']);
$$;

revoke all on function app_private.can_manage_learner_subject_registrations(uuid) from public,anon,authenticated;

create or replace function public.register_learner_subject(
  p_enrolment_id uuid,
  p_subject_offering_id uuid,
  p_source text default 'manual'
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_enrolment public.enrolments%rowtype;
  v_offering public.subject_offerings%rowtype;
  v_existing public.learner_subject_registrations%rowtype;
  v_registration_id uuid;
  v_source text:=btrim(coalesce(p_source,'manual'));
  v_event_type text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_enrolment
  from public.enrolments
  where id=p_enrolment_id
  for share;
  if not found then raise exception 'Enrolment not found'; end if;
  if not app_private.can_manage_learner_subject_registrations(v_enrolment.school_id) then
    raise exception 'Permission denied';
  end if;
  if v_enrolment.grade_id is null then
    raise exception 'Learner subject registration requires an enrolment grade';
  end if;

  select * into v_offering
  from public.subject_offerings
  where id=p_subject_offering_id;
  if not found then raise exception 'Subject offering not found'; end if;
  if v_offering.tenant_id<>v_enrolment.tenant_id
     or v_offering.school_id<>v_enrolment.school_id
     or v_offering.academic_year<>v_enrolment.academic_year then
    raise exception 'Learner subject registration scope mismatch: subject offering does not match enrolment';
  end if;
  if v_offering.grade_id<>v_enrolment.grade_id then
    raise exception 'Learner subject registration scope mismatch: subject offering grade does not match enrolment grade';
  end if;
  if v_offering.status<>'active' then
    raise exception 'Learner subject registration requires an active subject offering';
  end if;
  if v_source='' then raise exception 'Registration source is required'; end if;

  select * into v_existing
  from public.learner_subject_registrations
  where enrolment_id=v_enrolment.id and subject_offering_id=v_offering.id
  for update;

  if found then
    if v_existing.status='active' then
      return v_existing.id;
    end if;

    update public.learner_subject_registrations
    set status='active',
        source=v_source,
        registered_by_user_id=auth.uid(),
        registered_at=now(),
        withdrawn_by_user_id=null,
        withdrawn_at=null,
        withdrawal_reason=null
    where id=v_existing.id
    returning id into v_registration_id;
    v_event_type:='learner_subject_registration.reactivated';
  else
    insert into public.learner_subject_registrations(
      tenant_id,school_id,academic_year,enrolment_id,learner_id,subject_offering_id,
      status,source,registered_by_user_id,registered_at
    ) values(
      v_enrolment.tenant_id,v_enrolment.school_id,v_enrolment.academic_year,
      v_enrolment.id,v_enrolment.learner_id,v_offering.id,
      'active',v_source,auth.uid(),now()
    ) returning id into v_registration_id;
    v_event_type:='learner_subject_registration.registered';
  end if;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_enrolment.tenant_id,v_enrolment.school_id,auth.uid(),v_event_type,
    'learner_subject_registration',v_registration_id,
    jsonb_build_object(
      'enrolment_id',v_enrolment.id,
      'learner_id',v_enrolment.learner_id,
      'subject_offering_id',v_offering.id,
      'academic_year',v_enrolment.academic_year,
      'source',v_source
    )
  );

  return v_registration_id;
end;
$$;

revoke all on function public.register_learner_subject(uuid,uuid,text) from public,anon;
grant execute on function public.register_learner_subject(uuid,uuid,text) to authenticated;

create or replace function public.withdraw_learner_subject_registration(
  p_registration_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_registration public.learner_subject_registrations%rowtype;
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_registration
  from public.learner_subject_registrations
  where id=p_registration_id
  for update;
  if not found then raise exception 'Learner subject registration not found'; end if;
  if not app_private.can_manage_learner_subject_registrations(v_registration.school_id) then
    raise exception 'Permission denied';
  end if;

  if v_registration.status='withdrawn' then
    return true;
  end if;

  update public.learner_subject_registrations
  set status='withdrawn',
      withdrawn_by_user_id=auth.uid(),
      withdrawn_at=now(),
      withdrawal_reason=v_reason
  where id=v_registration.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_registration.tenant_id,v_registration.school_id,auth.uid(),
    'learner_subject_registration.withdrawn','learner_subject_registration',v_registration.id,
    jsonb_build_object(
      'enrolment_id',v_registration.enrolment_id,
      'learner_id',v_registration.learner_id,
      'subject_offering_id',v_registration.subject_offering_id,
      'academic_year',v_registration.academic_year,
      'reason',v_reason
    )
  );

  return true;
end;
$$;

revoke all on function public.withdraw_learner_subject_registration(uuid,text) from public,anon;
grant execute on function public.withdraw_learner_subject_registration(uuid,text) to authenticated;

comment on table public.learner_subject_registrations is
  'Authoritative school-year subject choices for an enrolled learner. This foundation is intentionally not retroactively enforced against existing marks/results until schools populate and reconcile registrations.';
comment on function public.register_learner_subject(uuid,uuid,text) is
  'Idempotently registers or reactivates an enrolment for a same-school, same-year, same-grade active subject offering through an audited academic-management boundary.';
comment on function public.withdraw_learner_subject_registration(uuid,text) is
  'Withdraws an active learner subject registration without deleting academic choice history.';
