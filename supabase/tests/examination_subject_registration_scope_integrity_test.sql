begin;

select plan(7);

insert into auth.users(id,email,created_at,updated_at)
values ('ee100000-0000-4000-8000-000000000001','exam-subject@example.test',now(),now());

insert into public.tenants(id,name,slug)
values ('ee110000-0000-4000-8000-000000000001','Exam Subject Tenant B','exam-subject-tenant-b');

insert into public.examination_cycles(id,tenant_id,school_id,academic_year,cycle_key,display_name)
values ('ee120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'NSSCAS-2026','NSSCAS 2026');

insert into public.examination_candidates(id,tenant_id,school_id,examination_cycle_id,learner_id,enrolment_id,created_by_user_id)
values
  ('ee130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ee120000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','ee100000-0000-4000-8000-000000000001'),
  ('ee130000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ee120000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002','ee100000-0000-4000-8000-000000000001');

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name)
values ('ee140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','EXAMSCI','Exam Science');

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name)
values ('ee150000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2027,'10','Grade 10 2027');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id)
values
  ('ee160000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'ee140000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010'),
  ('ee160000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2027,'ee140000-0000-4000-8000-000000000001','ee150000-0000-4000-8000-000000000001');

select throws_ok(
  $$insert into public.examination_subject_registrations(tenant_id,school_id,candidate_id,subject_code,subject_offering_id)
    values('ee110000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','ee130000-0000-4000-8000-000000000001','EXAMSCI','ee160000-0000-4000-8000-000000000001')$$,
  'Examination subject registration scope mismatch: candidate does not match registration scope',
  'subject registration tenant and school must match candidate scope'
);

select throws_ok(
  $$insert into public.examination_subject_registrations(tenant_id,school_id,candidate_id,subject_code,subject_offering_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ee130000-0000-4000-8000-000000000001','EXAMSCI','ee160000-0000-4000-8000-000000000002')$$,
  'Examination subject registration scope mismatch: subject offering does not match candidate examination year',
  'subject offering must match candidate examination year'
);

select lives_ok(
  $$insert into public.examination_subject_registrations(id,tenant_id,school_id,candidate_id,subject_code,subject_name,subject_offering_id)
    values('ee170000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ee130000-0000-4000-8000-000000000001','EXAMSCI','Exam Science','ee160000-0000-4000-8000-000000000001')$$,
  'valid examination subject registration remains allowed'
);

select lives_ok(
  $$update public.examination_subject_registrations set subject_offering_id=null where id='ee170000-0000-4000-8000-000000000001'$$,
  'draft registration may clear subject offering while preserving candidate scope'
);

select lives_ok(
  $$update public.examination_subject_registrations set subject_offering_id='ee160000-0000-4000-8000-000000000001' where id='ee170000-0000-4000-8000-000000000001'$$,
  'draft registration may restore a valid same-year subject offering'
);

select throws_ok(
  $$update public.examination_subject_registrations set candidate_id='ee130000-0000-4000-8000-000000000002' where id='ee170000-0000-4000-8000-000000000001'$$,
  'Examination subject registration tenant, school, and candidate are immutable',
  'subject registration candidate identity cannot be moved after creation'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_examination_subject_registration_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_examination_subject_registration_scope_integrity()','EXECUTE'),
  'examination subject registration integrity helper is private from client roles'
);

select * from finish();
rollback;