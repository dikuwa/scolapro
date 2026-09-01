begin;

select plan(7);

insert into public.tenants(id,name,slug)
values
  ('fe100000-0000-4000-8000-000000000001','Register Scope Tenant A','register-scope-a'),
  ('fe100000-0000-4000-8000-000000000002','Register Scope Tenant B','register-scope-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values
  ('fe110000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000001','Register Scope School A','REG-A','Khomas','Windhoek'),
  ('fe110000-0000-4000-8000-000000000002','fe100000-0000-4000-8000-000000000002','Register Scope School B','REG-B','Erongo','Swakopmund');

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name)
values
  ('fe120000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000001','fe110000-0000-4000-8000-000000000001',2026,'G8','Grade 8 A'),
  ('fe120000-0000-4000-8000-000000000002','fe100000-0000-4000-8000-000000000002','fe110000-0000-4000-8000-000000000002',2026,'G8','Grade 8 B'),
  ('fe120000-0000-4000-8000-000000000003','fe100000-0000-4000-8000-000000000001','fe110000-0000-4000-8000-000000000001',2027,'G8','Grade 8 A 2027');

select throws_ok(
  $$insert into public.register_classes(id,tenant_id,school_id,grade_id,academic_year,class_code,display_name)
    values('fe130000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000002','fe110000-0000-4000-8000-000000000001','fe120000-0000-4000-8000-000000000001',2026,'8A','8A')$$,
  'Register class scope mismatch: school does not belong to tenant',
  'register class tenant must match school tenant'
);

select throws_ok(
  $$insert into public.register_classes(id,tenant_id,school_id,grade_id,academic_year,class_code,display_name)
    values('fe130000-0000-4000-8000-000000000002','fe100000-0000-4000-8000-000000000001','fe110000-0000-4000-8000-000000000001','fe120000-0000-4000-8000-000000000002',2026,'8B','8B')$$,
  'Register class scope mismatch: grade does not belong to tenant, school, and academic year',
  'register class cannot bind a grade from another school'
);

select throws_ok(
  $$insert into public.register_classes(id,tenant_id,school_id,grade_id,academic_year,class_code,display_name)
    values('fe130000-0000-4000-8000-000000000003','fe100000-0000-4000-8000-000000000001','fe110000-0000-4000-8000-000000000001','fe120000-0000-4000-8000-000000000003',2026,'8C','8C')$$,
  'Register class scope mismatch: grade does not belong to tenant, school, and academic year',
  'register class academic year must match grade year'
);

select lives_ok(
  $$insert into public.register_classes(id,tenant_id,school_id,grade_id,academic_year,class_code,display_name)
    values('fe130000-0000-4000-8000-000000000004','fe100000-0000-4000-8000-000000000001','fe110000-0000-4000-8000-000000000001','fe120000-0000-4000-8000-000000000001',2026,'8D','8D')$$,
  'valid register class remains allowed'
);

select lives_ok(
  $$update public.register_classes set display_name='Grade 8D' where id='fe130000-0000-4000-8000-000000000004'$$,
  'ordinary class metadata update remains allowed'
);

select throws_ok(
  $$update public.register_classes set grade_id='fe120000-0000-4000-8000-000000000003',academic_year=2027 where id='fe130000-0000-4000-8000-000000000004'$$,
  'Register class tenant, school, grade, and academic year are immutable',
  'register class scope cannot be moved after creation'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_register_class_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_register_class_scope_integrity()','EXECUTE')
  and (select count(*)=1 from pg_trigger where tgrelid='public.register_classes'::regclass and tgname='register_class_scope_integrity_trg' and not tgisinternal),
  'register-class scope trigger exists and helper is private'
);

select * from finish();
rollback;
