begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fb700000-0000-4000-8000-000000000001','assessment-scheme-scope@example.test','authenticated','authenticated',now(),now());

insert into public.subject_offerings(
  id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status
)
select
  'fb710000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2026,
  (select id from public.subjects where school_id='22222222-2222-4222-8222-222222222222' order by id limit 1),
  (select id from public.grades where school_id='22222222-2222-4222-8222-222222222222' order by id limit 1),
  5,
  'active';

insert into public.tenants(id,name,slug)
values('fb720000-0000-4000-8000-000000000001','Assessment Scope Tenant B','assessment-scope-tenant-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('fb730000-0000-4000-8000-000000000001','fb720000-0000-4000-8000-000000000001','Assessment Scope School B','ASSESS-SCOPE-B','Khomas','Windhoek');

select throws_ok(
  $$insert into public.assessment_schemes(
      tenant_id,school_id,subject_offering_id,scheme_key,version,capture_mode,effective_from,status,created_by_user_id
    ) values(
      'fb720000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','fb710000-0000-4000-8000-000000000001',
      'bad-tenant','1','final_result',current_date,'draft','fb700000-0000-4000-8000-000000000001'
    )$$,
  'Assessment scheme scope mismatch: school does not belong to tenant',
  'assessment scheme tenant must match its school tenant'
);

select throws_ok(
  $$insert into public.assessment_schemes(
      tenant_id,school_id,subject_offering_id,scheme_key,version,capture_mode,effective_from,status,created_by_user_id
    ) values(
      'fb720000-0000-4000-8000-000000000001','fb730000-0000-4000-8000-000000000001','fb710000-0000-4000-8000-000000000001',
      'bad-offering','1','final_result',current_date,'draft','fb700000-0000-4000-8000-000000000001'
    )$$,
  'Assessment scheme scope mismatch: subject offering does not belong to school',
  'assessment scheme cannot bind a subject offering from another school'
);

select lives_ok(
  $$insert into public.assessment_schemes(
      id,tenant_id,school_id,subject_offering_id,scheme_key,version,capture_mode,effective_from,status,created_by_user_id
    ) values(
      'fb740000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb710000-0000-4000-8000-000000000001',
      'valid-scope','1','final_result',current_date,'draft','fb700000-0000-4000-8000-000000000001'
    )$$,
  'valid same-school assessment scheme remains allowed'
);

select lives_ok(
  $$update public.assessment_schemes set status='active' where id='fb740000-0000-4000-8000-000000000001'$$,
  'ordinary assessment-scheme lifecycle updates remain allowed'
);

select throws_ok(
  $$update public.assessment_schemes
       set tenant_id='fb720000-0000-4000-8000-000000000001', school_id='fb730000-0000-4000-8000-000000000001'
     where id='fb740000-0000-4000-8000-000000000001'$$,
  'Assessment scheme tenant, school, and subject offering are immutable',
  'assessment scheme scope cannot be moved after creation'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_assessment_scheme_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_assessment_scheme_scope_integrity()','EXECUTE'),
  'assessment-scheme integrity trigger helper is private from client roles'
);

select is(
  (select count(*)::integer from pg_trigger where tgrelid='public.assessment_schemes'::regclass and tgname='assessment_scheme_scope_integrity_trg' and not tgisinternal),
  1,
  'assessment schemes have exactly one scope-integrity trigger'
);

select * from finish();
rollback;
