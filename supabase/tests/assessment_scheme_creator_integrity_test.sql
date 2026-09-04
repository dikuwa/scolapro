begin;

select plan(10);

select ok(
  not has_function_privilege('authenticated','app_private.user_is_academic_leader(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_is_academic_leader(uuid,uuid)','EXECUTE'),
  'arbitrary-user academic-leader helper remains private'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_assessment_scheme_creator_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_assessment_scheme_creator_integrity()','EXECUTE'),
  'assessment-scheme creator helper remains private'
);

select trigger_is(
  'public','assessment_schemes','assessment_scheme_creator_integrity_trg',
  'app_private','enforce_assessment_scheme_creator_integrity',
  'assessment-scheme creator trigger is installed'
);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('f6d00000-0000-4000-8000-000000000001','scheme-creator-hod@example.test','authenticated','authenticated',now(),now()),
('f6d00000-0000-4000-8000-000000000002','scheme-creator-principal@example.test','authenticated','authenticated',now(),now()),
('f6d00000-0000-4000-8000-000000000003','scheme-creator-unrelated@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6d00000-0000-4000-8000-000000000001','hod',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6d00000-0000-4000-8000-000000000002','principal',current_date);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values('f6d10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','SCHEMEACT','Scheme Actor Subject','active');

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name)
values('f6d11000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'SCHEMEACT','Scheme Actor Grade');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
values('f6d12000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'f6d10000-0000-4000-8000-000000000001','f6d11000-0000-4000-8000-000000000001',5,'active');

select throws_ok(
  $$insert into public.assessment_schemes(
      tenant_id,school_id,subject_offering_id,scheme_key,version,capture_mode,effective_from,status,created_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6d12000-0000-4000-8000-000000000001',
      'forged','1','final_result',current_date,'draft','f6d00000-0000-4000-8000-000000000003'
    )$$,
  'Assessment scheme creator is not authorized for school',
  'trusted path cannot forge unrelated assessment-scheme creator'
);

select lives_ok(
  $$insert into public.assessment_schemes(
      id,tenant_id,school_id,subject_offering_id,scheme_key,version,capture_mode,effective_from,status,created_by_user_id
    ) values(
      'f6d13000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6d12000-0000-4000-8000-000000000001',
      'valid','1','final_result',current_date,'draft','f6d00000-0000-4000-8000-000000000001'
    )$$,
  'trusted path can record authorized assessment-scheme creator'
);

select throws_ok(
  $$update public.assessment_schemes
       set created_by_user_id='f6d00000-0000-4000-8000-000000000002'
     where id='f6d13000-0000-4000-8000-000000000001'$$,
  'Assessment scheme creator provenance is immutable',
  'creator cannot later be rewritten to another authorized academic leader'
);

select set_config('request.jwt.claim.sub','f6d00000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select throws_ok(
  $$insert into public.assessment_schemes(
      tenant_id,school_id,subject_offering_id,scheme_key,version,capture_mode,effective_from,status,created_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6d12000-0000-4000-8000-000000000001',
      'client-forged','1','final_result',current_date,'draft','f6d00000-0000-4000-8000-000000000002'
    )$$,
  'Assessment scheme creator must match authenticated actor',
  'authenticated academic leader cannot claim another manager as creator'
);

select lives_ok(
  $$insert into public.assessment_schemes(
      tenant_id,school_id,subject_offering_id,scheme_key,version,capture_mode,effective_from,status,created_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6d12000-0000-4000-8000-000000000001',
      'client-own','1','final_result',current_date,'draft','f6d00000-0000-4000-8000-000000000001'
    )$$,
  'authenticated academic leader can create assessment scheme under own identity'
);

select is(
  (select created_by_user_id from public.assessment_schemes where scheme_key='client-own'),
  'f6d00000-0000-4000-8000-000000000001'::uuid,
  'authenticated assessment scheme retains caller as creator'
);

reset role;

select ok(
  (select with_check from pg_policies
   where schemaname='public' and tablename='assessment_schemes'
     and policyname='academic leaders can manage assessment schemes [insert]') ilike '%created_by_user_id%auth.uid%',
  'assessment-scheme insert RLS binds creator to authenticated actor'
);

select ok(
  app_private.user_is_academic_leader('f6d00000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222')
  and not app_private.user_is_academic_leader('f6d00000-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222222'),
  'arbitrary-user helper mirrors academic-leader membership authority'
);

select * from finish();
rollback;