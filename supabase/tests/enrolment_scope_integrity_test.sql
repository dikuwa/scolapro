begin;

select plan(9);

insert into public.tenants(id,name,slug)
values
  ('fa100000-0000-4000-8000-000000000001','Enrolment Scope Tenant A','enrolment-scope-tenant-a'),
  ('fa100000-0000-4000-8000-000000000002','Enrolment Scope Tenant B','enrolment-scope-tenant-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values
  ('fa110000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','Enrolment Scope School A','ENR-SCOPE-A','Khomas','Windhoek'),
  ('fa110000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000000002','Enrolment Scope School B','ENR-SCOPE-B','Khomas','Windhoek');

insert into public.learners(id,tenant_id,first_names,surname)
values
  ('fa120000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','Learner','One'),
  ('fa120000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000000002','Learner','Two');

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name)
values
  ('fa130000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','fa110000-0000-4000-8000-000000000001',2026,'8','Grade 8'),
  ('fa130000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000000002','fa110000-0000-4000-8000-000000000002',2026,'8','Grade 8');

insert into public.register_classes(id,tenant_id,school_id,grade_id,academic_year,class_code,display_name)
values
  ('fa140000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','fa110000-0000-4000-8000-000000000001','fa130000-0000-4000-8000-000000000001',2026,'8A','Grade 8A'),
  ('fa140000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000000002','fa110000-0000-4000-8000-000000000002','fa130000-0000-4000-8000-000000000002',2026,'8A','Grade 8A');

select throws_ok(
  $$insert into public.enrolments(tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
    values('fa100000-0000-4000-8000-000000000002','fa110000-0000-4000-8000-000000000001','fa120000-0000-4000-8000-000000000001',2026,'2026-01-10','current')$$,
  'Enrolment scope mismatch: school does not belong to tenant',
  'enrolment tenant must match school tenant'
);

select throws_ok(
  $$insert into public.enrolments(tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
    values('fa100000-0000-4000-8000-000000000001','fa110000-0000-4000-8000-000000000001','fa120000-0000-4000-8000-000000000002',2026,'2026-01-10','current')$$,
  'Enrolment scope mismatch: learner does not belong to tenant',
  'enrolment learner must match tenant'
);

select throws_ok(
  $$insert into public.enrolments(tenant_id,school_id,learner_id,academic_year,grade_id,enrolled_from,status)
    values('fa100000-0000-4000-8000-000000000001','fa110000-0000-4000-8000-000000000001','fa120000-0000-4000-8000-000000000001',2026,'fa130000-0000-4000-8000-000000000002','2026-01-10','current')$$,
  'Enrolment scope mismatch: grade does not belong to enrolment school and academic year',
  'enrolment grade must match school and academic year'
);

select throws_ok(
  $$insert into public.enrolments(tenant_id,school_id,learner_id,academic_year,register_class_id,enrolled_from,status)
    values('fa100000-0000-4000-8000-000000000001','fa110000-0000-4000-8000-000000000001','fa120000-0000-4000-8000-000000000001',2026,'fa140000-0000-4000-8000-000000000001','2026-01-10','current')$$,
  'Enrolment scope mismatch: register class requires a grade',
  'register class cannot be assigned without grade'
);

select throws_ok(
  $$insert into public.enrolments(tenant_id,school_id,learner_id,academic_year,grade_id,register_class_id,enrolled_from,status)
    values('fa100000-0000-4000-8000-000000000001','fa110000-0000-4000-8000-000000000001','fa120000-0000-4000-8000-000000000001',2026,'fa130000-0000-4000-8000-000000000001','fa140000-0000-4000-8000-000000000002','2026-01-10','current')$$,
  'Enrolment scope mismatch: register class does not belong to enrolment grade, school, and academic year',
  'register class must match enrolment grade school and year'
);

select lives_ok(
  $$insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,grade_id,register_class_id,enrolled_from,status)
    values('fa150000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','fa110000-0000-4000-8000-000000000001','fa120000-0000-4000-8000-000000000001',2026,'fa130000-0000-4000-8000-000000000001','fa140000-0000-4000-8000-000000000001','2026-01-10','current')$$,
  'valid enrolment remains allowed'
);

select lives_ok(
  $$update public.enrolments set register_class_id=null where id='fa150000-0000-4000-8000-000000000001'$$,
  'same-scope class reassignment remains mutable'
);

select throws_ok(
  $$update public.enrolments set academic_year=2027 where id='fa150000-0000-4000-8000-000000000001'$$,
  'Enrolment tenant, school, learner, and academic year are immutable',
  'enrolment identity cannot be moved after creation'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_enrolment_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_enrolment_scope_integrity()','EXECUTE'),
  'enrolment integrity helper is private from client roles'
);

select * from finish();
rollback;