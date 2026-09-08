begin;

select plan(8);

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values(
  'fd740000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'LTSM Subject Scope School 2','LTSM-SUBJ-2','Khomas','Windhoek'
);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values
  ('fd750000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','MATH','Mathematics','active'),
  ('fd750000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fd740000-0000-4000-8000-000000000001','SCI','Science','active');

select lives_ok(
  $$insert into public.learning_resource_titles(id,tenant_id,school_id,resource_type,title,status)
    values('fd760000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','library_book','General Library Book','active')$$,
  'general learning resources remain valid without a subject'
);

select lives_ok(
  $$insert into public.learning_resource_titles(id,tenant_id,school_id,resource_type,title,subject_id,subject_code,status)
    values('fd760000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','textbook','Canonical Mathematics Book','fd750000-0000-4000-8000-000000000001','wrong-shadow-value','active')$$,
  'subject-linked resource accepts canonical same-school subject reference'
);

select is(
  (select subject_code from public.learning_resource_titles where id='fd760000-0000-4000-8000-000000000002'),
  'MATH',
  'subject code snapshot is derived from the canonical subject rather than caller text'
);

select lives_ok(
  $$insert into public.learning_resource_titles(id,tenant_id,school_id,resource_type,title,subject_code,status)
    values('fd760000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','teacher_resource','Code Compatibility Resource','math','active')$$,
  'legacy subject-code input resolves through the canonical school subject'
);

select is(
  (select subject_id from public.learning_resource_titles where id='fd760000-0000-4000-8000-000000000003'),
  'fd750000-0000-4000-8000-000000000001'::uuid,
  'legacy subject-code input stores the canonical subject id'
);

select throws_ok(
  $$insert into public.learning_resource_titles(tenant_id,school_id,resource_type,title,subject_code,status)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','textbook','Shadow Subject Book','NOT-A-SUBJECT','active')$$,
  'Learning resource subject must reference a canonical school subject',
  'nonexistent shadow subject codes are rejected'
);

select throws_ok(
  $$insert into public.learning_resource_titles(tenant_id,school_id,resource_type,title,subject_id,status)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','textbook','Cross-school Subject Book','fd750000-0000-4000-8000-000000000002','active')$$,
  'Learning resource subject scope mismatch',
  'cross-school canonical subject references are rejected'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_learning_resource_title_subject_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_learning_resource_title_subject_integrity()','EXECUTE'),
  'LTSM subject-integrity trigger helper is not directly executable by client roles'
);

select * from finish();
rollback;
