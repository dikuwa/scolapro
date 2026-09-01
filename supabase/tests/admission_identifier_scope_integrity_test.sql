begin;

select plan(8);

insert into public.tenants(id,name,slug)
values
  ('ff100000-0000-4000-8000-000000000001','Admission Scope Tenant A','admission-scope-tenant-a'),
  ('ff100000-0000-4000-8000-000000000002','Admission Scope Tenant B','admission-scope-tenant-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values
  ('ff110000-0000-4000-8000-000000000001','ff100000-0000-4000-8000-000000000001','Admission Scope School A','ADM-SCOPE-A','Khomas','Windhoek'),
  ('ff110000-0000-4000-8000-000000000002','ff100000-0000-4000-8000-000000000002','Admission Scope School B','ADM-SCOPE-B','Khomas','Windhoek');

insert into public.learners(id,tenant_id,first_names,surname)
values
  ('ff120000-0000-4000-8000-000000000001','ff100000-0000-4000-8000-000000000001','Learner','One'),
  ('ff120000-0000-4000-8000-000000000002','ff100000-0000-4000-8000-000000000002','Learner','Two');

select throws_ok(
  $$insert into public.school_admission_sequences(school_id,tenant_id,next_number)
    values('ff110000-0000-4000-8000-000000000001','ff100000-0000-4000-8000-000000000002',1)$$,
  'School admission sequence scope mismatch: school does not belong to tenant',
  'admission sequence tenant must match school tenant'
);

select lives_ok(
  $$insert into public.school_admission_sequences(school_id,tenant_id,next_number)
    values('ff110000-0000-4000-8000-000000000001','ff100000-0000-4000-8000-000000000001',1)$$,
  'valid school admission sequence remains allowed'
);

select lives_ok(
  $$update public.school_admission_sequences set next_number=2 where school_id='ff110000-0000-4000-8000-000000000001'$$,
  'admission sequence counter remains mutable'
);

select throws_ok(
  $$insert into public.school_learner_identifiers(tenant_id,school_id,learner_id,admission_number,source)
    values('ff100000-0000-4000-8000-000000000002','ff110000-0000-4000-8000-000000000001','ff120000-0000-4000-8000-000000000001','A-001','manual')$$,
  'School learner identifier scope mismatch: school does not belong to tenant',
  'learner identifier tenant must match school tenant'
);

select throws_ok(
  $$insert into public.school_learner_identifiers(tenant_id,school_id,learner_id,admission_number,source)
    values('ff100000-0000-4000-8000-000000000001','ff110000-0000-4000-8000-000000000001','ff120000-0000-4000-8000-000000000002','A-002','manual')$$,
  'School learner identifier scope mismatch: learner does not belong to tenant',
  'learner identifier cannot attach a learner from another tenant'
);

select lives_ok(
  $$insert into public.school_learner_identifiers(id,tenant_id,school_id,learner_id,admission_number,source)
    values('ff130000-0000-4000-8000-000000000001','ff100000-0000-4000-8000-000000000001','ff110000-0000-4000-8000-000000000001','ff120000-0000-4000-8000-000000000001','A-003','manual')$$,
  'valid learner identifier remains allowed'
);

select throws_ok(
  $$update public.school_learner_identifiers set learner_id='ff120000-0000-4000-8000-000000000002' where id='ff130000-0000-4000-8000-000000000001'$$,
  'School learner identifier tenant, school, and learner are immutable',
  'learner identifier identity cannot be moved after creation'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_school_admission_sequence_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_school_admission_sequence_scope_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_school_learner_identifier_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_school_learner_identifier_scope_integrity()','EXECUTE'),
  'admission and identifier integrity helpers are private from client roles'
);

select * from finish();
rollback;
