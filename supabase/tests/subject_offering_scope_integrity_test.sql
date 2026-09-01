begin;

select plan(8);

insert into public.tenants(id,name,slug)
values
  ('fc100000-0000-4000-8000-000000000001','Offering Scope Tenant A','offering-scope-a'),
  ('fc100000-0000-4000-8000-000000000002','Offering Scope Tenant B','offering-scope-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values
  ('fc110000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001','Offering Scope School A','OFFER-A','Khomas','Windhoek'),
  ('fc110000-0000-4000-8000-000000000002','fc100000-0000-4000-8000-000000000002','Offering Scope School B','OFFER-B','Erongo','Swakopmund');

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values
  ('fc120000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001','fc110000-0000-4000-8000-000000000001','TESTA','Test Subject A','active'),
  ('fc120000-0000-4000-8000-000000000002','fc100000-0000-4000-8000-000000000002','fc110000-0000-4000-8000-000000000002','TESTB','Test Subject B','active');

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name)
values
  ('fc130000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001','fc110000-0000-4000-8000-000000000001',2026,'G8','Grade 8 A'),
  ('fc130000-0000-4000-8000-000000000002','fc100000-0000-4000-8000-000000000002','fc110000-0000-4000-8000-000000000002',2026,'G8','Grade 8 B'),
  ('fc130000-0000-4000-8000-000000000003','fc100000-0000-4000-8000-000000000001','fc110000-0000-4000-8000-000000000001',2027,'G8','Grade 8 A 2027');

select throws_ok(
  $$insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
    values('fc140000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000002','fc110000-0000-4000-8000-000000000001',2026,'fc120000-0000-4000-8000-000000000001','fc130000-0000-4000-8000-000000000001',5,'active')$$,
  'Subject offering scope mismatch: school does not belong to tenant',
  'subject offering tenant must match school tenant'
);

select throws_ok(
  $$insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
    values('fc140000-0000-4000-8000-000000000002','fc100000-0000-4000-8000-000000000001','fc110000-0000-4000-8000-000000000001',2026,'fc120000-0000-4000-8000-000000000002','fc130000-0000-4000-8000-000000000001',5,'active')$$,
  'Subject offering scope mismatch: subject does not belong to tenant and school',
  'subject offering cannot bind a subject from another school'
);

select throws_ok(
  $$insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
    values('fc140000-0000-4000-8000-000000000003','fc100000-0000-4000-8000-000000000001','fc110000-0000-4000-8000-000000000001',2026,'fc120000-0000-4000-8000-000000000001','fc130000-0000-4000-8000-000000000002',5,'active')$$,
  'Subject offering scope mismatch: grade does not belong to tenant, school, and academic year',
  'subject offering cannot bind a grade from another school'
);

select throws_ok(
  $$insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
    values('fc140000-0000-4000-8000-000000000004','fc100000-0000-4000-8000-000000000001','fc110000-0000-4000-8000-000000000001',2026,'fc120000-0000-4000-8000-000000000001','fc130000-0000-4000-8000-000000000003',5,'active')$$,
  'Subject offering scope mismatch: grade does not belong to tenant, school, and academic year',
  'subject offering academic year must match grade academic year'
);

select lives_ok(
  $$insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
    values('fc140000-0000-4000-8000-000000000005','fc100000-0000-4000-8000-000000000001','fc110000-0000-4000-8000-000000000001',2026,'fc120000-0000-4000-8000-000000000001','fc130000-0000-4000-8000-000000000001',5,'active')$$,
  'valid subject offering remains allowed'
);

select lives_ok(
  $$update public.subject_offerings set periods_per_cycle=6, status='inactive' where id='fc140000-0000-4000-8000-000000000005'$$,
  'ordinary offering configuration updates remain allowed'
);

select throws_ok(
  $$update public.subject_offerings set academic_year=2027, grade_id='fc130000-0000-4000-8000-000000000003' where id='fc140000-0000-4000-8000-000000000005'$$,
  'Subject offering tenant, school, academic year, subject, and grade are immutable',
  'subject offering scope cannot be moved after creation'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_subject_offering_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_subject_offering_scope_integrity()','EXECUTE')
  and (select count(*)=1 from pg_trigger where tgrelid='public.subject_offerings'::regclass and tgname='subject_offering_scope_integrity_trg' and not tgisinternal),
  'subject-offering scope trigger exists and helper is private'
);

select * from finish();
rollback;
