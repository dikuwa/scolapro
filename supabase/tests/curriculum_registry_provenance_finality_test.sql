begin;

select plan(12);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('aa100000-0000-4000-8000-000000000001','curriculum-finality@example.test','authenticated','authenticated',now(),now());

insert into public.curriculum_sources(
  id,authority,source_key,title,status
) values(
  'aa110000-0000-4000-8000-000000000001','NIED','nied-science-2026','NIED Science Source','verified'
);

insert into public.curriculum_subjects(
  id,curriculum_key,display_name,phase_code,subject_code,authority,active
) values(
  'aa120000-0000-4000-8000-000000000001','science-js','Science','JS','SCI','NIED',true
);

insert into public.curriculum_versions(
  id,curriculum_subject_id,version_key,source_id,effective_from_year,status,metadata
) values(
  'aa130000-0000-4000-8000-000000000001','aa120000-0000-4000-8000-000000000001','2026-v1','aa110000-0000-4000-8000-000000000001',2026,'imported','{}'::jsonb
);

insert into public.curriculum_units(
  id,curriculum_version_id,unit_code,topic,sequence_number
) values(
  'aa140000-0000-4000-8000-000000000001','aa130000-0000-4000-8000-000000000001','U1','Matter',1
);

insert into public.curriculum_objectives(
  id,curriculum_unit_id,objective_code,objective_text,sequence_number
) values(
  'aa150000-0000-4000-8000-000000000001','aa140000-0000-4000-8000-000000000001','OBJ1','Explain states of matter',1
);

select lives_ok(
  $$update public.curriculum_units set topic='Matter and materials' where id='aa140000-0000-4000-8000-000000000001'$$,
  'draft/imported curriculum content remains editable before approval'
);

select lives_ok(
  $$update public.curriculum_sources set title='NIED Science Source Updated' where id='aa110000-0000-4000-8000-000000000001'$$,
  'non-identity curriculum source metadata remains editable'
);

select throws_ok(
  $$update public.curriculum_sources set source_key='rewritten-source-key' where id='aa110000-0000-4000-8000-000000000001'$$,
  'Curriculum source identity is immutable',
  'curriculum source key cannot be rewritten'
);

select throws_ok(
  $$update public.curriculum_versions set version_key='2026-rebound' where id='aa130000-0000-4000-8000-000000000001'$$,
  'Curriculum version identity and source provenance are immutable',
  'curriculum version identity cannot be rewritten'
);

select throws_ok(
  $$update public.curriculum_units set curriculum_version_id='00000000-0000-4000-8000-000000000000' where id='aa140000-0000-4000-8000-000000000001'$$,
  'Curriculum unit parent and code are immutable',
  'curriculum unit cannot be rebound to another version'
);

select lives_ok(
  $$update public.curriculum_versions
       set status='approved',approved_by_user_id='aa100000-0000-4000-8000-000000000001',approved_at=now(),updated_at=now()
     where id='aa130000-0000-4000-8000-000000000001'$$,
  'curriculum version can transition into approved state'
);

select throws_ok(
  $$update public.curriculum_versions set metadata='{"rewritten":true}'::jsonb where id='aa130000-0000-4000-8000-000000000001'$$,
  'Approved or published curriculum version content and provenance are immutable',
  'approved curriculum version metadata cannot be rewritten'
);

select throws_ok(
  $$update public.curriculum_units set topic='Silently rewritten matter' where id='aa140000-0000-4000-8000-000000000001'$$,
  'Approved or published curriculum content is immutable; create a new curriculum version',
  'approved curriculum unit content cannot be rewritten'
);

select throws_ok(
  $$insert into public.curriculum_objectives(curriculum_unit_id,objective_code,objective_text,sequence_number)
    values('aa140000-0000-4000-8000-000000000001','OBJ2','New post-approval objective',2)$$,
  'Approved or published curriculum content is immutable; create a new curriculum version',
  'approved curriculum version cannot gain new child content'
);

select throws_ok(
  $$delete from public.curriculum_units where id='aa140000-0000-4000-8000-000000000001'$$,
  'Approved or published curriculum content is immutable; create a new curriculum version',
  'approved curriculum content cannot be deleted'
);

select lives_ok(
  $$update public.curriculum_versions set status='published',updated_at=now() where id='aa130000-0000-4000-8000-000000000001'$$,
  'approved curriculum version lifecycle can advance to published'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_curriculum_registry_identity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_curriculum_registry_identity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_curriculum_version_finality()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_curriculum_version_finality()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_curriculum_child_finality()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_curriculum_child_finality()','EXECUTE')
  and (select count(*) from pg_trigger where tgname in (
    'curriculum_sources_identity_integrity_trg',
    'curriculum_subjects_identity_integrity_trg',
    'curriculum_versions_identity_integrity_trg',
    'curriculum_versions_finality_trg',
    'curriculum_units_identity_integrity_trg',
    'curriculum_units_finality_trg',
    'curriculum_objectives_identity_integrity_trg',
    'curriculum_objectives_finality_trg',
    'curriculum_competencies_identity_integrity_trg',
    'curriculum_competencies_finality_trg',
    'curriculum_practicals_identity_integrity_trg',
    'curriculum_practicals_finality_trg'
  ) and not tgisinternal)=12,
  'curriculum integrity helpers are private and all provenance/finality triggers are installed'
);

select * from finish();
rollback;
