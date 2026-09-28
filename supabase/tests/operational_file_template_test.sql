begin;

select plan(22);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
('85500000-0000-4000-8000-000000000100','teacher-855@example.test','authenticated','authenticated',now(),now()),
('85500000-0000-4000-8000-000000000101','support-855@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug,status)
values('85500000-0000-4000-8000-000000000110','Issue 855 Tenant','issue-855','active');

insert into public.schools(id,tenant_id,name,status)
values('85500000-0000-4000-8000-000000000120','85500000-0000-4000-8000-000000000110','Issue 855 School','active');

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values
('85500000-0000-4000-8000-000000000130','85500000-0000-4000-8000-000000000110','85500000-0000-4000-8000-000000000100','T855','Template','Teacher','active');

insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values
('85500000-0000-4000-8000-000000000140','85500000-0000-4000-8000-000000000110','85500000-0000-4000-8000-000000000120','85500000-0000-4000-8000-000000000100','85500000-0000-4000-8000-000000000130','teacher',current_date-1);

insert into public.platform_memberships(id,user_id,role_key,active_from)
values('85500000-0000-4000-8000-000000000150','85500000-0000-4000-8000-000000000101','platform_support',current_date-1);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','85500000-0000-4000-8000-000000000100',true);

set local role authenticated;

select is(
  (select template_version from public.resolve_operational_file_template('information-communication',4,date '2026-09-28')),
  1,
  'active template resolves for Grade 4 Information & Communication'
);

select is(
  (select template_version from public.resolve_operational_file_template('information-communication',12,date '2026-09-28')),
  1,
  'active template resolves for Grade 12 Information & Communication'
);

select is(
  (select count(*)::integer from public.resolve_operational_file_template('other-subject',8,date '2026-09-28')),
  0,
  'template does not generalize to unrelated subjects'
);

select is(
  (select count(*)::integer from public.resolve_operational_file_template('information-communication',3,date '2026-09-28')),
  0,
  'template does not apply below supplied phase range'
);

select is(
  (select template_version from public.get_operational_file_template_version('information-communication-grades-4-12',1)),
  1,
  'historical template version is directly addressable'
);

select is(
  (select array_agg(file_type_key order by sequence_number)::text
   from public.operational_file_template_file_types
   where template_id='85500000-0000-4000-8000-000000000001'),
  '{preparation,administration,resource,subject,question_paper}',
  'all five file types have deterministic ordering'
);

select is(
  (select count(*)::integer
   from public.operational_file_template_sections
   where file_type_id='85510000-0000-4000-8000-000000000005'),
  0,
  'Question Paper File has no fabricated hierarchy'
);

select is(
  (select array_agg(title order by sequence_number)::text
   from public.operational_file_template_sections
   where file_type_id='85510000-0000-4000-8000-000000000001'),
  '{"Required contents"}',
  'Preparation File source hierarchy is kept in one deterministic required-contents section'
);

select is(
  (select array_agg(label order by sequence_number)::text
   from public.operational_file_template_items
   where section_id='85520000-0000-4000-8000-000000000001'),
  '{"Control sheet","Table of contents","Teacher''s personal timetable","Syllabus for all subjects taught this year","Schemes of work for all subjects taught this year","Up-to-date daily/weekly written lesson preparation","Teacher''s commitment to PAAI"}',
  'ordered Preparation items match supplied source hierarchy'
);

select is(
  (select resolver_type from public.operational_file_template_items
   where section_id='85520000-0000-4000-8000-000000000001' and item_key='personal-timetable'),
  'timetable',
  'resolver type is stored as metadata'
);

select is(
  (select resolver_metadata->>'metadata_only' from public.operational_file_template_items
   where section_id='85520000-0000-4000-8000-000000000001' and item_key='personal-timetable'),
  'true',
  'resolver metadata is explicitly metadata-only'
);

select throws_ok(
  $update public.operational_file_templates
    set source_title='Teacher rewrite'
    where id='85500000-0000-4000-8000-000000000001'$,
  '42501',
  'permission denied for table operational_file_templates',
  'teacher cannot mutate policy templates: table privileges deny before immutability trigger'
);

select throws_ok(
  $delete from public.operational_file_template_items
    where section_id='85520000-0000-4000-8000-000000000001' and item_key='personal-timetable'$,
  '42501',
  'permission denied for table operational_file_template_items',
  'teacher cannot delete policy template items: table privileges deny before immutability trigger'
);

reset role;

insert into public.operational_file_templates(
  id,authority,source_key,source_title,source_reference,template_version,effective_from,effective_to,status
) values (
  '85500000-0000-4000-8000-000000000002','NIED','information-communication-grades-4-12',
  'Information & Communication Grades 4-12 operational file policy v2','test version',2,
  date '2027-01-01',null,'active'
);

insert into public.operational_file_template_subjects(template_id,subject_key,subject_label)
values('85500000-0000-4000-8000-000000000002','information-communication','Information & Communication');

insert into public.operational_file_template_phases(template_id,phase_key,phase_label,grade_from,grade_to)
values('85500000-0000-4000-8000-000000000002','grades-4-12','Grades 4-12',4,12);

select set_config('request.jwt.claim.sub','85500000-0000-4000-8000-000000000100',true);
set local role authenticated;

select is(
  (select template_version from public.resolve_operational_file_template('information-communication',8,date '2026-09-28')),
  1,
  'future version does not replace historical effective resolution'
);

select is(
  (select template_version from public.resolve_operational_file_template('information-communication',8,date '2027-02-01')),
  2,
  'new version resolves only after its effective date'
);

select is(
  (select template_version from public.get_operational_file_template_version('information-communication-grades-4-12',1)),
  1,
  'version change preserves historical lookup'
);

select is(
  (select count(*)::integer from public.operational_file_template_items i
   join public.operational_file_template_sections s on s.id=i.section_id
   where s.file_type_id='85510000-0000-4000-8000-000000000003'),
  12,
  'Resource File preserves all twelve source-derived required items'
);

select is(
  (select count(*)::integer from public.operational_file_template_items i
   join public.operational_file_template_sections s on s.id=i.section_id
   where s.file_type_id='85510000-0000-4000-8000-000000000004'),
  18,
  'Subject File preserves all eighteen source-derived required items'
);

select is(
  (select count(*)::integer from public.operational_file_template_sections
   where file_type_id='85510000-0000-4000-8000-000000000005'),
  0,
  'Question Paper hierarchy remains empty after source grounding'
);

select set_config('request.jwt.claim.sub','85500000-0000-4000-8000-000000000101',true);

select is(
  (select count(*)::integer from public.operational_file_templates),
  0,
  'Platform Support is separated from school operational templates'
);

select is(
  (select count(*)::integer from public.operational_file_template_items),
  0,
  'Platform Support cannot enumerate operational template details'
);

reset role;

select is(
  (select count(*)::integer from public.teacher_professional_documents),
  0,
  'template migration creates no backfilled professional uploads'
);

select * from finish();
rollback;
