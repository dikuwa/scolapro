-- Issue #675: canonical Teaching Group foundation.
-- Teaching Groups are the instructional cohort for one subject offering. They
-- remain distinct from register classes and field/academic groups.

create table public.teaching_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  subject_offering_id uuid not null references public.subject_offerings(id) on delete restrict,
  code text not null,
  name text not null,
  status text not null default 'active' check (status in ('active','inactive')),
  effective_from date not null default current_date,
  effective_to date,
  created_by_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, academic_year, code),
  check (effective_to is null or effective_to >= effective_from)
);

create table public.teaching_group_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  teaching_group_id uuid not null references public.teaching_groups(id) on delete restrict,
  enrolment_id uuid not null references public.enrolments(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  effective_from date not null,
  effective_to date,
  source text not null default 'manual' check (btrim(source) <> ''),
  created_by_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (teaching_group_id, enrolment_id, effective_from),
  check (effective_to is null or effective_to >= effective_from)
);

-- A group may be taught by more than one effective allocation. This relation
-- is intentionally separate from membership so split/mixed cohorts do not
-- acquire a second teacher or timetable model.
create table public.teaching_group_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  teaching_group_id uuid not null references public.teaching_groups(id) on delete restrict,
  teacher_allocation_id uuid not null references public.teacher_allocations(id) on delete restrict,
  effective_from date not null,
  effective_to date,
  source text not null default 'manual' check (btrim(source) <> ''),
  created_by_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (teaching_group_id, teacher_allocation_id, effective_from),
  check (effective_to is null or effective_to >= effective_from)
);

create index teaching_groups_offering_current_idx
  on public.teaching_groups(school_id, academic_year, subject_offering_id, status, effective_from, effective_to);
create index teaching_group_memberships_group_effective_idx
  on public.teaching_group_memberships(teaching_group_id, effective_from, effective_to, learner_id);
create index teaching_group_memberships_enrolment_idx
  on public.teaching_group_memberships(enrolment_id, effective_from, effective_to);
create index teaching_group_allocations_group_effective_idx
  on public.teaching_group_allocations(teaching_group_id, effective_from, effective_to);
create index teaching_group_allocations_allocation_idx
  on public.teaching_group_allocations(teacher_allocation_id, effective_from, effective_to);

create or replace function app_private.enforce_teaching_group_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_school_tenant uuid;
  v_offering record;
  v_group record;
  v_enrolment record;
  v_allocation record;
begin
  -- Column-specific immutability must be scoped per table: the trigger fires on
  -- three tables and subject_offering_id/code exist only on teaching_groups.
  if tg_table_name='teaching_groups' then
    if tg_op='UPDATE' and (
      new.tenant_id is distinct from old.tenant_id
      or new.school_id is distinct from old.school_id
      or new.academic_year is distinct from old.academic_year
      or new.subject_offering_id is distinct from old.subject_offering_id
      or new.code is distinct from old.code
      or new.created_at is distinct from old.created_at
    ) then
      raise exception 'Teaching group identity and provenance are immutable';
    end if;

    select s.tenant_id into v_school_tenant from public.schools s where s.id=new.school_id;
    select so.tenant_id,so.school_id,so.academic_year into v_offering
    from public.subject_offerings so where so.id=new.subject_offering_id;
    if v_school_tenant is null or v_offering.tenant_id is null
       or new.tenant_id<>v_school_tenant or new.tenant_id<>v_offering.tenant_id
       or new.school_id<>v_offering.school_id or new.academic_year<>v_offering.academic_year then
      raise exception 'Teaching group scope does not match school and subject offering';
    end if;
    return new;
  end if;

  if tg_op='UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.academic_year is distinct from old.academic_year
    or new.teaching_group_id is distinct from old.teaching_group_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Teaching group relation identity and provenance are immutable';
  end if;

  select tg.tenant_id,tg.school_id,tg.academic_year,tg.subject_offering_id
    into v_group from public.teaching_groups tg where tg.id=new.teaching_group_id;
  if v_group.tenant_id is null or row(new.tenant_id,new.school_id,new.academic_year)
     is distinct from row(v_group.tenant_id,v_group.school_id,v_group.academic_year) then
    raise exception 'Teaching group membership scope mismatch';
  end if;

  if tg_table_name='teaching_group_memberships' then
    select e.tenant_id,e.school_id,e.academic_year,e.learner_id into v_enrolment
    from public.enrolments e where e.id=new.enrolment_id;
    if v_enrolment.tenant_id is null or row(new.tenant_id,new.school_id,new.academic_year,new.learner_id)
       is distinct from row(v_enrolment.tenant_id,v_enrolment.school_id,v_enrolment.academic_year,v_enrolment.learner_id) then
      raise exception 'Teaching group membership enrolment scope mismatch';
    end if;
    if not exists (
      select 1 from public.learner_subject_registrations lsr
      where lsr.enrolment_id=new.enrolment_id
        and lsr.learner_id=new.learner_id
        and lsr.subject_offering_id=v_group.subject_offering_id
        and lsr.school_id=new.school_id
        and lsr.academic_year=new.academic_year
    ) then
      raise exception 'Teaching group membership requires a matching learner subject registration';
    end if;
    return new;
  end if;

  select ta.tenant_id,ta.school_id,ta.academic_year,ta.subject_offering_id
    into v_allocation from public.teacher_allocations ta where ta.id=new.teacher_allocation_id;
  if v_allocation.tenant_id is null or row(new.tenant_id,new.school_id,new.academic_year,v_group.subject_offering_id)
     is distinct from row(v_allocation.tenant_id,v_allocation.school_id,v_allocation.academic_year,v_allocation.subject_offering_id) then
    raise exception 'Teaching group allocation scope mismatch';
  end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_teaching_group_scope_integrity() from public,anon,authenticated;

create trigger teaching_group_scope_integrity_trg
before insert or update on public.teaching_groups
for each row execute function app_private.enforce_teaching_group_scope_integrity();
create trigger teaching_group_membership_scope_integrity_trg
before insert or update on public.teaching_group_memberships
for each row execute function app_private.enforce_teaching_group_scope_integrity();
create trigger teaching_group_allocation_scope_integrity_trg
before insert or update on public.teaching_group_allocations
for each row execute function app_private.enforce_teaching_group_scope_integrity();

alter table public.teaching_groups enable row level security;
alter table public.teaching_group_memberships enable row level security;
alter table public.teaching_group_allocations enable row level security;

create policy "school members can read teaching groups"
on public.teaching_groups for select to authenticated
using (app_private.has_school_access(school_id));
create policy "school managers can manage teaching groups"
on public.teaching_groups for insert to authenticated
with check (app_private.can_manage_school_members(school_id));
create policy "school managers can update teaching groups"
on public.teaching_groups for update to authenticated
using (app_private.can_manage_school_members(school_id))
with check (app_private.can_manage_school_members(school_id));

create policy "school members can read teaching group memberships"
on public.teaching_group_memberships for select to authenticated
using (app_private.has_school_access(school_id));
create policy "school managers can manage teaching group memberships"
on public.teaching_group_memberships for insert to authenticated
with check (app_private.can_manage_school_members(school_id));
create policy "school managers can update teaching group memberships"
on public.teaching_group_memberships for update to authenticated
using (app_private.can_manage_school_members(school_id))
with check (app_private.can_manage_school_members(school_id));

create policy "school members can read teaching group allocations"
on public.teaching_group_allocations for select to authenticated
using (app_private.has_school_access(school_id));
create policy "school managers can manage teaching group allocations"
on public.teaching_group_allocations for insert to authenticated
with check (app_private.can_manage_school_members(school_id));
create policy "school managers can update teaching group allocations"
on public.teaching_group_allocations for update to authenticated
using (app_private.can_manage_school_members(school_id))
with check (app_private.can_manage_school_members(school_id));

revoke delete on public.teaching_groups,public.teaching_group_memberships,public.teaching_group_allocations from authenticated;
grant select,insert,update on public.teaching_groups,public.teaching_group_memberships,public.teaching_group_allocations to authenticated;

create or replace function public.resolve_teaching_groups(
  p_school_id uuid,
  p_academic_year integer,
  p_subject_offering_id uuid default null
) returns table(
  id uuid, tenant_id uuid, school_id uuid, academic_year integer,
  subject_offering_id uuid, code text, name text, status text,
  effective_from date, effective_to date, learner_count bigint
)
language sql stable security invoker
set search_path=public,app_private
as $$
  select tg.id,tg.tenant_id,tg.school_id,tg.academic_year,tg.subject_offering_id,
         tg.code,tg.name,tg.status,tg.effective_from,tg.effective_to,
         count(tgm.id) filter (where tgm.effective_from<=current_date and (tgm.effective_to is null or tgm.effective_to>=current_date))
  from public.teaching_groups tg
  left join public.teaching_group_memberships tgm on tgm.teaching_group_id=tg.id
  where tg.school_id=p_school_id
    and tg.academic_year=p_academic_year
    and (p_subject_offering_id is null or tg.subject_offering_id=p_subject_offering_id)
    and tg.effective_from<=current_date and (tg.effective_to is null or tg.effective_to>=current_date)
    and tg.status='active'
    and app_private.has_school_access(tg.school_id)
  group by tg.id
  order by tg.name,tg.code;
$$;

create or replace function public.resolve_teaching_group_members(
  p_teaching_group_id uuid,
  p_reference_date date default current_date
) returns table(
  teaching_group_id uuid, enrolment_id uuid, learner_id uuid,
  effective_from date, effective_to date, source text
)
language sql stable security invoker
set search_path=public,app_private
as $$
  select tgm.teaching_group_id,tgm.enrolment_id,tgm.learner_id,tgm.effective_from,tgm.effective_to,tgm.source
  from public.teaching_group_memberships tgm
  join public.teaching_groups tg on tg.id=tgm.teaching_group_id
  where tgm.teaching_group_id=p_teaching_group_id
    and tgm.effective_from<=coalesce(p_reference_date,current_date) and (tgm.effective_to is null or tgm.effective_to>=coalesce(p_reference_date,current_date))
    and tg.effective_from<=coalesce(p_reference_date,current_date) and (tg.effective_to is null or tg.effective_to>=coalesce(p_reference_date,current_date))
    and tg.status='active' and app_private.has_school_access(tg.school_id);
$$;

create or replace function public.resolve_teaching_group_allocations(
  p_teaching_group_id uuid,
  p_reference_date date default current_date
) returns table(
  teaching_group_id uuid, teacher_allocation_id uuid,
  effective_from date, effective_to date, source text
)
language sql stable security invoker
set search_path=public,app_private
as $$
  select tga.teaching_group_id,tga.teacher_allocation_id,tga.effective_from,tga.effective_to,tga.source
  from public.teaching_group_allocations tga
  join public.teaching_groups tg on tg.id=tga.teaching_group_id
  where tga.teaching_group_id=p_teaching_group_id
    and tga.effective_from<=coalesce(p_reference_date,current_date) and (tga.effective_to is null or tga.effective_to>=coalesce(p_reference_date,current_date))
    and tg.effective_from<=coalesce(p_reference_date,current_date) and (tg.effective_to is null or tg.effective_to>=coalesce(p_reference_date,current_date))
    and tg.status='active' and app_private.has_school_access(tg.school_id);
$$;

revoke all on function public.resolve_teaching_groups(uuid,integer,uuid) from public,anon;
revoke all on function public.resolve_teaching_group_members(uuid,date) from public,anon;
revoke all on function public.resolve_teaching_group_allocations(uuid,date) from public,anon;
grant execute on function public.resolve_teaching_groups(uuid,integer,uuid),public.resolve_teaching_group_members(uuid,date),public.resolve_teaching_group_allocations(uuid,date) to authenticated;

-- Safe backfill: only active subject registrations with an unambiguous current
-- register class receive a group. Teacher allocations alone never create a group.
insert into public.teaching_groups(tenant_id,school_id,academic_year,subject_offering_id,code,name,status,effective_from,created_by_user_id)
select distinct on (so.id,e.register_class_id)
  so.tenant_id,so.school_id,so.academic_year,so.id,
  'offering:'||so.id::text||':class:'||e.register_class_id::text,
  coalesce(sub.display_name,'Subject')||' '||coalesce(g.display_name,'Grade')||' — '||coalesce(rc.display_name,'Teaching Group'),
  'active',current_date,null
from public.learner_subject_registrations lsr
join public.enrolments e on e.id=lsr.enrolment_id and e.register_class_id is not null
join public.subject_offerings so on so.id=lsr.subject_offering_id and so.school_id=lsr.school_id and so.academic_year=lsr.academic_year
join public.subjects sub on sub.id=so.subject_id
join public.grades g on g.id=so.grade_id
join public.register_classes rc on rc.id=e.register_class_id and rc.school_id=so.school_id and rc.academic_year=so.academic_year
where lsr.status='active'
  and not exists (select 1 from public.teaching_groups tg where tg.school_id=so.school_id and tg.academic_year=so.academic_year and tg.code='offering:'||so.id::text||':class:'||e.register_class_id::text)
order by so.id,e.register_class_id;

-- Membership windows are clamped to the enrolment window so a retroactive
-- registration on an already-ended enrolment cannot produce effective_to
-- earlier than effective_from (which would abort the migration on the
-- membership CHECK constraint).
insert into public.teaching_group_memberships(tenant_id,school_id,academic_year,teaching_group_id,enrolment_id,learner_id,effective_from,effective_to,source)
select lsr.tenant_id,lsr.school_id,lsr.academic_year,tg.id,lsr.enrolment_id,lsr.learner_id,
       greatest(e.enrolled_from,lsr.registered_at::date),
       greatest(
         greatest(e.enrolled_from,lsr.registered_at::date),
         case when lsr.status='withdrawn' then lsr.withdrawn_at::date else e.enrolled_to end
       ),
       'backfill:learner_subject_registration'
from public.learner_subject_registrations lsr
join public.enrolments e on e.id=lsr.enrolment_id and e.register_class_id is not null
join public.teaching_groups tg on tg.school_id=lsr.school_id and tg.academic_year=lsr.academic_year
  and tg.subject_offering_id=lsr.subject_offering_id
  and tg.code='offering:'||lsr.subject_offering_id::text||':class:'||e.register_class_id::text
where not exists (select 1 from public.teaching_group_memberships existing where existing.teaching_group_id=tg.id and existing.enrolment_id=lsr.enrolment_id and existing.effective_from=greatest(e.enrolled_from,lsr.registered_at::date));

comment on table public.teaching_groups is 'Canonical instructional cohort for one subject offering; distinct from register classes and field/academic groups.';
comment on table public.teaching_group_memberships is 'Effective-dated learner membership in a canonical Teaching Group, backed by learner subject registration.';
comment on table public.teaching_group_allocations is 'Effective-dated optional relationship between a Teaching Group and canonical teacher allocation.';
