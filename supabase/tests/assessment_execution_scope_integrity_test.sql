begin;

select plan(20);

select has_function('app_private','enforce_assessment_component_scope_integrity',array[]::text[],'assessment component scope helper exists');
select has_function('app_private','enforce_assessment_instance_scope_integrity',array[]::text[],'assessment instance scope helper exists');
select has_function('app_private','enforce_learner_mark_scope_integrity',array[]::text[],'learner mark scope helper exists');

select trigger_is('public','assessment_components','assessment_component_scope_integrity_trg','app_private','enforce_assessment_component_scope_integrity','assessment component integrity trigger installed');
select trigger_is('public','assessment_instances','assessment_instance_scope_integrity_trg','app_private','enforce_assessment_instance_scope_integrity','assessment instance integrity trigger installed');
select trigger_is('public','learner_marks','learner_mark_scope_integrity_trg','app_private','enforce_learner_mark_scope_integrity','learner mark integrity trigger installed');

select ok(
  not has_function_privilege('anon','app_private.enforce_assessment_component_scope_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_assessment_component_scope_integrity()','EXECUTE'),
  'assessment component helper is private from client roles'
);
select ok(
  not has_function_privilege('anon','app_private.enforce_assessment_instance_scope_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_assessment_instance_scope_integrity()','EXECUTE'),
  'assessment instance helper is private from client roles'
);
select ok(
  not has_function_privilege('anon','app_private.enforce_learner_mark_scope_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_learner_mark_scope_integrity()','EXECUTE'),
  'learner mark helper is private from client roles'
);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fd000000-0000-4000-8000-000000000001','assessment-execution-scope@example.test','authenticated','authenticated',now(),now());

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values('fd100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','EXEC-SCOPE','Assessment Execution Scope','active');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
values('fd200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fd100000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active');

insert into public.assessment_schemes(id,tenant_id,school_id,subject_offering_id,scheme_key,version,capture_mode,effective_from,status,created_by_user_id)
values('fd300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd200000-0000-4000-8000-000000000001','EXEC-SCOPE','1','detailed','2026-01-01','active','fd000000-0000-4000-8000-000000000001');

select throws_ok(
  $$insert into public.assessment_components(
      tenant_id,school_id,assessment_scheme_id,component_code,display_name,component_type,raw_max,weight
    ) values(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','fd300000-0000-4000-8000-000000000001',
      'BAD','Bad scope component','task',50,40
    )$$,
  'Assessment component scope mismatch: scheme belongs to another tenant or school',
  'assessment component cannot claim a tenant different from its scheme'
);

select lives_ok(
  $$insert into public.assessment_components(
      id,tenant_id,school_id,assessment_scheme_id,component_code,display_name,component_type,raw_max,weight
    ) values(
      'fd400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'fd300000-0000-4000-8000-000000000001','CA','Continuous Assessment','task',50,40
    )$$,
  'valid same-school assessment component remains allowed'
);

select throws_ok(
  $$insert into public.assessment_instances(
      tenant_id,school_id,academic_year,assessment_scheme_id,assessment_component_id,subject_offering_id,register_class_id,term_number,display_name,raw_max,status,created_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2025,
      'fd300000-0000-4000-8000-000000000001','fd400000-0000-4000-8000-000000000001','fd200000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-00000000001a',1,'Wrong year instance',50,'not_open','fd000000-0000-4000-8000-000000000001'
    )$$,
  'Assessment instance scope mismatch: subject offering belongs to another school or academic year',
  'assessment instance academic year must match its subject offering'
);

select lives_ok(
  $$insert into public.assessment_instances(
      id,tenant_id,school_id,academic_year,assessment_scheme_id,assessment_component_id,subject_offering_id,register_class_id,term_number,display_name,raw_max,status,created_by_user_id
    ) values(
      'fd500000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
      'fd300000-0000-4000-8000-000000000001','fd400000-0000-4000-8000-000000000001','fd200000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-00000000001a',1,'Valid 10A instance',50,'not_open','fd000000-0000-4000-8000-000000000001'
    )$$,
  'valid assessment instance remains allowed'
);

select lives_ok(
  $$insert into public.learner_marks(
      id,tenant_id,school_id,assessment_instance_id,enrolment_id,learner_id,numeric_mark,recorded_by_user_id
    ) values(
      'fd600000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'fd500000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',42,
      'fd000000-0000-4000-8000-000000000001'
    )$$,
  'mark for the exact learner enrolment and assessment class remains allowed'
);

select throws_ok(
  $$insert into public.learner_marks(
      tenant_id,school_id,assessment_instance_id,enrolment_id,learner_id,numeric_mark,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'fd500000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002',39,
      'fd000000-0000-4000-8000-000000000001'
    )$$,
  'Learner mark scope mismatch: enrolment or learner does not belong to the assessment class and year',
  'mark cannot use an enrolment from another register class'
);

select throws_ok(
  $$insert into public.learner_marks(
      tenant_id,school_id,assessment_instance_id,enrolment_id,learner_id,numeric_mark,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'fd500000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',39,
      'fd000000-0000-4000-8000-000000000001'
    )$$,
  'Learner mark scope mismatch: enrolment or learner does not belong to the assessment class and year',
  'mark learner identity must match the selected enrolment'
);

select lives_ok(
  $$insert into public.assessment_instances(
      id,tenant_id,school_id,academic_year,assessment_scheme_id,assessment_component_id,subject_offering_id,register_class_id,term_number,display_name,raw_max,status,created_by_user_id
    ) values(
      'fd500000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
      'fd300000-0000-4000-8000-000000000001','fd400000-0000-4000-8000-000000000001','fd200000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-00000000001a',1,'Second 10A instance',50,'not_open','fd000000-0000-4000-8000-000000000001'
    )$$,
  'second valid assessment instance remains allowed'
);

select throws_ok(
  $$insert into public.learner_marks(
      tenant_id,school_id,assessment_instance_id,enrolment_id,learner_id,numeric_mark,recorded_by_user_id,replaces_mark_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'fd500000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',43,
      'fd000000-0000-4000-8000-000000000001','fd600000-0000-4000-8000-000000000001'
    )$$,
  'Learner mark scope mismatch: replacement target belongs to another learner or assessment',
  'mark revision cannot replace a mark from another assessment instance'
);

select throws_ok(
  $$update public.assessment_instances
       set academic_year=2025
     where id='fd500000-0000-4000-8000-000000000001'$$,
  'Assessment instance scope mismatch: subject offering belongs to another school or academic year',
  'assessment instance cannot be moved to another academic year'
);

select throws_ok(
  $$update public.learner_marks
       set learner_id='50000000-0000-4000-8000-000000000002'
     where id='fd600000-0000-4000-8000-000000000001'$$,
  'Learner mark scope mismatch: enrolment or learner does not belong to the assessment class and year',
  'learner mark provenance cannot be reassigned to another learner'
);

select * from finish();
rollback;
