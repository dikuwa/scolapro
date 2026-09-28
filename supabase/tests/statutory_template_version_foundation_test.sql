begin;

select plan(27);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('f8570000-0000-4000-8000-000000000001','issue857-platform@example.test','authenticated','authenticated',now(),now()),
  ('f8570000-0000-4000-8000-000000000002','issue857-school@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key,active_from)
values('f8570000-0000-4000-8000-000000000001','platform_admin',current_date-1);

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'f8570000-0000-4000-8000-000000000002',
  'school_admin',
  current_date-1
);

insert into public.statutory_form_definitions(
  id,form_key,display_name,authority,description,active
) values(
  'f8571000-0000-4000-8000-000000000001',
  'aec-issue-857',
  'AEC Issue 857 Test Form',
  'Test statutory authority',
  'Test-only statutory template identity',
  true
);

insert into public.statutory_form_versions(
  id,form_definition_id,version_key,effective_from,effective_to,source_reference,status
) values
(
  'f8572000-0000-4000-8000-000000000001',
  'f8571000-0000-4000-8000-000000000001',
  '2026-v1',
  '2026-01-01',
  '2026-05-31',
  'TEST-ONLY-AEC-2026-V1',
  'draft'
),
(
  'f8572000-0000-4000-8000-000000000002',
  'f8571000-0000-4000-8000-000000000001',
  '2026-v2',
  '2026-06-01',
  null,
  'TEST-ONLY-AEC-2026-V2',
  'draft'
),
(
  'f8572000-0000-4000-8000-000000000003',
  'f8571000-0000-4000-8000-000000000001',
  '2026-v3-approved',
  '2026-06-01',
  null,
  'TEST-ONLY-AEC-2026-V3',
  'draft'
),
(
  'f8572000-0000-4000-8000-000000000004',
  'f8571000-0000-4000-8000-000000000001',
  'draft-qa',
  '2027-01-01',
  null,
  'TEST-ONLY-AEC-DRAFT',
  'draft'
);

insert into public.statutory_form_sections(
  id,form_version_id,section_key,display_name,sort_order
) values
(
  'f8573000-0000-4000-8000-000000000001',
  'f8572000-0000-4000-8000-000000000001',
  'historical',
  'Historical section',
  10
),
(
  'f8573000-0000-4000-8000-000000000002',
  'f8572000-0000-4000-8000-000000000002',
  'learners',
  'Learners',
  20
),
(
  'f8573000-0000-4000-8000-000000000003',
  'f8572000-0000-4000-8000-000000000002',
  'overview',
  'Overview',
  10
),
(
  'f8573000-0000-4000-8000-000000000004',
  'f8572000-0000-4000-8000-000000000003',
  'approved',
  'Approved candidate',
  10
),
(
  'f8573000-0000-4000-8000-000000000005',
  'f8572000-0000-4000-8000-000000000004',
  'draft',
  'Draft QA',
  10
);

insert into public.statutory_form_fields(
  id,form_version_id,section_id,field_key,label,sort_order,source_mode,resolver_type,resolver_config,required,validation_schema
) values
(
  'f8574000-0000-4000-8000-000000000001',
  'f8572000-0000-4000-8000-000000000001',
  'f8573000-0000-4000-8000-000000000001',
  'historical.school_name',
  'Historical school name',
  10,
  'unresolved',
  null,
  '{}',
  true,
  '{}'
),
(
  'f8574000-0000-4000-8000-000000000002',
  'f8572000-0000-4000-8000-000000000002',
  'f8573000-0000-4000-8000-000000000003',
  'overview.school_name',
  'School name',
  20,
  'unresolved',
  null,
  '{}',
  true,
  '{}'
),
(
  'f8574000-0000-4000-8000-000000000003',
  'f8572000-0000-4000-8000-000000000002',
  'f8573000-0000-4000-8000-000000000003',
  'overview.emis_number',
  'EMIS number',
  10,
  'derived',
  'snapshot_path',
  '{"path":["school","emis_number"]}',
  true,
  '{"type":"string"}'
),
(
  'f8574000-0000-4000-8000-000000000004',
  'f8572000-0000-4000-8000-000000000002',
  'f8573000-0000-4000-8000-000000000002',
  'learners.total',
  'Learner total',
  10,
  'derived',
  'snapshot_path',
  '{"path":["learners","total"]}',
  true,
  '{"type":"number"}'
),
(
  'f8574000-0000-4000-8000-000000000005',
  'f8572000-0000-4000-8000-000000000004',
  'f8573000-0000-4000-8000-000000000005',
  'draft.existing',
  'Draft existing field',
  10,
  'manual',
  null,
  '{}',
  false,
  '{}'
);

update public.statutory_form_versions set status='superseded'
where id='f8572000-0000-4000-8000-000000000001';
update public.statutory_form_versions set status='published'
where id='f8572000-0000-4000-8000-000000000002';
update public.statutory_form_versions set status='approved'
where id='f8572000-0000-4000-8000-000000000003';

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f8570000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is(
  public.resolve_statutory_form_template('aec-issue-857','2026-07-01')->'version'->>'version_key',
  '2026-v2',
  'active resolver deterministically prefers published over approved when effective dates tie'
);

select is(
  public.resolve_statutory_form_template('aec-issue-857','2026-03-01'),
  null,
  'superseded version is excluded from active/effective resolution'
);

select is(
  public.get_statutory_form_template_version_by_key('aec-issue-857','2026-v1')->'version'->>'version_key',
  '2026-v1',
  'superseded historical version remains addressable by stable keys'
);

select is(
  public.get_statutory_form_template_version_by_id('f8572000-0000-4000-8000-000000000001')->'version'->>'source_reference',
  'TEST-ONLY-AEC-2026-V1',
  'historical template version remains addressable by immutable version id'
);

select is(
  (
    select array_agg(section->>'section_key')
    from jsonb_array_elements(
      public.resolve_statutory_form_template('aec-issue-857','2026-07-01')->'sections'
    ) section
  ),
  array['overview','learners']::text[],
  'template sections resolve in deterministic sort order'
);

select is(
  (
    select array_agg(field->>'field_key')
    from jsonb_array_elements(
      public.resolve_statutory_form_template('aec-issue-857','2026-07-01')->'sections'->0->'fields'
    ) field
  ),
  array['overview.emis_number','overview.school_name']::text[],
  'template fields resolve in deterministic sort order'
);

select is(
  public.resolve_statutory_form_template('aec-issue-857','2026-07-01')
    ->'sections'->0->'fields'->1->>'source_mode',
  'unresolved',
  'unsupported source mapping remains explicitly unresolved rather than invented'
);

reset role;

select throws_ok(
  $$insert into public.statutory_form_sections(form_version_id,section_key,display_name,sort_order)
    values('f8572000-0000-4000-8000-000000000004','draft','Duplicate draft section',20)$$,
  '23505',
  null,
  'duplicate section stable key is rejected inside one form version'
);

select throws_ok(
  $$insert into public.statutory_form_fields(form_version_id,section_id,field_key,label,sort_order,source_mode)
    values(
      'f8572000-0000-4000-8000-000000000004',
      'f8573000-0000-4000-8000-000000000005',
      'draft.existing',
      'Duplicate draft field',
      20,
      'manual'
    )$$,
  '23505',
  null,
  'duplicate field stable key is rejected inside one form version'
);

select lives_ok(
  $$insert into public.statutory_form_fields(form_version_id,section_id,field_key,label,sort_order,source_mode)
    values(
      'f8572000-0000-4000-8000-000000000004',
      'f8573000-0000-4000-8000-000000000005',
      'overview.school_name',
      'Same stable field key in a different version',
      30,
      'manual'
    )$$,
  'stable field keys may repeat across distinct template versions'
);

select throws_ok(
  $$update public.statutory_form_sections
    set display_name='Rewritten historical section'
    where id='f8573000-0000-4000-8000-000000000001'$$,
  'P0001',
  'Finalized statutory form structure is immutable; create a new form version',
  'superseded historical section structure cannot be rewritten'
);

select throws_ok(
  $q$update public.statutory_form_fields
    set label='Rewritten published field'
    where id='f8574000-0000-4000-8000-000000000003'$q$,
  'P0001',
  'Finalized statutory form structure is immutable; create a new form version',
  'published field structure cannot be rewritten'
);

select throws_ok(
  $q$update public.statutory_form_sections
    set form_version_id='f8572000-0000-4000-8000-000000000004'
    where id='f8573000-0000-4000-8000-000000000001'$q$,
  'P0001',
  'Finalized statutory form structure is immutable; create a new form version',
  'finalized section cannot be moved into a draft version'
);

select throws_ok(
  $q$update public.statutory_form_fields
    set form_version_id='f8572000-0000-4000-8000-000000000004',
        section_id='f8573000-0000-4000-8000-000000000005'
    where id='f8574000-0000-4000-8000-000000000003'$q$,
  'P0001',
  'Finalized statutory form structure is immutable; create a new form version',
  'finalized field cannot be moved into a draft version or draft section'
);

select lives_ok(
  $q$update public.statutory_form_fields
    set label='Draft existing field edited'
    where id='f8574000-0000-4000-8000-000000000005'$q$,
  'draft structure remains normally editable'
);

select throws_ok(
  $$insert into public.statutory_form_sections(form_version_id,section_key,display_name,sort_order)
    values('f8572000-0000-4000-8000-000000000002','late-addition','Late addition',99)$$,
  'P0001',
  'Finalized statutory form structure is immutable; create a new form version',
  'new structure cannot be appended to a finalized version'
);

update public.statutory_form_definitions
set active=false
where id='f8571000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.sub','f8570000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is(
  public.resolve_statutory_form_template('aec-issue-857','2026-07-01'),
  null,
  'inactive form definition is excluded from active template lookup'
);

select is(
  public.get_statutory_form_template_version_by_key('aec-issue-857','2026-v2')->'version'->>'version_key',
  '2026-v2',
  'historical exact-version lookup remains available after form deactivation'
);

select throws_ok(
  $$insert into public.statutory_form_sections(form_version_id,section_key,display_name,sort_order)
    values('f8572000-0000-4000-8000-000000000004','school-attempt','School attempt',40)$$,
  '42501',
  'new row violates row-level security policy for table "statutory_form_sections"',
  'school administrator cannot mutate platform statutory section definitions'
);

select throws_ok(
  $$insert into public.statutory_form_fields(form_version_id,section_id,field_key,label,sort_order,source_mode)
    values(
      'f8572000-0000-4000-8000-000000000004',
      'f8573000-0000-4000-8000-000000000005',
      'school.attempt',
      'School attempt',
      40,
      'manual'
    )$$,
  '42501',
  'new row violates row-level security policy for table "statutory_form_fields"',
  'school administrator cannot mutate platform statutory field definitions'
);

select is(
  public.get_statutory_form_template_version_by_key('aec-issue-857','draft-qa'),
  null,
  'ordinary school actor cannot read a draft platform template through historical helper'
);

reset role;

select set_config('request.jwt.claim.sub','f8570000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$insert into public.statutory_form_sections(form_version_id,section_key,display_name,sort_order)
    values('f8572000-0000-4000-8000-000000000004','platform-section','Platform governed section',50)$$,
  'platform administrator may author a draft statutory section'
);

select lives_ok(
  $$insert into public.statutory_form_fields(form_version_id,section_id,field_key,label,sort_order,source_mode)
    values(
      'f8572000-0000-4000-8000-000000000004',
      'f8573000-0000-4000-8000-000000000005',
      'platform.field',
      'Platform governed field',
      50,
      'manual'
    )$$,
  'platform administrator may author a draft statutory field'
);

select is(
  public.get_statutory_form_template_version_by_key('aec-issue-857','draft-qa')->'version'->>'version_key',
  'draft-qa',
  'platform administrator may inspect draft template versions'
);

reset role;

select ok(
  not has_function_privilege('authenticated','app_private.statutory_form_template_payload(uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.statutory_form_template_payload(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_statutory_form_structure_finality()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_statutory_form_structure_finality()','EXECUTE'),
  'template integrity/payload helpers remain private'
);

select ok(
  has_function_privilege('authenticated','public.resolve_statutory_form_template(text,date)','EXECUTE')
  and has_function_privilege('authenticated','public.get_statutory_form_template_version_by_id(uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.get_statutory_form_template_version_by_key(text,text)','EXECUTE')
  and not has_function_privilege('anon','public.resolve_statutory_form_template(text,date)','EXECUTE')
  and not has_function_privilege('anon','public.get_statutory_form_template_version_by_id(uuid)','EXECUTE')
  and not has_function_privilege('anon','public.get_statutory_form_template_version_by_key(text,text)','EXECUTE'),
  'public template read helpers are authenticated-only'
);

select ok(
  (select relrowsecurity from pg_class where oid='public.statutory_form_sections'::regclass)
  and (select relrowsecurity from pg_class where oid='public.statutory_form_fields'::regclass),
  'statutory template structure tables enforce row-level security'
);

select * from finish();
rollback;
