begin;

select plan(47);

select has_table('public','curriculum_version_applicability','curriculum version applicability exists');
select has_table('public','official_education_resources','official education resources exist');
select has_table('public','official_education_resource_applicability','official resource applicability exists');
select has_table('public','official_education_resource_curriculum_links','official resource curriculum links exist');
select has_table('public','school_subject_curriculum_mappings','school subject curriculum mappings exist');

select ok((select relrowsecurity from pg_class where oid='public.official_education_resources'::regclass),'official resources use RLS');
select ok((select relrowsecurity from pg_class where oid='public.school_subject_curriculum_mappings'::regclass),'school curriculum mappings use RLS');

select has_function(
  'public','resolve_curriculum_version_for_subject_offering',array['uuid'],
  'public subject-offering resolver exists'
);
select has_function(
  'public','adopt_curriculum_version_for_subject_offering',array['uuid'],
  'governed subject-offering adoption function exists'
);

select is(
  has_function_privilege('anon','public.resolve_curriculum_version_for_subject_offering(uuid)','EXECUTE'),
  false,
  'anonymous clients cannot resolve subject-offering curriculum'
);
select is(
  has_function_privilege('authenticated','public.resolve_curriculum_version_for_subject_offering(uuid)','EXECUTE'),
  true,
  'authenticated clients can resolve accessible subject offerings'
);
select is(
  has_function_privilege('anon','public.adopt_curriculum_version_for_subject_offering(uuid)','EXECUTE'),
  false,
  'anonymous clients cannot adopt curriculum'
);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('f9100000-0000-4000-8000-000000000001','curriculum-platform@example.test','authenticated','authenticated',now(),now()),
  ('f9100000-0000-4000-8000-000000000002','curriculum-school@example.test','authenticated','authenticated',now(),now()),
  ('f9100000-0000-4000-8000-000000000003','curriculum-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key,active_from)
values('f9100000-0000-4000-8000-000000000001','platform_admin',current_date-10);

insert into public.school_memberships(
  id,tenant_id,school_id,user_id,role_key,active_from
) values
  ('f9110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9100000-0000-4000-8000-000000000002','school_admin',current_date-10),
  ('f9110000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f9100000-0000-4000-8000-000000000003','teacher',current_date-10);

set local session_replication_role=replica;
insert into public.subjects(
  id,tenant_id,school_id,subject_code,display_name,status
) values
  (
    'f9120000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'CURR-TST',
    'Curriculum Test Subject',
    'active'
  ),
  (
    'f9120000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'CURR-NONE',
    'Curriculum No-Match Subject',
    'active'
  );

insert into public.grades(
  id,tenant_id,school_id,academic_year,grade_code,display_name
) values
  ('f9130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'T8','Test Grade 8'),
  ('f9130000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2027,'T8','Test Grade 8'),
  ('f9130000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'T9','Test Grade 9');

insert into public.subject_offerings(
  id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status
) values(
  'f9140000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2026,
  'f9120000-0000-4000-8000-000000000001',
  'f9130000-0000-4000-8000-000000000001',
  5,
  'active'
),
(
  'f9140000-0000-4000-8000-000000000002',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2026,
  'f9120000-0000-4000-8000-000000000002',
  'f9130000-0000-4000-8000-000000000001',
  5,
  'active'
);
set local session_replication_role=origin;

insert into public.curriculum_sources(
  id,authority,source_key,title,source_url,status
) values(
  'f9150000-0000-4000-8000-000000000001',
  'NIED',
  'curriculum-test-source',
  'Curriculum Test Source',
  'https://example.test/nied/source.pdf',
  'verified'
);

insert into public.curriculum_subjects(
  id,curriculum_key,display_name,phase_code,subject_code,authority,active
) values(
  'f9160000-0000-4000-8000-000000000001',
  'curriculum-test-subject',
  'Curriculum Test Subject',
  'junior_secondary',
  'CURRT',
  'NIED',
  true
);

insert into public.curriculum_versions(
  id,curriculum_subject_id,version_key,source_id,effective_from_year,effective_to_year,status
) values(
  'f9170000-0000-4000-8000-000000000001',
  'f9160000-0000-4000-8000-000000000001',
  '2026-2027-v1',
  'f9150000-0000-4000-8000-000000000001',
  2026,
  2027,
  'imported'
);

insert into public.curriculum_version_applicability(
  id,curriculum_version_id,phase_code,grade_key,programme_code
) values
  (
    'f9180000-0000-4000-8000-000000000001',
    'f9170000-0000-4000-8000-000000000001',
    'junior_secondary',
    'T8',
    'general'
  ),
  (
    'f9180000-0000-4000-8000-000000000002',
    'f9170000-0000-4000-8000-000000000001',
    'junior_secondary',
    'T9',
    'general'
  );

update public.curriculum_versions
set status='published',approved_by_user_id='f9100000-0000-4000-8000-000000000001',approved_at=now()
where id='f9170000-0000-4000-8000-000000000001';

insert into public.curriculum_versions(
  id,curriculum_subject_id,version_key,source_id,effective_from_year,status
) values(
  'f9170000-0000-4000-8000-000000000004',
  'f9160000-0000-4000-8000-000000000001',
  'draft-reparent-target',
  'f9150000-0000-4000-8000-000000000001',
  2026,
  'imported'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f9100000-0000-4000-8000-000000000002',true);
set local role authenticated;

select lives_ok(
  $$insert into public.school_subject_curriculum_mappings(
      id,tenant_id,school_id,subject_id,curriculum_subject_id,grade_code,phase_code,programme_code,
      effective_from_year,effective_to_year,status,created_by_user_id
    ) values(
      'f9190000-0000-4000-8000-000000000001',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'f9120000-0000-4000-8000-000000000001',
      'f9160000-0000-4000-8000-000000000001',
      'T8','junior_secondary','general',2026,2027,'verified',
      'f9100000-0000-4000-8000-000000000002'
    )$$,
  'school academic leadership can verify an exact curriculum subject crosswalk'
);

select is(
  (select verified_by_user_id from public.school_subject_curriculum_mappings where id='f9190000-0000-4000-8000-000000000001'),
  'f9100000-0000-4000-8000-000000000002'::uuid,
  'mapping verification actor is captured from auth context'
);

select throws_ok(
  $$update public.school_subject_curriculum_mappings
      set status='draft'
    where id='f9190000-0000-4000-8000-000000000001'$$,
  'Verified curriculum mappings are immutable; archive and create a new mapping',
  'verified curriculum mapping cannot return to draft'
);

select throws_ok(
  $$update public.school_subject_curriculum_mappings
      set verified_by_user_id='f9100000-0000-4000-8000-000000000003'
    where id='f9190000-0000-4000-8000-000000000001'$$,
  'Verified curriculum mappings are immutable; archive and create a new mapping',
  'verified mapping actor provenance cannot be rewritten'
);

select lives_ok(
  $$insert into public.school_subject_curriculum_mappings(
      id,tenant_id,school_id,subject_id,curriculum_subject_id,grade_code,phase_code,programme_code,
      effective_from_year,effective_to_year,status,created_by_user_id
    ) values(
      'f9190000-0000-4000-8000-000000000002',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'f9120000-0000-4000-8000-000000000001',
      'f9160000-0000-4000-8000-000000000001',
      'T9','junior_secondary','general',2026,2027,'verified',
      'f9100000-0000-4000-8000-000000000002'
    )$$,
  'one canonical curriculum version may be mapped to another applicable grade without a fake duplicate version'
);

insert into public.school_subject_curriculum_mappings(
  id,tenant_id,school_id,subject_id,curriculum_subject_id,grade_code,phase_code,programme_code,
  effective_from_year,effective_to_year,status,created_by_user_id
) values(
  'f9190000-0000-4000-8000-000000000003',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'f9120000-0000-4000-8000-000000000001',
  'f9160000-0000-4000-8000-000000000001',
  'T8','junior_secondary','retired',2026,2027,'verified',
  'f9100000-0000-4000-8000-000000000002'
);

select lives_ok(
  $$update public.school_subject_curriculum_mappings
      set status='archived'
    where id='f9190000-0000-4000-8000-000000000003'$$,
  'verified curriculum mapping can move once to terminal archived state'
);

select throws_ok(
  $$update public.school_subject_curriculum_mappings
      set programme_code='rewritten'
    where id='f9190000-0000-4000-8000-000000000003'$$,
  'Archived curriculum mappings are immutable historical records',
  'archived curriculum mapping cannot be rewritten'
);

insert into public.school_subject_curriculum_mappings(
  id,tenant_id,school_id,subject_id,curriculum_subject_id,grade_code,phase_code,programme_code,
  effective_from_year,effective_to_year,status,created_by_user_id
) values(
  'f9190000-0000-4000-8000-000000000004',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'f9120000-0000-4000-8000-000000000001',
  'f9160000-0000-4000-8000-000000000001',
  'T8','junior_secondary','draft-archive',2026,2027,'draft',
  'f9100000-0000-4000-8000-000000000002'
);

update public.school_subject_curriculum_mappings
set status='archived',
    verified_by_user_id='f9100000-0000-4000-8000-000000000003',
    verified_at=now()
where id='f9190000-0000-4000-8000-000000000004';

select is(
  (select verified_by_user_id is null and verified_at is null
   from public.school_subject_curriculum_mappings
   where id='f9190000-0000-4000-8000-000000000004'),
  true,
  'draft-to-archived mapping cannot retain fabricated verifier provenance'
);

select is(
  (
    select concat_ws(
      ':',
      resolution_state,
      curriculum_version_id::text,
      candidate_count::text
    )
    from public.resolve_curriculum_version_for_subject_offering(
      'f9140000-0000-4000-8000-000000000001'
    )
  ),
  'matched:f9170000-0000-4000-8000-000000000001:1',
  'verified exact crosswalk resolves one published curriculum version'
);

select throws_ok(
  $$update public.subject_offerings
      set curriculum_version_id='f9170000-0000-4000-8000-000000000001'
    where id='f9140000-0000-4000-8000-000000000001'$$,
  'Initial subject-offering curriculum pin must use the governed adoption workflow',
  'school actor cannot bypass adoption for the first curriculum pin'
);

select throws_ok(
  $$insert into public.subject_offerings(
      id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status,curriculum_version_id
    ) values(
      'f9140000-0000-4000-8000-000000000005',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      2026,
      'f9120000-0000-4000-8000-000000000001',
      'f9130000-0000-4000-8000-000000000001',
      5,
      'active',
      'f9170000-0000-4000-8000-000000000001'
    )$$,
  'Explicit curriculum pins are not accepted on subject-offering insert; use governed curriculum resolution',
  'subject-offering insert cannot inject an arbitrary curriculum pin'
);

select is(
  public.adopt_curriculum_version_for_subject_offering('f9140000-0000-4000-8000-000000000001'),
  'f9170000-0000-4000-8000-000000000001'::uuid,
  'governed adoption pins the matched curriculum version'
);

select is(
  (select curriculum_version_id from public.subject_offerings where id='f9140000-0000-4000-8000-000000000001'),
  'f9170000-0000-4000-8000-000000000001'::uuid,
  'adopted subject offering stores the canonical curriculum pin'
);

select throws_ok(
  $$update public.subject_offerings
      set curriculum_version_id=null
    where id='f9140000-0000-4000-8000-000000000001'$$,
  'Pinned subject-offering curriculum version is immutable; create a new offering/versioned academic record',
  'an adopted historical curriculum pin cannot be cleared or replaced'
);

reset role;

insert into public.subject_offerings(
  id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status
) values(
  'f9140000-0000-4000-8000-000000000003',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2026,
  'f9120000-0000-4000-8000-000000000001',
  'f9130000-0000-4000-8000-000000000003',
  5,
  'active'
);

select is(
  (select curriculum_version_id from public.subject_offerings where id='f9140000-0000-4000-8000-000000000003'),
  'f9170000-0000-4000-8000-000000000001'::uuid,
  'multi-grade applicability auto-links the same canonical version for Grade T9'
);

select set_config('request.jwt.claim.sub','f9100000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(
  (
    select concat_ws(':',resolution_state,candidate_count::text)
    from public.resolve_curriculum_version_for_subject_offering(
      'f9140000-0000-4000-8000-000000000002'
    )
  ),
  'none:0',
  'an offering with no verified canonical subject mapping resolves to none rather than guessing'
);
reset role;

insert into public.curriculum_versions(
  id,curriculum_subject_id,version_key,source_id,effective_from_year,effective_to_year,status
) values
  (
    'f9170000-0000-4000-8000-000000000002',
    'f9160000-0000-4000-8000-000000000001',
    '2027-general-v2',
    'f9150000-0000-4000-8000-000000000001',
    2027,
    null,
    'imported'
  ),
  (
    'f9170000-0000-4000-8000-000000000003',
    'f9160000-0000-4000-8000-000000000001',
    '2027-advanced-v1',
    'f9150000-0000-4000-8000-000000000001',
    2027,
    null,
    'imported'
  );

insert into public.curriculum_version_applicability(
  id,curriculum_version_id,phase_code,grade_key,programme_code
) values
  ('f9180000-0000-4000-8000-000000000003','f9170000-0000-4000-8000-000000000002','junior_secondary','T8','general'),
  ('f9180000-0000-4000-8000-000000000004','f9170000-0000-4000-8000-000000000003','junior_secondary','T8','advanced');

update public.curriculum_versions
set status='published',
    approved_by_user_id='f9100000-0000-4000-8000-000000000001',
    approved_at=now()
where id in (
  'f9170000-0000-4000-8000-000000000002',
  'f9170000-0000-4000-8000-000000000003'
);

insert into public.subject_offerings(
  id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status
) values(
  'f9140000-0000-4000-8000-000000000004',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2027,
  'f9120000-0000-4000-8000-000000000001',
  'f9130000-0000-4000-8000-000000000002',
  5,
  'active'
);

select is(
  (select curriculum_version_id from public.subject_offerings where id='f9140000-0000-4000-8000-000000000004'),
  null::uuid,
  'ambiguous equal published matches are not auto-linked'
);

select set_config('request.jwt.claim.sub','f9100000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(
  (
    select concat_ws(':',resolution_state,candidate_count::text)
    from public.resolve_curriculum_version_for_subject_offering(
      'f9140000-0000-4000-8000-000000000004'
    )
  ),
  'ambiguous:2',
  'resolver reports only the two equal general-programme candidates and excludes the advanced-programme version'
);
reset role;

select set_config('request.jwt.claim.sub','f9100000-0000-4000-8000-000000000001',true);
set local role authenticated;

select throws_ok(
  $$update public.curriculum_version_applicability
      set curriculum_version_id='f9170000-0000-4000-8000-000000000004'
    where id='f9180000-0000-4000-8000-000000000001'$$,
  'Approved or published curriculum applicability is immutable; create a new curriculum version',
  'published curriculum applicability cannot be reparented to a draft version'
);

select lives_ok(
  $$insert into public.official_education_resources(
      id,authority,resource_key,document_type,title,source_url,status
    ) values(
      'f9200000-0000-4000-8000-000000000001',
      'NIED',
      'curriculum-test-policy',
      'subject_policy_guide',
      'Curriculum Test Policy',
      'https://example.test/nied/policy.pdf',
      'under_review'
    )$$,
  'platform admin can stage an official education resource'
);

select lives_ok(
  $$insert into public.official_education_resources(
      id,authority,resource_key,document_type,title,source_url,status
    ) values(
      'f9200000-0000-4000-8000-000000000002',
      'NIED',
      'curriculum-test-draft-target',
      'teacher_guide',
      'Curriculum Test Draft Target',
      'https://example.test/nied/draft-target.pdf',
      'under_review'
    )$$,
  'platform admin can stage a second draft resource for finality tests'
);

select lives_ok(
  $$insert into public.official_education_resource_curriculum_links(
      id,resource_id,curriculum_version_id,relationship_type
    ) values(
      'f9210000-0000-4000-8000-000000000001',
      'f9200000-0000-4000-8000-000000000001',
      'f9170000-0000-4000-8000-000000000001',
      'policy'
    )$$,
  'platform admin can link a staged official resource before publication'
);

select lives_ok(
  $$update public.official_education_resources
    set checksum='sha256:test',status='published'
    where id='f9200000-0000-4000-8000-000000000001'$$,
  'platform admin can publish a reviewed resource with checksum provenance'
);

select is(
  (select approved_by_user_id from public.official_education_resources where id='f9200000-0000-4000-8000-000000000001'),
  'f9100000-0000-4000-8000-000000000001'::uuid,
  'resource publication actor is captured from auth context'
);

select throws_ok(
  $$update public.official_education_resource_curriculum_links
      set resource_id='f9200000-0000-4000-8000-000000000002'
    where id='f9210000-0000-4000-8000-000000000001'$$,
  'Published official resource applicability and links are immutable; publish a new resource version',
  'a child row cannot be reparented away from its published resource'
);

select lives_ok(
  $$update public.official_education_resources
      set status='withdrawn'
    where id='f9200000-0000-4000-8000-000000000001'$$,
  'a published resource may be withdrawn without rewriting its published content'
);

select throws_ok(
  $$update public.official_education_resources
      set title='Rewritten after withdrawal'
    where id='f9200000-0000-4000-8000-000000000001'$$,
  'Published official education resource content and provenance are immutable',
  'withdrawal does not reopen published resource content for editing'
);

select throws_ok(
  $$update public.official_education_resource_curriculum_links
    set relationship_type='companion'
    where id='f9210000-0000-4000-8000-000000000001'$$,
  'Published official resource applicability and links are immutable; publish a new resource version',
  'withdrawal does not reopen published resource children for editing'
);

reset role;

select set_config('request.jwt.claim.sub','f9100000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  $$insert into public.official_education_resources(
      authority,resource_key,document_type,title,source_url,status
    ) values(
      'NIED','teacher-write-denied','syllabus','Denied','https://example.test/denied.pdf','discovered'
    )$$,
  '42501',
  null,
  'ordinary school actors cannot mutate national resource definitions'
);
reset role;

select is(
  has_function_privilege(
    'authenticated',
    'app_private.resolve_curriculum_version_for_offering_fields(uuid,uuid,text,integer)',
    'EXECUTE'
  ),
  false,
  'internal resolver helper is not directly executable by authenticated clients'
);

insert into public.curriculum_versions(
  id,curriculum_subject_id,version_key,source_id,effective_from_year,status
) values(
  'f9170000-0000-4000-8000-000000000005',
  'f9160000-0000-4000-8000-000000000001',
  'withdrawal-finality-v1',
  'f9150000-0000-4000-8000-000000000001',
  2026,
  'imported'
);

insert into public.curriculum_units(
  id,curriculum_version_id,unit_code,topic,sequence_number,applicable_grade_keys
) values(
  'f9220000-0000-4000-8000-000000000001',
  'f9170000-0000-4000-8000-000000000005',
  'U-WITHDRAW',
  'Withdrawal finality',
  1,
  array['T8']
);

update public.curriculum_versions
set status='published',
    approved_by_user_id='f9100000-0000-4000-8000-000000000001',
    approved_at=now()
where id='f9170000-0000-4000-8000-000000000005';

update public.curriculum_versions
set status='withdrawn'
where id='f9170000-0000-4000-8000-000000000005';

select throws_ok(
  $$update public.curriculum_units
      set applicable_grade_keys=array['T9']
    where id='f9220000-0000-4000-8000-000000000001'$$,
  'Approved or published curriculum content is immutable; create a new curriculum version',
  'withdrawal does not reopen child grade applicability for editing'
);

select throws_ok(
  $$update public.curriculum_versions
      set metadata=jsonb_build_object('rewritten',true)
    where id='f9170000-0000-4000-8000-000000000005'$$,
  'Approved or published curriculum version content and provenance are immutable',
  'withdrawal does not reopen parent curriculum version provenance'
);

select throws_ok(
  $$update public.curriculum_versions
      set effective_to_year=2027
    where id='f9170000-0000-4000-8000-000000000005'$$,
  'Approved or published curriculum version content and provenance are immutable',
  'withdrawal does not reopen the approved applicability end year'
);

select throws_ok(
  $$update public.curriculum_versions
      set status='published'
    where id='f9170000-0000-4000-8000-000000000005'$$,
  'Approved curriculum version lifecycle can only move forward to a terminal state',
  'withdrawn curriculum version cannot return to a published lifecycle state'
);

select is(
  (select count(*)::integer from pg_trigger
   where tgname in (
     'curriculum_version_applicability_finality_trg',
     'official_education_resource_finality_trg',
     'official_resource_applicability_finality_trg',
     'official_resource_curriculum_link_finality_trg',
     'school_subject_curriculum_mapping_guard_trg',
     'subject_offering_curriculum_pin_guard_trg',
     'subject_offering_curriculum_autolink_trg'
   ) and not tgisinternal),
  7,
  'all curriculum applicability/resource finality and adoption triggers are installed'
);

select * from finish();
rollback;
