-- Issue #855: Teaching Files operational template/version foundation.
-- Additive policy metadata only. Existing teacher uploads, Subject File evidence,
-- and Professional File Review remain authoritative and unchanged.

create table public.operational_file_templates (
  id uuid primary key default gen_random_uuid(),
  authority text not null,
  source_key text not null,
  source_title text not null,
  source_document_date date,
  source_reference text,
  template_version integer not null check (template_version > 0),
  effective_from date not null,
  effective_to date,
  status text not null default 'active' check (status in ('draft','active','superseded','withdrawn')),
  review_expectation jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(authority,source_key,template_version),
  check (effective_to is null or effective_to >= effective_from)
);

create table public.operational_file_template_subjects (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.operational_file_templates(id) on delete cascade,
  subject_key text not null,
  subject_label text not null,
  subject_id uuid references public.subjects(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(template_id,subject_key)
);

create table public.operational_file_template_phases (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.operational_file_templates(id) on delete cascade,
  phase_key text not null,
  phase_label text not null,
  grade_from smallint,
  grade_to smallint,
  created_at timestamptz not null default now(),
  unique(template_id,phase_key),
  check (grade_from is null or grade_from between 0 and 20),
  check (grade_to is null or grade_to between 0 and 20),
  check (grade_from is null or grade_to is null or grade_to >= grade_from)
);

create table public.operational_file_template_file_types (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.operational_file_templates(id) on delete cascade,
  file_type_key text not null check (file_type_key in (
    'preparation','administration','resource','subject','question_paper'
  )),
  display_name text not null,
  sequence_number integer not null check (sequence_number > 0),
  review_expectation jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(template_id,file_type_key),
  unique(template_id,sequence_number)
);

create table public.operational_file_template_sections (
  id uuid primary key default gen_random_uuid(),
  file_type_id uuid not null references public.operational_file_template_file_types(id) on delete cascade,
  section_key text not null,
  title text not null,
  sequence_number integer not null check (sequence_number > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(file_type_id,section_key),
  unique(file_type_id,sequence_number)
);

create table public.operational_file_template_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.operational_file_template_sections(id) on delete cascade,
  item_key text not null,
  label text not null,
  sequence_number integer not null check (sequence_number > 0),
  resolver_type text not null check (resolver_type in (
    'timetable','curriculum','scheme','lesson_preparation','class_list','assessment',
    'calendar','staff_profile','results','room_inventory','shared_resource',
    'teacher_document','external_link','manual'
  )),
  resolver_metadata jsonb not null default '{}'::jsonb,
  review_expectation jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(section_id,item_key),
  unique(section_id,sequence_number)
);

create index operational_file_templates_effective_idx
  on public.operational_file_templates(status,effective_from,effective_to,template_version desc);
create index operational_file_template_subjects_template_idx
  on public.operational_file_template_subjects(template_id,subject_key);
create index operational_file_template_phases_template_idx
  on public.operational_file_template_phases(template_id,grade_from,grade_to);
create index operational_file_template_types_template_idx
  on public.operational_file_template_file_types(template_id,sequence_number);
create index operational_file_template_sections_type_idx
  on public.operational_file_template_sections(file_type_id,sequence_number);
create index operational_file_template_items_section_idx
  on public.operational_file_template_items(section_id,sequence_number);

alter table public.operational_file_templates enable row level security;
alter table public.operational_file_template_subjects enable row level security;
alter table public.operational_file_template_phases enable row level security;
alter table public.operational_file_template_file_types enable row level security;
alter table public.operational_file_template_sections enable row level security;
alter table public.operational_file_template_items enable row level security;

revoke all on public.operational_file_templates from anon,authenticated;
revoke all on public.operational_file_template_subjects from anon,authenticated;
revoke all on public.operational_file_template_phases from anon,authenticated;
revoke all on public.operational_file_template_file_types from anon,authenticated;
revoke all on public.operational_file_template_sections from anon,authenticated;
revoke all on public.operational_file_template_items from anon,authenticated;

grant select on public.operational_file_templates to authenticated;
grant select on public.operational_file_template_subjects to authenticated;
grant select on public.operational_file_template_phases to authenticated;
grant select on public.operational_file_template_file_types to authenticated;
grant select on public.operational_file_template_sections to authenticated;
grant select on public.operational_file_template_items to authenticated;

create policy "school members read active operational file templates"
on public.operational_file_templates for select to authenticated
using (
  status in ('active','superseded')
  and exists (
    select 1 from public.school_memberships sm
    where sm.user_id=auth.uid()
      and sm.active_from<=current_date
      and (sm.active_to is null or sm.active_to>=current_date)
  )
  and not exists (
    select 1 from public.platform_memberships pm
    where pm.user_id=auth.uid()
      and pm.role_key in ('platform_admin','platform_support')
      and pm.active_from<=current_date
      and (pm.active_to is null or pm.active_to>=current_date)
  )
);

create policy "school members read operational file template subjects"
on public.operational_file_template_subjects for select to authenticated
using (exists(select 1 from public.operational_file_templates t where t.id=template_id));

create policy "school members read operational file template phases"
on public.operational_file_template_phases for select to authenticated
using (exists(select 1 from public.operational_file_templates t where t.id=template_id));

create policy "school members read operational file template file types"
on public.operational_file_template_file_types for select to authenticated
using (exists(select 1 from public.operational_file_templates t where t.id=template_id));

create policy "school members read operational file template sections"
on public.operational_file_template_sections for select to authenticated
using (exists(
  select 1 from public.operational_file_template_file_types ft
  join public.operational_file_templates t on t.id=ft.template_id
  where ft.id=file_type_id
));

create policy "school members read operational file template items"
on public.operational_file_template_items for select to authenticated
using (exists(
  select 1
  from public.operational_file_template_sections s
  join public.operational_file_template_file_types ft on ft.id=s.file_type_id
  join public.operational_file_templates t on t.id=ft.template_id
  where s.id=section_id
));

-- No authenticated write policies are created. Policy templates are platform-owned
-- deployment data, not teacher or school-authored content.

create or replace function app_private.enforce_operational_file_template_immutability()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  raise exception 'Operational file policy templates are deployment-managed and immutable';
end;
$$;
revoke all on function app_private.enforce_operational_file_template_immutability() from public,anon,authenticated;

create trigger operational_file_templates_immutable_trg
before update or delete on public.operational_file_templates
for each row execute function app_private.enforce_operational_file_template_immutability();

create trigger operational_file_template_subjects_immutable_trg
before update or delete on public.operational_file_template_subjects
for each row execute function app_private.enforce_operational_file_template_immutability();

create trigger operational_file_template_phases_immutable_trg
before update or delete on public.operational_file_template_phases
for each row execute function app_private.enforce_operational_file_template_immutability();

create trigger operational_file_template_file_types_immutable_trg
before update or delete on public.operational_file_template_file_types
for each row execute function app_private.enforce_operational_file_template_immutability();

create trigger operational_file_template_sections_immutable_trg
before update or delete on public.operational_file_template_sections
for each row execute function app_private.enforce_operational_file_template_immutability();

create trigger operational_file_template_items_immutable_trg
before update or delete on public.operational_file_template_items
for each row execute function app_private.enforce_operational_file_template_immutability();

create or replace function public.resolve_operational_file_template(
  p_subject_key text,
  p_grade integer,
  p_effective_on date default current_date
)
returns table(
  template_id uuid,
  authority text,
  source_key text,
  source_title text,
  template_version integer,
  effective_from date,
  effective_to date
)
language sql
stable
security invoker
set search_path=pg_catalog,public
as $$
  select t.id,t.authority,t.source_key,t.source_title,t.template_version,t.effective_from,t.effective_to
  from public.operational_file_templates t
  join public.operational_file_template_subjects s on s.template_id=t.id
  join public.operational_file_template_phases p on p.template_id=t.id
  where t.status in ('active','superseded')
    and lower(s.subject_key)=lower(trim(p_subject_key))
    and (p.grade_from is null or p_grade>=p.grade_from)
    and (p.grade_to is null or p_grade<=p.grade_to)
    and t.effective_from<=p_effective_on
    and (t.effective_to is null or t.effective_to>=p_effective_on)
  order by t.effective_from desc,t.template_version desc,t.id
  limit 1;
$$;
revoke all on function public.resolve_operational_file_template(text,integer,date) from public,anon;
grant execute on function public.resolve_operational_file_template(text,integer,date) to authenticated;

create or replace function public.get_operational_file_template_version(
  p_source_key text,
  p_template_version integer
)
returns table(
  template_id uuid,
  authority text,
  source_key text,
  source_title text,
  template_version integer,
  effective_from date,
  effective_to date,
  status text
)
language sql
stable
security invoker
set search_path=pg_catalog,public
as $$
  select t.id,t.authority,t.source_key,t.source_title,t.template_version,
         t.effective_from,t.effective_to,t.status
  from public.operational_file_templates t
  where t.source_key=p_source_key and t.template_version=p_template_version
  order by t.id
  limit 1;
$$;
revoke all on function public.get_operational_file_template_version(text,integer) from public,anon;
grant execute on function public.get_operational_file_template_version(text,integer) to authenticated;

-- Supplied source: Information & Communication Grades 4-12.
-- The source material defines the five file types. Question Paper File is
-- intentionally recognition-only because no trustworthy internal hierarchy was supplied.
with template as (
  insert into public.operational_file_templates(
    id,authority,source_key,source_title,source_reference,template_version,effective_from,status,review_expectation,metadata
  ) values (
    '85500000-0000-4000-8000-000000000001','NIED',
    'information-communication-grades-4-12',
    'Information & Communication Grades 4-12 operational file policy',
    'National Subject Policy Guide for Information and Communication, Grades 4-12 (NIED, 2021)',
    1,date '2026-01-01','active',
    jsonb_build_object('authority','existing_professional_file_review','expectation','policy-governed'),
    jsonb_build_object('issue',855,'source_scope','Information & Communication Grades 4-12 only')
  )
  returning id
)
insert into public.operational_file_template_subjects(template_id,subject_key,subject_label)
select id,'information-communication','Information & Communication' from template;

insert into public.operational_file_template_phases(template_id,phase_key,phase_label,grade_from,grade_to)
values
('85500000-0000-4000-8000-000000000001','grades-4-7','Grades 4-7',4,7),
('85500000-0000-4000-8000-000000000001','grades-8-9','Grades 8-9',8,9),
('85500000-0000-4000-8000-000000000001','grades-10-12','Grades 10-12',10,12);

insert into public.operational_file_template_file_types(
  id,template_id,file_type_key,display_name,sequence_number,review_expectation,metadata
) values
('85510000-0000-4000-8000-000000000001','85500000-0000-4000-8000-000000000001','preparation','Preparation File',10,'{"authority":"existing_professional_file_review"}','{}'),
('85510000-0000-4000-8000-000000000002','85500000-0000-4000-8000-000000000001','administration','Administration File',20,'{"authority":"existing_professional_file_review"}','{}'),
('85510000-0000-4000-8000-000000000003','85500000-0000-4000-8000-000000000001','resource','Resource File',30,'{"authority":"existing_professional_file_review"}','{}'),
('85510000-0000-4000-8000-000000000004','85500000-0000-4000-8000-000000000001','subject','Subject File',40,'{"authority":"existing_professional_file_review"}','{}'),
('85510000-0000-4000-8000-000000000005','85500000-0000-4000-8000-000000000001','question_paper','Question Paper File',50,'{"authority":"existing_professional_file_review"}','{"hierarchy":"not_defined_by_supplied_source"}');

-- The supplied source structure represented here is intentionally subject-specific.
-- Required-item labels preserve the source-derived I&C hierarchy. Resolver names
-- are metadata only; no canonical resolver runs in #855.
insert into public.operational_file_template_sections(id,file_type_id,section_key,title,sequence_number)
values
('85520000-0000-4000-8000-000000000001','85510000-0000-4000-8000-000000000001','required-contents','Required contents',10),
('85520000-0000-4000-8000-000000000010','85510000-0000-4000-8000-000000000002','organisation','Organisation',10),
('85520000-0000-4000-8000-000000000011','85510000-0000-4000-8000-000000000002','register-class-list','Register Class List',20),
('85520000-0000-4000-8000-000000000012','85510000-0000-4000-8000-000000000002','mark-sheets','Mark Sheets',30),
('85520000-0000-4000-8000-000000000013','85510000-0000-4000-8000-000000000002','planning','Planning',40),
('85520000-0000-4000-8000-000000000014','85510000-0000-4000-8000-000000000002','policies','Policies',50),
('85520000-0000-4000-8000-000000000015','85510000-0000-4000-8000-000000000002','meetings','Meetings',60),
('85520000-0000-4000-8000-000000000016','85510000-0000-4000-8000-000000000002','circulars-reports','Circulars and Reports',70),
('85520000-0000-4000-8000-000000000017','85510000-0000-4000-8000-000000000002','textbook-control','Textbook Control',80),
('85520000-0000-4000-8000-000000000020','85510000-0000-4000-8000-000000000003','required-contents','Required contents',10),
('85520000-0000-4000-8000-000000000030','85510000-0000-4000-8000-000000000004','required-contents','Required contents',10);

insert into public.operational_file_template_items(
  section_id,item_key,label,sequence_number,resolver_type,resolver_metadata,review_expectation
) values
-- Preparation File: exact source-derived order.
('85520000-0000-4000-8000-000000000001','control-sheet','Control sheet',10,'manual','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000001','table-of-contents','Table of contents',20,'manual','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000001','personal-timetable','Teacher''s personal timetable',30,'timetable','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000001','syllabuses','Syllabus for all subjects taught this year',40,'curriculum','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000001','schemes-of-work','Schemes of work for all subjects taught this year',50,'scheme','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000001','lesson-preparation','Up-to-date daily/weekly written lesson preparation',60,'lesson_preparation','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000001','paai-commitment','Teacher''s commitment to PAAI',70,'shared_resource','{"metadata_only":true}','{}'),
-- Administration File.
('85520000-0000-4000-8000-000000000010','personal-timetable','Personal timetable',10,'timetable','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000010','register-class-timetable','Register class timetable',20,'timetable','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000010','test-exam-timetables','Test/examination timetables',30,'timetable','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000010','official-school-calendar','Official school calendar',40,'calendar','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000011','register-class-list','Register class list',10,'class_list','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000012','continuous-assessment','Continuous Assessment',10,'assessment','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000012','tests','Tests',20,'assessment','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000012','examinations','Examinations',30,'assessment','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000013','paai','PAAI',10,'shared_resource','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000014','code-of-conduct','Code of Conduct for Teachers',10,'shared_resource','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000014','internal-subject-policy','School internal Subject Policy',20,'shared_resource','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000014','teacher-manual-guide','Teacher''s Manual / Guide',30,'shared_resource','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000014','national-standards','National Standards and Performance Indicators',40,'external_link','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000014','teacher-self-evaluation','Teacher Self-Evaluation Instrument',50,'shared_resource','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000014','classroom-observation','Classroom Observation Instrument',60,'shared_resource','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000015','staff-meeting-minutes','Staff meeting minutes',10,'shared_resource','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000015','departmental-meeting-minutes','Departmental meeting minutes',20,'shared_resource','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000015','subject-meeting-minutes','Subject meeting minutes',30,'shared_resource','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000015','cluster-meeting-minutes','Cluster meeting minutes',40,'shared_resource','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000016','ministry-circulars-reports','Ministry circulars/reports',10,'external_link','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000016','regional-circulars-reports','Regional Office circulars/reports',20,'external_link','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000016','seo-reports','Senior Education Officer reports',30,'external_link','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000017','numbered-textbooks','Numbered textbooks issued to learners',10,'manual','{"metadata_only":true,"alternative_group":"textbook_control"}','{}'),
('85520000-0000-4000-8000-000000000017','register-class-textbook-inventory','Register-class textbook inventory',20,'manual','{"metadata_only":true,"alternative_group":"textbook_control"}','{}'),
-- Resource File: exact source-derived order.
('85520000-0000-4000-8000-000000000020','control-sheet','Control sheet',10,'manual','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000020','table-of-contents','Table of contents',20,'manual','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000020','worksheets','Worksheets',30,'teacher_document','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000020','projects','Projects',40,'teacher_document','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000020','assignments','Assignments',50,'teacher_document','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000020','topic-tasks','Topic tasks',60,'teacher_document','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000020','practical-investigations','Practical investigations',70,'teacher_document','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000020','artefacts','Artefacts',80,'teacher_document','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000020','marking-criteria','Marking criteria',90,'teacher_document','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000020','course-material','Course material',100,'teacher_document','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000020','workshop-handouts','Workshop handouts',110,'teacher_document','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000020','learning-support-information','Learning support information',120,'teacher_document','{"metadata_only":true}','{}'),
-- Subject File: exact source-derived order.
('85520000-0000-4000-8000-000000000030','control-sheet','Control sheet',10,'manual','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000030','table-of-contents','Table of contents',20,'manual','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000030','national-curriculum','National Curriculum',30,'curriculum','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000030','national-subject-policy-guide','National Subject Policy Guide',40,'external_link','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000030','school-internal-subject-policy','School internal Subject Policy',50,'shared_resource','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000030','completed-paai','Completed PAAI',60,'shared_resource','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000030','subject-teacher-information','Subject teacher information',70,'staff_profile','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000030','latest-syllabuses','Latest syllabus(es)',80,'curriculum','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000030','schemes-all-grades','Schemes of Work for all grades',90,'scheme','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000030','subject-department-minutes','Subject/departmental meeting minutes',100,'shared_resource','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000030','cluster-minutes','Cluster meeting minutes',110,'shared_resource','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000030','advisory-teacher-reports','Advisory Teacher reports',120,'shared_resource','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000030','subject-circulars-correspondence','Subject circulars/correspondence',130,'shared_resource','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000030','textbook-information','Textbook information',140,'shared_resource','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000030','teaching-learning-material-inventory','Teaching/learning material inventory',150,'room_inventory','{"metadata_only":true,"scope_guard":"do_not_infer_subject_room"}','{}'),
('85520000-0000-4000-8000-000000000030','promotion-marks-three-years','Promotion marks for previous three years + evaluation',160,'results','{"metadata_only":true,"history_years":3}','{}'),
('85520000-0000-4000-8000-000000000030','teacher-manual-guide','Teacher Manual/Guide',170,'shared_resource','{"metadata_only":true}','{}'),
('85520000-0000-4000-8000-000000000030','workshop-attendance','Workshop attendance record',180,'teacher_document','{"metadata_only":true}','{}');

comment on table public.operational_file_templates is
'Versioned platform-owned operational-file policy templates. Templates classify existing canonical evidence and never replace teacher_professional_documents, Subject File or Professional File Review.';
comment on table public.operational_file_template_items is
'Ordered policy requirements with resolver_type/resolver_metadata only. Canonical resolver execution is intentionally out of scope for Issue #855.';
comment on function public.resolve_operational_file_template(text,integer,date) is
'Read-only active-template resolver by supplied subject key, integer grade phase and effective date.';
