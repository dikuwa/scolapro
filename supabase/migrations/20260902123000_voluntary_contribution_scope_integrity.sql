create or replace function app_private.enforce_voluntary_contribution_campaign_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.academic_year is distinct from old.academic_year
    or new.created_by_user_id is distinct from old.created_by_user_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Voluntary contribution campaign scope and provenance are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Voluntary contribution campaign scope mismatch: school does not belong to tenant';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_voluntary_contribution_campaign_scope_integrity() from public, anon, authenticated;

drop trigger if exists voluntary_contribution_campaign_scope_integrity_trg on public.voluntary_contribution_campaigns;
create trigger voluntary_contribution_campaign_scope_integrity_trg
before insert or update of tenant_id, school_id, academic_year, created_by_user_id, created_at
on public.voluntary_contribution_campaigns
for each row execute function app_private.enforce_voluntary_contribution_campaign_scope_integrity();

create or replace function app_private.enforce_voluntary_contribution_item_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_campaign_tenant uuid;
  v_campaign_school uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.campaign_id is distinct from old.campaign_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Voluntary contribution item scope and provenance are immutable';
  end if;

  select c.tenant_id, c.school_id
    into v_campaign_tenant, v_campaign_school
    from public.voluntary_contribution_campaigns c
   where c.id = new.campaign_id;

  if v_campaign_tenant is null then
    raise exception 'Voluntary contribution item campaign not found';
  end if;

  if new.tenant_id <> v_campaign_tenant or new.school_id <> v_campaign_school then
    raise exception 'Voluntary contribution item scope mismatch: campaign does not match tenant and school';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_voluntary_contribution_item_scope_integrity() from public, anon, authenticated;

drop trigger if exists voluntary_contribution_item_scope_integrity_trg on public.voluntary_contribution_items;
create trigger voluntary_contribution_item_scope_integrity_trg
before insert or update of tenant_id, school_id, campaign_id, created_at
on public.voluntary_contribution_items
for each row execute function app_private.enforce_voluntary_contribution_item_scope_integrity();

create or replace function app_private.enforce_learner_voluntary_contribution_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_campaign_tenant uuid;
  v_campaign_school uuid;
  v_campaign_year integer;
  v_campaign_start date;
  v_campaign_end date;
  v_item_tenant uuid;
  v_item_school uuid;
  v_item_campaign uuid;
  v_enrol_tenant uuid;
  v_enrol_school uuid;
  v_enrol_learner uuid;
  v_enrol_year integer;
  v_enrolled_from date;
  v_enrolled_to date;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.learner_id is distinct from old.learner_id
    or new.enrolment_id is distinct from old.enrolment_id
    or new.campaign_id is distinct from old.campaign_id
    or new.item_id is distinct from old.item_id
    or new.contribution_date is distinct from old.contribution_date
    or new.received_by_staff_member_id is distinct from old.received_by_staff_member_id
    or new.recorded_by_user_id is distinct from old.recorded_by_user_id
    or new.source is distinct from old.source
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Learner voluntary contribution identity and provenance are immutable';
  end if;

  select c.tenant_id, c.school_id, c.academic_year, c.starts_on, c.ends_on
    into v_campaign_tenant, v_campaign_school, v_campaign_year, v_campaign_start, v_campaign_end
    from public.voluntary_contribution_campaigns c
   where c.id = new.campaign_id;

  if v_campaign_tenant is null then
    raise exception 'Voluntary contribution campaign not found';
  end if;

  select i.tenant_id, i.school_id, i.campaign_id
    into v_item_tenant, v_item_school, v_item_campaign
    from public.voluntary_contribution_items i
   where i.id = new.item_id;

  if v_item_tenant is null then
    raise exception 'Voluntary contribution item not found';
  end if;

  if new.tenant_id <> v_campaign_tenant
     or new.school_id <> v_campaign_school
     or new.tenant_id <> v_item_tenant
     or new.school_id <> v_item_school
     or v_item_campaign <> new.campaign_id then
    raise exception 'Learner voluntary contribution scope mismatch: campaign or item does not match tenant and school';
  end if;

  if new.enrolment_id is null then
    raise exception 'Learner voluntary contribution enrolment is required';
  end if;

  select e.tenant_id, e.school_id, e.learner_id, e.academic_year, e.enrolled_from, e.enrolled_to
    into v_enrol_tenant, v_enrol_school, v_enrol_learner, v_enrol_year, v_enrolled_from, v_enrolled_to
    from public.enrolments e
   where e.id = new.enrolment_id;

  if v_enrol_tenant is null then
    raise exception 'Learner voluntary contribution enrolment not found';
  end if;

  if new.tenant_id <> v_enrol_tenant
     or new.school_id <> v_enrol_school
     or new.learner_id <> v_enrol_learner
     or v_enrol_year <> v_campaign_year then
    raise exception 'Learner voluntary contribution enrolment scope mismatch';
  end if;

  if new.contribution_date < v_enrolled_from
     or (v_enrolled_to is not null and new.contribution_date > v_enrolled_to)
     or new.contribution_date < v_campaign_start
     or (v_campaign_end is not null and new.contribution_date > v_campaign_end) then
    raise exception 'Learner voluntary contribution date is outside enrolment or campaign period';
  end if;

  if new.received_by_staff_member_id is not null and not exists (
    select 1
    from public.staff_school_assignments ssa
    where ssa.tenant_id = new.tenant_id
      and ssa.school_id = new.school_id
      and ssa.staff_member_id = new.received_by_staff_member_id
      and ssa.effective_from <= new.contribution_date
      and (ssa.effective_to is null or ssa.effective_to >= new.contribution_date)
  ) then
    raise exception 'Receiving staff member is not actively assigned to contribution school';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_learner_voluntary_contribution_scope_integrity() from public, anon, authenticated;

drop trigger if exists learner_voluntary_contribution_scope_integrity_trg on public.learner_voluntary_contributions;
create trigger learner_voluntary_contribution_scope_integrity_trg
before insert or update of tenant_id, school_id, learner_id, enrolment_id, campaign_id, item_id, contribution_date, received_by_staff_member_id, recorded_by_user_id, source, created_at
on public.learner_voluntary_contributions
for each row execute function app_private.enforce_learner_voluntary_contribution_scope_integrity();
