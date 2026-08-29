begin;

select plan(5);

select is(
  (select count(*)::integer from public.school_learner_identifiers where school_id='22222222-2222-4222-8222-222222222222' and learner_id in ('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002')),
  2,
  'seeded enrolments establish stable school learner identifiers'
);

select is(
  (select admission_number from public.school_learner_identifiers where school_id='22222222-2222-4222-8222-222222222222' and learner_id='50000000-0000-4000-8000-000000000001'),
  'DEMO-001',
  'stable identifier preserves the seeded admission number'
);

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name)
values('f8000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2027,'11-TST','Grade 11 Test');
insert into public.register_classes(id,tenant_id,school_id,grade_id,academic_year,class_code,display_name)
values('f8100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f8000000-0000-4000-8000-000000000001',2027,'11T','Grade 11 Test');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,grade_id,register_class_id,admission_number,enrolled_from,status)
values('f8200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',2027,'f8000000-0000-4000-8000-000000000001','f8100000-0000-4000-8000-000000000001',null,'2027-01-10','current');

select is(
  (select admission_number from public.enrolments where id='f8200000-0000-4000-8000-000000000001'),
  'DEMO-001',
  'new annual enrolment inherits the existing stable school admission number when omitted'
);

select throws_ok(
  $$insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,grade_id,register_class_id,admission_number,enrolled_from,status)
    values('f8200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000002',2027,'f8000000-0000-4000-8000-000000000001','f8100000-0000-4000-8000-000000000001','WRONG-ID','2027-01-10','current')$$,
  'Enrolment admission number conflicts with stable school learner identifier',
  'new enrolment cannot replace an existing stable learner identifier'
);

select ok(
  exists(select 1 from pg_trigger where tgrelid='public.enrolments'::regclass and tgname='enrolment_school_identifier_consistency_trg' and not tgisinternal),
  'enrolment identifier consistency trigger is installed'
);

select * from finish();
rollback;
