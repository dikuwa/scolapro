begin;

select plan(10);

insert into public.statutory_form_definitions(
  id,form_key,display_name,authority,description,active
) values(
  'ab110000-0000-4000-8000-000000000001','emis-annual-return','EMIS Annual Return','MoEAC','Annual statutory return',true
);

insert into public.statutory_form_versions(
  id,form_definition_id,version_key,effective_from,source_reference,field_schema,mapping_schema,validation_schema,status
) values(
  'ab120000-0000-4000-8000-000000000001','ab110000-0000-4000-8000-000000000001','2026-v1','2026-01-01','MoEAC 2026','{"fields":["learner_count"]}'::jsonb,'{}'::jsonb,'{}'::jsonb,'draft'
);

select lives_ok(
  $$update public.statutory_form_definitions set display_name='EMIS Annual School Return',description='Updated display metadata' where id='ab110000-0000-4000-8000-000000000001'$$,
  'ordinary statutory form definition metadata remains editable'
);

select throws_ok(
  $$update public.statutory_form_definitions set form_key='rewritten-form-key' where id='ab110000-0000-4000-8000-000000000001'$$,
  'Statutory form definition identity and creation provenance are immutable',
  'statutory form identity cannot be rewritten'
);

select lives_ok(
  $$update public.statutory_form_versions set field_schema='{"fields":["learner_count","staff_count"]}'::jsonb where id='ab120000-0000-4000-8000-000000000001'$$,
  'draft statutory form schema remains editable'
);

select throws_ok(
  $$update public.statutory_form_versions set version_key='2026-rebound' where id='ab120000-0000-4000-8000-000000000001'$$,
  'Statutory form version identity and creation provenance are immutable',
  'statutory form version identity cannot be rewritten'
);

select lives_ok(
  $$update public.statutory_form_versions set status='approved' where id='ab120000-0000-4000-8000-000000000001'$$,
  'statutory form version can transition into approved state'
);

select throws_ok(
  $$update public.statutory_form_versions set mapping_schema='{"rewritten":true}'::jsonb where id='ab120000-0000-4000-8000-000000000001'$$,
  'Approved or published statutory form schema is immutable; create a new form version',
  'approved statutory form schema cannot be silently rewritten'
);

select lives_ok(
  $$update public.statutory_form_versions set status='published',effective_to='2026-12-31' where id='ab120000-0000-4000-8000-000000000001'$$,
  'approved statutory form lifecycle and effective-to closure remain editable'
);

select throws_ok(
  $$delete from public.statutory_form_versions where id='ab120000-0000-4000-8000-000000000001'$$,
  'Approved or published statutory form versions are immutable historical records',
  'published statutory form version cannot be deleted'
);

select throws_ok(
  $$delete from public.statutory_form_definitions where id='ab110000-0000-4000-8000-000000000001'$$,
  'Statutory form definitions with approved or published history cannot be deleted',
  'form definition cannot cascade-delete published history'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_statutory_form_definition_provenance()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_statutory_form_definition_provenance()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_statutory_form_version_provenance_finality()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_statutory_form_version_provenance_finality()','EXECUTE')
  and (select count(*) from pg_trigger where tgname in (
    'statutory_form_definitions_provenance_trg',
    'statutory_form_versions_provenance_finality_trg'
  ) and not tgisinternal)=2,
  'statutory form integrity helpers are private and both triggers are installed'
);

select * from finish();
rollback;
