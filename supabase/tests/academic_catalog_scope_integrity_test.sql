begin;

select plan(8);

insert into public.tenants(id,name,slug)
values
  ('fd100000-0000-4000-8000-000000000001','Catalog Scope Tenant A','catalog-scope-a'),
  ('fd100000-0000-4000-8000-000000000002','Catalog Scope Tenant B','catalog-scope-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values
  ('fd110000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001','Catalog Scope School A','CAT-A','Khomas','Windhoek'),
  ('fd110000-0000-4000-8000-000000000002','fd100000-0000-4000-8000-000000000002','Catalog Scope School B','CAT-B','Erongo','Walvis Bay');

select throws_ok(
  $$insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
    values('fd120000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000002','fd110000-0000-4000-8000-000000000001','BADS','Bad Subject','active')$$,
  'subjects scope mismatch: school does not belong to tenant',
  'subject tenant must match school tenant'
);

select lives_ok(
  $$insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
    values('fd120000-0000-4000-8000-000000000002','fd100000-0000-4000-8000-000000000001','fd110000-0000-4000-8000-000000000001','GOOD','Good Subject','active')$$,
  'valid subject scope remains allowed'
);

select throws_ok(
  $$update public.subjects set tenant_id='fd100000-0000-4000-8000-000000000002', school_id='fd110000-0000-4000-8000-000000000002' where id='fd120000-0000-4000-8000-000000000002'$$,
  'subjects tenant and school scope are immutable',
  'subject cannot be moved between schools'
);

select throws_ok(
  $$insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name)
    values('fd130000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000002','fd110000-0000-4000-8000-000000000001',2026,'G8','Bad Grade')$$,
  'grades scope mismatch: school does not belong to tenant',
  'grade tenant must match school tenant'
);

select lives_ok(
  $$insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name)
    values('fd130000-0000-4000-8000-000000000002','fd100000-0000-4000-8000-000000000001','fd110000-0000-4000-8000-000000000001',2026,'G8','Good Grade')$$,
  'valid grade scope remains allowed'
);

select lives_ok(
  $$update public.grades set display_name='Grade Eight' where id='fd130000-0000-4000-8000-000000000002'$$,
  'ordinary grade metadata correction remains allowed'
);

select throws_ok(
  $$update public.grades set tenant_id='fd100000-0000-4000-8000-000000000002', school_id='fd110000-0000-4000-8000-000000000002' where id='fd130000-0000-4000-8000-000000000002'$$,
  'grades tenant and school scope are immutable',
  'grade cannot be moved between schools'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_school_scoped_catalog_root()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_school_scoped_catalog_root()','EXECUTE')
  and (select count(*)=1 from pg_trigger where tgrelid='public.subjects'::regclass and tgname='subjects_scope_integrity_trg' and not tgisinternal)
  and (select count(*)=1 from pg_trigger where tgrelid='public.grades'::regclass and tgname='grades_scope_integrity_trg' and not tgisinternal),
  'catalog root triggers exist and helper is private'
);

select * from finish();
rollback;
