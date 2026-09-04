begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('faa00000-0000-4000-8000-000000000001','audit-member@example.test','authenticated','authenticated',now(),now()),
  ('faa00000-0000-4000-8000-000000000002','audit-former@example.test','authenticated','authenticated',now(),now()),
  ('faa00000-0000-4000-8000-000000000003','audit-future@example.test','authenticated','authenticated',now(),now()),
  ('faa00000-0000-4000-8000-000000000004','audit-platform@example.test','authenticated','authenticated',now(),now()),
  ('faa00000-0000-4000-8000-000000000005','audit-guardian@example.test','authenticated','authenticated',now(),now()),
  ('faa00000-0000-4000-8000-000000000006','audit-unrelated@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug)
values('faa10000-0000-4000-8000-000000000001','Audit Actor Tenant','audit-actor-tenant');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('faa20000-0000-4000-8000-000000000001','faa10000-0000-4000-8000-000000000001','Audit Actor School','AUD-ACTOR','Khomas','Windhoek');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from,active_to)
values
  ('faa10000-0000-4000-8000-000000000001','faa20000-0000-4000-8000-000000000001','faa00000-0000-4000-8000-000000000001','teacher',current_date-30,null),
  ('faa10000-0000-4000-8000-000000000001','faa20000-0000-4000-8000-000000000001','faa00000-0000-4000-8000-000000000002','teacher',current_date-60,current_date-10),
  ('faa10000-0000-4000-8000-000000000001','faa20000-0000-4000-8000-000000000001','faa00000-0000-4000-8000-000000000003','teacher',current_date+10,null);

insert into public.platform_memberships(user_id,role_key,active_from)
values('faa00000-0000-4000-8000-000000000004','platform_admin',current_date-1);

insert into public.learners(id,tenant_id,first_names,surname)
values('faa30000-0000-4000-8000-000000000001','faa10000-0000-4000-8000-000000000001','Audit','Learner');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values('faa40000-0000-4000-8000-000000000001','faa10000-0000-4000-8000-000000000001','faa20000-0000-4000-8000-000000000001','faa30000-0000-4000-8000-000000000001',2026,current_date-30,'current');

insert into public.guardian_profiles(id,tenant_id,first_names,surname,status)
values('faa50000-0000-4000-8000-000000000001','faa10000-0000-4000-8000-000000000001','Audit','Guardian','active');

insert into public.learner_guardians(tenant_id,learner_id,guardian_id,relationship_type,effective_from)
values('faa10000-0000-4000-8000-000000000001','faa30000-0000-4000-8000-000000000001','faa50000-0000-4000-8000-000000000001','guardian',current_date-30);

insert into public.guardian_user_links(tenant_id,guardian_id,user_id,linked_by_user_id)
values('faa10000-0000-4000-8000-000000000001','faa50000-0000-4000-8000-000000000001','faa00000-0000-4000-8000-000000000005','faa00000-0000-4000-8000-000000000005');

select throws_ok(
  $$insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type)
    values('faa10000-0000-4000-8000-000000000001','faa20000-0000-4000-8000-000000000001','faa00000-0000-4000-8000-000000000006','test.audit','test')$$,
  'Audit event scope mismatch: actor is not related to school',
  'school audit cannot attribute an unrelated user account'
);

select lives_ok(
  $$insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type)
    values('faa10000-0000-4000-8000-000000000001','faa20000-0000-4000-8000-000000000001','faa00000-0000-4000-8000-000000000001','member.audit','test')$$,
  'active school member remains valid audit actor provenance'
);

select lives_ok(
  $$insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type)
    values('faa10000-0000-4000-8000-000000000001','faa20000-0000-4000-8000-000000000001','faa00000-0000-4000-8000-000000000002','former.audit','test')$$,
  'former school member remains valid historical actor provenance'
);

select throws_ok(
  $$insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type)
    values('faa10000-0000-4000-8000-000000000001','faa20000-0000-4000-8000-000000000001','faa00000-0000-4000-8000-000000000003','future.audit','test')$$,
  'Audit event scope mismatch: actor is not related to school',
  'future school relationship cannot backdate audit authority'
);

select lives_ok(
  $$insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type)
    values('faa10000-0000-4000-8000-000000000001','faa20000-0000-4000-8000-000000000001','faa00000-0000-4000-8000-000000000004','platform.audit','test')$$,
  'platform administrator remains valid school audit actor provenance'
);

select lives_ok(
  $$insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type)
    values('faa10000-0000-4000-8000-000000000001','faa20000-0000-4000-8000-000000000001','faa00000-0000-4000-8000-000000000005','guardian.audit','test')$$,
  'guardian linked to an enrolled learner remains valid school audit actor provenance'
);

select lives_ok(
  $$insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type)
    values('faa10000-0000-4000-8000-000000000001','faa20000-0000-4000-8000-000000000001',null,'system.audit','test')$$,
  'nullable system actor remains valid for school audit events'
);

select lives_ok(
  $$insert into public.audit_events(tenant_id,actor_user_id,event_type,entity_type)
    values('faa10000-0000-4000-8000-000000000001','faa00000-0000-4000-8000-000000000006','tenant.audit','tenant')$$,
  'tenant-only audit semantics remain unchanged by school actor guard'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_audit_event_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_audit_event_integrity()','EXECUTE'),
  'audit integrity helper remains private from client roles'
);

select * from finish();
rollback;
