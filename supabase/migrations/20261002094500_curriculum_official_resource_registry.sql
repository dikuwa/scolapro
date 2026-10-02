-- Issue #991: phase-agnostic national curriculum applicability and official resource registry.
-- Extends the existing curriculum registry. No parallel curriculum store is introduced.

create table public.curriculum_version_applicability (
  id uuid primary key default gen_random_uuid(),
  curriculum_version_id uuid not null references public.curriculum_versions(id) on delete cascade,
  phase_code text not null check (btrim(phase_code) <> ''),
  grade_key text not null check (btrim(grade_key) <> ''),
  programme_code text,
  qualification_code text,
  academic_regime text,
  language_code text,
  created_at timestamptz not null default now()
);

create unique index curriculum_version_applicability_identity_uidx
on public.curriculum_version_applicability(
  curriculum_version_id,
  lower(btrim(phase_code)),
  lower(btrim(grade_key)),
  lower(coalesce(btrim(programme_code),'')),
  lower(coalesce(btrim(qualification_code),'')),
  lower(coalesce(btrim(academic_regime),'')),
  lower(coalesce(btrim(language_code),''))
);

create index curriculum_version_applicability_resolver_idx
on public.curriculum_version_applicability(
  lower(btrim(phase_code)),
  lower(btrim(grade_key)),
  curriculum_version_id
);

alter table public.curriculum_units
  add column if not exists applicable_grade_keys text[] not null default '{}'::text[];
alter table public.curriculum_objectives
  add column if not exists applicable_grade_keys text[] not null default '{}'::text[];
alter table public.curriculum_competencies
  add column if not exists applicable_grade_keys text[] not null default '{}'::text[];
alter table public.curriculum_practicals
  add column if not exists applicable_grade_keys text[] not null default '{}'::text[];

create table public.official_education_resources (
  id uuid primary key default gen_random_uuid(),
  authority text not null,
  resource_key text not null,
  document_type text not null check (document_type in (
    'syllabus',
    'national_curriculum',
    'subject_policy_guide',
    'teacher_guide',
    'assessment_guide',
    'specimen_examination_paper',
    'marking_scheme',
    'examiner_report',
    'textbook_catalogue',
    'learning_support_material',
    'inclusive_education_guidance',
    'administrative_directive',
    'circular',
    'other'
  )),
  title text not null,
  source_url text not null,
  publication_label text,
  publication_date date,
  checksum text,
  language_code text,
  status text not null default 'discovered' check (status in (
    'discovered',
    'fetched',
    'extracted',
    'under_review',
    'published',
    'superseded',
    'withdrawn'
  )),
  supersedes_resource_id uuid references public.official_education_resources(id) on delete restrict,
  provenance jsonb not null default '{}'::jsonb,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(authority,resource_key),
  check (supersedes_resource_id is null or supersedes_resource_id <> id),
  check (
    status not in ('published','superseded')
    or (checksum is not null and btrim(checksum) <> '' and approved_by_user_id is not null and approved_at is not null)
  )
);

create index official_education_resources_status_type_idx
on public.official_education_resources(status,document_type,authority);

create table public.official_education_resource_applicability (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.official_education_resources(id) on delete cascade,
  curriculum_subject_id uuid references public.curriculum_subjects(id) on delete restrict,
  phase_code text,
  grade_key text,
  programme_code text,
  qualification_code text,
  academic_regime text,
  language_code text,
  effective_from_year integer check (effective_from_year between 1900 and 2200),
  effective_to_year integer check (effective_to_year between 1900 and 2200),
  created_at timestamptz not null default now(),
  check (effective_to_year is null or effective_from_year is null or effective_to_year >= effective_from_year),
  check (
    curriculum_subject_id is not null
    or phase_code is not null
    or grade_key is not null
    or programme_code is not null
    or qualification_code is not null
    or academic_regime is not null
    or language_code is not null
  )
);

create unique index official_resource_applicability_identity_uidx
on public.official_education_resource_applicability(
  resource_id,
  coalesce(curriculum_subject_id,'00000000-0000-0000-0000-000000000000'::uuid),
  lower(coalesce(btrim(phase_code),'')),
  lower(coalesce(btrim(grade_key),'')),
  lower(coalesce(btrim(programme_code),'')),
  lower(coalesce(btrim(qualification_code),'')),
  lower(coalesce(btrim(academic_regime),'')),
  lower(coalesce(btrim(language_code),'')),
  coalesce(effective_from_year,0),
  coalesce(effective_to_year,9999)
);

create table public.official_education_resource_curriculum_links (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.official_education_resources(id) on delete cascade,
  curriculum_source_id uuid references public.curriculum_sources(id) on delete restrict,
  curriculum_version_id uuid references public.curriculum_versions(id) on delete restrict,
  relationship_type text not null check (relationship_type in (
    'source',
    'syllabus',
    'policy',
    'assessment_guidance',
    'teacher_support',
    'companion'
  )),
  created_at timestamptz not null default now(),
  check (curriculum_source_id is not null or curriculum_version_id is not null)
);

create unique index official_resource_version_link_uidx
on public.official_education_resource_curriculum_links(resource_id,curriculum_version_id,relationship_type)
where curriculum_version_id is not null;

create unique index official_resource_source_link_uidx
on public.official_education_resource_curriculum_links(resource_id,curriculum_source_id,relationship_type)
where curriculum_source_id is not null;

create table public.school_subject_curriculum_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  curriculum_subject_id uuid not null references public.curriculum_subjects(id) on delete restrict,
  grade_code text not null check (btrim(grade_code) <> ''),
  phase_code text not null check (btrim(phase_code) <> ''),
  programme_code text,
  qualification_code text,
  academic_regime text,
  language_code text,
  effective_from_year integer not null check (effective_from_year between 1900 and 2200),
  effective_to_year integer check (effective_to_year between 1900 and 2200),
  status text not null default 'draft' check (status in ('draft','verified','archived')),
  mapping_source text not null default 'school_review' check (mapping_source in ('platform_seed','official_import','school_review')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  verified_by_user_id uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to_year is null or effective_to_year >= effective_from_year),
  check (status <> 'verified' or (verified_by_user_id is not null and verified_at is not null))
);

create index school_subject_curriculum_mapping_resolver_idx
on public.school_subject_curriculum_mappings(
  school_id,
  subject_id,
  lower(btrim(grade_code)),
  status,
  effective_from_year,
  effective_to_year
);

create unique index school_subject_curriculum_mapping_identity_uidx
on public.school_subject_curriculum_mappings(
  school_id,
  subject_id,
  lower(btrim(grade_code)),
  lower(btrim(phase_code)),
  lower(coalesce(btrim(programme_code),'')),
  lower(coalesce(btrim(qualification_code),'')),
  lower(coalesce(btrim(academic_regime),'')),
  lower(coalesce(btrim(language_code),'')),
  effective_from_year
)
where status <> 'archived';

alter table public.curriculum_version_applicability enable row level security;
alter table public.official_education_resources enable row level security;
alter table public.official_education_resource_applicability enable row level security;
alter table public.official_education_resource_curriculum_links enable row level security;
alter table public.school_subject_curriculum_mappings enable row level security;

create policy "authenticated users read curriculum version applicability"
on public.curriculum_version_applicability for select to authenticated
using (
  exists (
    select 1
    from public.curriculum_versions v
    where v.id=curriculum_version_applicability.curriculum_version_id
      and v.status in ('approved','published','superseded')
  )
);

create policy "platform admins manage curriculum version applicability"
on public.curriculum_version_applicability for all to authenticated
using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));

create policy "authenticated users read published official education resources"
on public.official_education_resources for select to authenticated
using (status in ('published','superseded'));

create policy "platform admins manage official education resources"
on public.official_education_resources for all to authenticated
using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));

create policy "authenticated users read published resource applicability"
on public.official_education_resource_applicability for select to authenticated
using (
  exists (
    select 1
    from public.official_education_resources r
    where r.id=official_education_resource_applicability.resource_id
      and r.status in ('published','superseded')
  )
);

create policy "platform admins manage official resource applicability"
on public.official_education_resource_applicability for all to authenticated
using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));

create policy "authenticated users read published resource curriculum links"
on public.official_education_resource_curriculum_links for select to authenticated
using (
  exists (
    select 1
    from public.official_education_resources r
    where r.id=official_education_resource_curriculum_links.resource_id
      and r.status in ('published','superseded')
  )
);

create policy "platform admins manage official resource curriculum links"
on public.official_education_resource_curriculum_links for all to authenticated
using (app_private.has_platform_role(array['platform_admin']))
with check (app_private.has_platform_role(array['platform_admin']));

create policy "academic staff read school curriculum mappings"
on public.school_subject_curriculum_mappings for select to authenticated
using (
  app_private.has_platform_role(array['platform_admin'])
  or app_private.has_school_role(
    school_id,
    array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']
  )
);

create policy "academic leaders manage school curriculum mappings"
on public.school_subject_curriculum_mappings for all to authenticated
using (
  app_private.has_platform_role(array['platform_admin'])
  or app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal','hod'])
)
with check (
  app_private.has_platform_role(array['platform_admin'])
  or app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal','hod'])
);

revoke insert,update,delete on public.curriculum_version_applicability from authenticated;
revoke insert,update,delete on public.official_education_resources from authenticated;
revoke insert,update,delete on public.official_education_resource_applicability from authenticated;
revoke insert,update,delete on public.official_education_resource_curriculum_links from authenticated;

grant select on public.curriculum_version_applicability to authenticated;
grant select on public.official_education_resources to authenticated;
grant select on public.official_education_resource_applicability to authenticated;
grant select on public.official_education_resource_curriculum_links to authenticated;
grant select,insert,update on public.school_subject_curriculum_mappings to authenticated;

create or replace function app_private.guard_official_education_resource_finality()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if tg_op='DELETE' then
    if old.status in ('published','superseded') then
      raise exception 'Published official education resources are immutable historical records';
    end if;
    return old;
  end if;

  if old.status in ('published','superseded') and (
    new.authority is distinct from old.authority
    or new.resource_key is distinct from old.resource_key
    or new.document_type is distinct from old.document_type
    or new.title is distinct from old.title
    or new.source_url is distinct from old.source_url
    or new.publication_label is distinct from old.publication_label
    or new.publication_date is distinct from old.publication_date
    or new.checksum is distinct from old.checksum
    or new.language_code is distinct from old.language_code
    or new.provenance is distinct from old.provenance
    or new.approved_by_user_id is distinct from old.approved_by_user_id
    or new.approved_at is distinct from old.approved_at
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Published official education resource content and provenance are immutable';
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_official_education_resource_finality() from public,anon,authenticated;

create trigger official_education_resource_finality_trg
before update or delete on public.official_education_resources
for each row execute function app_private.guard_official_education_resource_finality();

create or replace function app_private.resolve_curriculum_version_for_offering_fields(
  p_school_id uuid,
  p_subject_id uuid,
  p_grade_code text,
  p_academic_year integer
)
returns table(
  resolution_state text,
  curriculum_version_id uuid,
  candidate_count integer,
  mapping_id uuid
)
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  with mapping_rows as (
    select m.*
    from public.school_subject_curriculum_mappings m
    where m.school_id=p_school_id
      and m.subject_id=p_subject_id
      and m.status='verified'
      and lower(btrim(m.grade_code))=lower(btrim(p_grade_code))
      and m.effective_from_year<=p_academic_year
      and (m.effective_to_year is null or m.effective_to_year>=p_academic_year)
  ),
  candidates as (
    select
      m.id as mapping_id,
      v.id as curriculum_version_id,
      (
        (case when a.programme_code is not null then 1 else 0 end)
        +(case when a.qualification_code is not null then 1 else 0 end)
        +(case when a.academic_regime is not null then 1 else 0 end)
        +(case when a.language_code is not null then 1 else 0 end)
      )::integer as specificity
    from mapping_rows m
    join public.curriculum_versions v
      on v.curriculum_subject_id=m.curriculum_subject_id
     and v.status='published'
     and v.effective_from_year<=p_academic_year
     and (v.effective_to_year is null or v.effective_to_year>=p_academic_year)
    join public.curriculum_version_applicability a
      on a.curriculum_version_id=v.id
     and lower(btrim(a.phase_code))=lower(btrim(m.phase_code))
     and lower(btrim(a.grade_key))=lower(btrim(m.grade_code))
     and (a.programme_code is null or lower(btrim(a.programme_code))=lower(btrim(coalesce(m.programme_code,''))))
     and (a.qualification_code is null or lower(btrim(a.qualification_code))=lower(btrim(coalesce(m.qualification_code,''))))
     and (a.academic_regime is null or lower(btrim(a.academic_regime))=lower(btrim(coalesce(m.academic_regime,''))))
     and (a.language_code is null or lower(btrim(a.language_code))=lower(btrim(coalesce(m.language_code,''))))
  ),
  best_specificity as (
    select max(specificity) as specificity from candidates
  ),
  best as (
    select distinct c.mapping_id,c.curriculum_version_id
    from candidates c
    cross join best_specificity b
    where c.specificity=b.specificity
  ),
  summary as (
    select
      count(distinct curriculum_version_id)::integer as candidate_count,
      min(curriculum_version_id) as sole_version_id,
      min(mapping_id) as sole_mapping_id
    from best
  )
  select
    case when s.candidate_count=0 then 'none'
         when s.candidate_count=1 then 'matched'
         else 'ambiguous'
    end,
    case when s.candidate_count=1 then s.sole_version_id else null end,
    s.candidate_count,
    case when s.candidate_count=1 then s.sole_mapping_id else null end
  from summary s;
$$;

revoke all on function app_private.resolve_curriculum_version_for_offering_fields(uuid,uuid,text,integer)
from public,anon,authenticated;

create or replace function public.resolve_curriculum_version_for_subject_offering(
  p_subject_offering_id uuid
)
returns table(
  resolution_state text,
  curriculum_version_id uuid,
  candidate_count integer,
  mapping_id uuid
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_offering public.subject_offerings%rowtype;
  v_grade_code text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select o.*,g.grade_code
    into v_offering,v_grade_code
  from public.subject_offerings o
  join public.grades g on g.id=o.grade_id and g.school_id=o.school_id
  where o.id=p_subject_offering_id;

  if not found then
    raise exception 'Subject offering not found';
  end if;

  if not (
    app_private.has_school_access(v_offering.school_id)
    or app_private.has_platform_role(array['platform_admin'])
  ) then
    raise exception 'Permission denied';
  end if;

  if v_offering.curriculum_version_id is not null then
    return query
    select 'pinned'::text,v_offering.curriculum_version_id,1::integer,null::uuid;
    return;
  end if;

  return query
  select *
  from app_private.resolve_curriculum_version_for_offering_fields(
    v_offering.school_id,
    v_offering.subject_id,
    v_grade_code,
    v_offering.academic_year
  );
end;
$$;

revoke all on function public.resolve_curriculum_version_for_subject_offering(uuid) from public,anon;
grant execute on function public.resolve_curriculum_version_for_subject_offering(uuid) to authenticated;

create or replace function public.adopt_curriculum_version_for_subject_offering(
  p_subject_offering_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_offering public.subject_offerings%rowtype;
  v_grade_code text;
  v_state text;
  v_version_id uuid;
  v_candidate_count integer;
  v_mapping_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select o.*,g.grade_code
    into v_offering,v_grade_code
  from public.subject_offerings o
  join public.grades g on g.id=o.grade_id and g.school_id=o.school_id
  where o.id=p_subject_offering_id
  for update of o;

  if not found then
    raise exception 'Subject offering not found';
  end if;

  if not (
    app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(
      v_offering.school_id,
      array['school_admin','principal','deputy_principal','hod']
    )
  ) then
    raise exception 'Permission denied';
  end if;

  if v_offering.curriculum_version_id is not null then
    return v_offering.curriculum_version_id;
  end if;

  select r.resolution_state,r.curriculum_version_id,r.candidate_count,r.mapping_id
    into v_state,v_version_id,v_candidate_count,v_mapping_id
  from app_private.resolve_curriculum_version_for_offering_fields(
    v_offering.school_id,
    v_offering.subject_id,
    v_grade_code,
    v_offering.academic_year
  ) r;

  if v_state='none' then
    raise exception 'No published curriculum version matches this subject offering';
  elsif v_state='ambiguous' then
    raise exception 'Multiple equally applicable published curriculum versions require platform review';
  end if;

  update public.subject_offerings
  set curriculum_version_id=v_version_id,
      updated_at=now()
  where id=v_offering.id
    and curriculum_version_id is null;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  )
  values(
    v_offering.tenant_id,
    v_offering.school_id,
    auth.uid(),
    'curriculum.offering_version_adopted',
    'subject_offering',
    v_offering.id,
    jsonb_build_object(
      'curriculum_version_id',v_version_id,
      'mapping_id',v_mapping_id,
      'academic_year',v_offering.academic_year
    )
  );

  return v_version_id;
end;
$$;

revoke all on function public.adopt_curriculum_version_for_subject_offering(uuid) from public,anon;
grant execute on function public.adopt_curriculum_version_for_subject_offering(uuid) to authenticated;

create or replace function app_private.autolink_subject_offering_curriculum()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_grade_code text;
  v_state text;
  v_version_id uuid;
begin
  if new.curriculum_version_id is not null then
    return new;
  end if;

  select g.grade_code into v_grade_code
  from public.grades g
  where g.id=new.grade_id and g.school_id=new.school_id;

  if v_grade_code is null then
    return new;
  end if;

  select r.resolution_state,r.curriculum_version_id
    into v_state,v_version_id
  from app_private.resolve_curriculum_version_for_offering_fields(
    new.school_id,
    new.subject_id,
    v_grade_code,
    new.academic_year
  ) r;

  if v_state='matched' then
    new.curriculum_version_id:=v_version_id;
  end if;

  return new;
end;
$$;

revoke all on function app_private.autolink_subject_offering_curriculum() from public,anon,authenticated;

drop trigger if exists subject_offering_curriculum_autolink_trg on public.subject_offerings;
create trigger subject_offering_curriculum_autolink_trg
before insert on public.subject_offerings
for each row execute function app_private.autolink_subject_offering_curriculum();

comment on table public.curriculum_version_applicability is
'Phase/programme/qualification/regime/language/grade applicability for one canonical curriculum version. Multiple grades point to one version rather than duplicating the curriculum.';
comment on table public.official_education_resources is
'Platform-governed registry of approved official education resources. Discovery/extraction is staged; publication requires human approval and checksum provenance.';
comment on table public.school_subject_curriculum_mappings is
'Governed school-subject crosswalk to canonical curriculum subjects and applicability dimensions. Resolver uses verified rows only and never fuzzy-matches display names.';
comment on function public.resolve_curriculum_version_for_subject_offering(uuid) is
'Deterministic read-only resolver. Pinned offerings stay pinned; zero match requires configuration; multiple equally applicable versions remain ambiguous.';
comment on function public.adopt_curriculum_version_for_subject_offering(uuid) is
'Governed explicit adoption for an unpinned subject offering. Existing historical curriculum pins are never overwritten.';
