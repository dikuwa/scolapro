begin;

select plan(7);

insert into public.tenants(id,name,slug)
values
  ('fa100000-0000-4000-8000-000000000001','Guardian Scope Tenant A','guardian-scope-tenant-a'),
  ('fa100000-0000-4000-8000-000000000002','Guardian Scope Tenant B','guardian-scope-tenant-b');

insert into public.learners(id,tenant_id,first_names,surname)
values
  ('fa110000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','Learner','One'),
  ('fa110000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000000002','Learner','Two');

insert into public.guardian_profiles(id,tenant_id,first_names,surname)
values
  ('fa120000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','Guardian','One'),
  ('fa120000-0000-4000-8000-000000000002','fa100000-0000-4000-8000-000000000002','Guardian','Two');

select throws_ok(
  $$insert into public.learner_guardians(tenant_id,learner_id,guardian_id,relationship_type)
    values('fa100000-0000-4000-8000-000000000001','fa110000-0000-4000-8000-000000000002','fa120000-0000-4000-8000-000000000001','parent')$$,
  'Learner guardian scope mismatch: learner does not belong to tenant',
  'relationship learner must belong to relationship tenant'
);

select throws_ok(
  $$insert into public.learner_guardians(tenant_id,learner_id,guardian_id,relationship_type)
    values('fa100000-0000-4000-8000-000000000001','fa110000-0000-4000-8000-000000000001','fa120000-0000-4000-8000-000000000002','parent')$$,
  'Learner guardian scope mismatch: guardian does not belong to tenant',
  'relationship guardian must belong to relationship tenant'
);

select lives_ok(
  $$insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,relationship_type,priority)
    values('fa130000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','fa110000-0000-4000-8000-000000000001','fa120000-0000-4000-8000-000000000001','parent',1)$$,
  'valid learner guardian relationship remains allowed'
);

select lives_ok(
  $$update public.learner_guardians
    set relationship_type='legal_guardian', priority=2, is_emergency_contact=true
    where id='fa130000-0000-4000-8000-000000000001'$$,
  'relationship metadata remains mutable'
);

select throws_ok(
  $$update public.learner_guardians
    set guardian_id='fa120000-0000-4000-8000-000000000002'
    where id='fa130000-0000-4000-8000-000000000001'$$,
  'Learner guardian tenant, learner, and guardian are immutable',
  'guardian identity cannot be moved after relationship creation'
);

select throws_ok(
  $$update public.learner_guardians
    set learner_id='fa110000-0000-4000-8000-000000000002'
    where id='fa130000-0000-4000-8000-000000000001'$$,
  'Learner guardian tenant, learner, and guardian are immutable',
  'learner identity cannot be moved after relationship creation'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_learner_guardian_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_learner_guardian_scope_integrity()','EXECUTE'),
  'learner guardian integrity helper is private from client roles'
);

select * from finish();
rollback;