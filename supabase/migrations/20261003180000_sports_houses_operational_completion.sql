-- Issue #997: Sports/Houses operational completion + reusable learner compact-contact read models.
-- Canonical assignments, guardian data and learner subject registrations remain the only source of truth.

create table if not exists public.sports_age_group_source_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  source_key text not null check (btrim(source_key)<>''),
  source_title text not null check (btrim(source_title)<>''),
  labels text[] not null check (cardinality(labels)>0),
  provenance jsonb not null default '{}'::jsonb,
  status text not null default 'proposed' check (status in ('proposed','reviewed','retired')),
  created_at timestamptz not null default now(),
  unique(school_id,academic_year,source_key)
);

alter table public.sports_age_group_source_proposals enable row level security;

drop policy if exists "school members can read sports age group source proposals"
on public.sports_age_group_source_proposals;
create policy "school members can read sports age group source proposals"
on public.sports_age_group_source_proposals for select to authenticated
using (app_private.has_school_access(school_id));

revoke all on public.sports_age_group_source_proposals from public,anon,authenticated;
grant select on public.sports_age_group_source_proposals to authenticated;

comment on table public.sports_age_group_source_proposals is
'Source-grounded age-group labels proposed for school review. Rows never create or rewrite canonical sports_age_groups or sports_year_settings.';

insert into public.sports_age_group_source_proposals(
  tenant_id,school_id,academic_year,source_key,source_title,labels,provenance,status
)
select
  s.tenant_id,
  s.id,
  2026,
  'nhs-sports-teams-2026',
  'Home Sport Report 2026 / sports teams.pdf',
  array['U13','U14','U15','U16','U17','U18','U19','U20']::text[],
  jsonb_build_object(
    'source_file','sports teams.pdf',
    'source_pages',30,
    'meaning','Source roster labels only; reference date and age-band min/max rules remain school-verified.',
    'canonical_write',false
  ),
  'proposed'
from public.schools s
where s.id='22222222-2222-4222-8222-222222222222'
  and s.name='Namib High School'
on conflict(school_id,academic_year,source_key) do nothing;

create or replace function public.get_sports_house_operational_learner_roster(
  p_school_id uuid,
  p_academic_year integer
)
returns table(
  tenant_id uuid,
  school_id uuid,
  academic_year integer,
  learner_id uuid,
  first_names text,
  surname text,
  admission_number text,
  sex text,
  grade_id uuid,
  grade_name text,
  register_class_id uuid,
  register_class_name text,
  house_id uuid,
  house_name text,
  house_color_hex text,
  assignment_source text,
  is_locked boolean,
  assigned_at timestamptz,
  age_on_reference_date integer,
  age_group_label text
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $sports_operational_roster$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if app_private.has_platform_role(array['platform_support']) then raise exception 'Permission denied'; end if;
  if not app_private.has_platform_role(array['platform_admin'])
     and not app_private.has_school_role(
       p_school_id,
       array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']
     ) then
    raise exception 'Permission denied';
  end if;
  if p_academic_year<2000 or p_academic_year>2200 then raise exception 'Academic year is invalid'; end if;

  return query
  with eligible_enrolments as (
    select distinct on (e.learner_id)
      e.tenant_id,e.school_id,e.academic_year,e.learner_id,e.admission_number,
      e.grade_id,e.register_class_id
    from public.enrolments e
    where e.school_id=p_school_id
      and e.academic_year=p_academic_year
      and e.status in ('current','completed','transferred')
      and (
        app_private.has_platform_role(array['platform_admin'])
        or app_private.has_school_local_role(
          p_school_id,
          array['school_admin','principal','deputy_principal']
        )
        or app_private.can_read_learner_identity(p_school_id,e.learner_id)
      )
    order by e.learner_id,
      case e.status when 'current' then 1 when 'completed' then 2 when 'transferred' then 3 else 4 end,
      e.enrolled_from desc,e.id
  )
  select
    e.tenant_id,e.school_id,e.academic_year,e.learner_id,
    l.first_names,l.surname,e.admission_number,l.sex,
    e.grade_id,g.display_name,
    e.register_class_id,rc.display_name,
    a.house_id,h.name,h.color_hex,a.assignment_source,
    coalesce(a.is_locked,false),a.assigned_at,
    case
      when ys.age_reference_date is not null and l.date_of_birth is not null
        then extract(year from age(ys.age_reference_date,l.date_of_birth))::integer
      else null
    end,
    ag.label
  from eligible_enrolments e
  join public.learners l on l.id=e.learner_id and l.tenant_id=e.tenant_id
  left join public.grades g on g.id=e.grade_id and g.school_id=e.school_id and g.academic_year=e.academic_year
  left join public.register_classes rc on rc.id=e.register_class_id and rc.school_id=e.school_id and rc.academic_year=e.academic_year
  left join public.sports_learner_house_assignments a
    on a.tenant_id=e.tenant_id and a.school_id=e.school_id
   and a.academic_year=e.academic_year and a.learner_id=e.learner_id
  left join public.sports_houses h
    on h.id=a.house_id and h.tenant_id=a.tenant_id and h.school_id=a.school_id
  left join public.sports_year_settings ys
    on ys.tenant_id=e.tenant_id and ys.school_id=e.school_id and ys.academic_year=e.academic_year
  left join lateral (
    select sag.label
    from public.sports_age_groups sag
    where sag.tenant_id=e.tenant_id and sag.school_id=e.school_id and sag.status='active'
      and ys.age_reference_date is not null and l.date_of_birth is not null
      and (sag.min_age is null or extract(year from age(ys.age_reference_date,l.date_of_birth))::integer>=sag.min_age)
      and (sag.max_age is null or extract(year from age(ys.age_reference_date,l.date_of_birth))::integer<=sag.max_age)
    order by sag.sort_order,sag.label,sag.id
    limit 1
  ) ag on true
  order by g.display_name nulls last,rc.display_name nulls last,l.surname,l.first_names,e.learner_id;
end;
$sports_operational_roster$;

revoke all on function public.get_sports_house_operational_learner_roster(uuid,integer) from public,anon;
grant execute on function public.get_sports_house_operational_learner_roster(uuid,integer) to authenticated;

comment on function public.get_sports_house_operational_learner_roster(uuid,integer) is
'School/year Sports/Houses learner roster including grade, register class and sex for operational filtering/export. It derives age groups only from verified school year settings and canonical age bands.';

create or replace function public.resolve_effective_learner_guardian_contact(
  p_learner_id uuid,
  p_school_id uuid,
  p_reference_date date default current_date
)
returns table(
  relationship_id uuid,
  guardian_id uuid,
  guardian_name text,
  relationship_type text,
  relationship_priority smallint,
  phone text,
  phone_type text
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $effective_guardian_contact$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if app_private.has_platform_role(array['platform_support']) then raise exception 'Permission denied'; end if;
  if p_reference_date is null then raise exception 'Reference date is required'; end if;
  if not app_private.has_platform_role(array['platform_admin'])
     and not app_private.is_guardian_current_school(p_school_id) then
    raise exception 'Permission denied';
  end if;
  if not app_private.can_read_learner_identity(p_school_id,p_learner_id) then
    raise exception 'Permission denied';
  end if;

  if not exists(
    select 1 from public.enrolments e
    where e.learner_id=p_learner_id
      and e.school_id=p_school_id
      and e.enrolled_from<=p_reference_date
      and (e.enrolled_to is null or e.enrolled_to>=p_reference_date)
  ) then
    return;
  end if;

  return query
  select
    lg.id,
    lg.guardian_id,
    btrim(concat_ws(' ',gp.first_names,gp.surname)),
    lg.relationship_type,
    lg.priority,
    contact.contact_value,
    contact.contact_type
  from public.learner_guardians lg
  join public.guardian_profiles gp on gp.id=lg.guardian_id and gp.tenant_id=lg.tenant_id
  join lateral (
    select gc.contact_value,gc.contact_type
    from public.guardian_contacts gc
    where gc.guardian_id=lg.guardian_id
      and gc.tenant_id=lg.tenant_id
      and gc.contact_type in ('mobile','phone')
      and btrim(gc.contact_value)<>''
      and gc.effective_from<=p_reference_date
      and (gc.effective_to is null or gc.effective_to>=p_reference_date)
    order by gc.is_primary desc,
      case gc.contact_type when 'mobile' then 1 else 2 end,
      gc.effective_from desc,gc.id
    limit 1
  ) contact on true
  where lg.learner_id=p_learner_id
    and app_private.can_read_guardian(lg.guardian_id)
    and lg.effective_from<=p_reference_date
    and (lg.effective_to is null or lg.effective_to>=p_reference_date)
  order by lg.priority,lg.effective_from,lg.id
  limit 1;
end;
$effective_guardian_contact$;

revoke all on function public.resolve_effective_learner_guardian_contact(uuid,uuid,date) from public,anon;
grant execute on function public.resolve_effective_learner_guardian_contact(uuid,uuid,date) to authenticated;

comment on function public.resolve_effective_learner_guardian_contact(uuid,uuid,date) is
'Shared immediate-contact resolver: first effective guardian by relationship priority that has a usable effective mobile/phone; address data is never returned.';

create or replace function public.get_learner_compact_operational_context(
  p_learner_id uuid,
  p_school_id uuid,
  p_academic_year integer,
  p_enrolment_id uuid
)
returns table(
  house_name text,
  subject_names text[]
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $compact_operational_context$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if app_private.has_platform_role(array['platform_support']) then raise exception 'Permission denied'; end if;
  if not app_private.can_read_learner_identity(p_school_id,p_learner_id) then
    raise exception 'Permission denied';
  end if;

  if not exists(
    select 1 from public.enrolments e
    where e.id=p_enrolment_id and e.learner_id=p_learner_id
      and e.school_id=p_school_id and e.academic_year=p_academic_year
  ) then
    raise exception 'Learner enrolment is outside school/year scope';
  end if;

  return query
  select
    (
      select h.name
      from public.sports_learner_house_assignments a
      join public.sports_houses h on h.id=a.house_id and h.school_id=a.school_id
      where a.school_id=p_school_id and a.academic_year=p_academic_year
        and a.learner_id=p_learner_id
      limit 1
    ),
    coalesce(
      (
        select array_agg(distinct s.display_name order by s.display_name)
        from public.learner_subject_registrations lsr
        join public.subject_offerings so
          on so.id=lsr.subject_offering_id
         and so.school_id=lsr.school_id
         and so.academic_year=lsr.academic_year
        join public.subjects s on s.id=so.subject_id
        where lsr.enrolment_id=p_enrolment_id
          and lsr.learner_id=p_learner_id
          and lsr.school_id=p_school_id
          and lsr.academic_year=p_academic_year
          and lsr.status='active'
      ),
      '{}'::text[]
    );
end;
$compact_operational_context$;

revoke all on function public.get_learner_compact_operational_context(uuid,uuid,integer,uuid) from public,anon;
grant execute on function public.get_learner_compact_operational_context(uuid,uuid,integer,uuid) to authenticated;

comment on function public.get_learner_compact_operational_context(uuid,uuid,integer,uuid) is
'Read-only compact learner context derived from canonical year-scoped house assignment and active learner subject registrations.';
