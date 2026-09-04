begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fd000000-0000-4000-8000-000000000001','pacing-hod@example.test','authenticated','authenticated',now(),now()),
  ('fd000000-0000-4000-8000-000000000002','pacing-other@example.test','authenticated','authenticated',now(),now()),
  ('fd000000-0000-4000-8000-000000000003','pacing-manager@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(id,tenant_id,school_id,user_id,role_key,active_from)
values
  ('fd010000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd000000-0000-4000-8000-000000000001','hod',current_date-1),
  ('fd010000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd000000-0000-4000-8000-000000000003','principal',current_date-1);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,curriculum_subject_key)
values('fd020000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','PACE','Pacing Test Subject','PACE_TEST');

insert into public.curriculum_subjects(id,curriculum_key,display_name,subject_code)
values('fd030000-0000-4000-8000-000000000001','PACE_TEST','Pacing Test Curriculum','PACE');

insert into public.curriculum_versions(id,curriculum_subject_id,version_key,effective_from_year,status)
values('fd040000-0000-4000-8000-000000000001','fd030000-0000-4000-8000-000000000001','v1',2026,'published');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,curriculum_version_id)
values('fd050000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fd020000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010','fd040000-0000-4000-8000-000000000001');

select ok(
  not has_function_privilege('authenticated','app_private.enforce_pacing_plan_creator_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_pacing_plan_creator_integrity()','EXECUTE'),
  'pacing plan creator trigger helper is private'
);

select trigger_is('public','pacing_plans','pacing_plan_creator_integrity_trg','app_private','enforce_pacing_plan_creator_integrity','creator guard is installed');

select throws_ok(
  $$insert into public.pacing_plans(tenant_id,school_id,academic_year,subject_offering_id,curriculum_version_id,plan_level,status,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fd050000-0000-4000-8000-000000000001','fd040000-0000-4000-8000-000000000001','department','draft','fd000000-0000-4000-8000-000000000002')$$,
  'Pacing plan creator is not authorized for school',
  'trusted write cannot credit an unrelated user'
);

select lives_ok(
  $$insert into public.pacing_plans(id,tenant_id,school_id,academic_year,subject_offering_id,curriculum_version_id,plan_level,status,created_by_user_id)
    values('fd060000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fd050000-0000-4000-8000-000000000001','fd040000-0000-4000-8000-000000000001','department','draft','fd000000-0000-4000-8000-000000000001')$$,
  'authorized academic leader can be preserved as creator'
);

select lives_ok(
  $$update public.pacing_plans set capacity_summary='{"periods":5}'::jsonb where id='fd060000-0000-4000-8000-000000000001'$$,
  'ordinary pacing plan edits remain allowed'
);

select throws_ok(
  $$update public.pacing_plans set created_by_user_id='fd000000-0000-4000-8000-000000000003' where id='fd060000-0000-4000-8000-000000000001'$$,
  'Pacing plan creator provenance is immutable',
  'creator cannot be rewritten to another authorized academic leader'
);

select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select throws_ok(
  $$insert into public.pacing_plans(tenant_id,school_id,academic_year,subject_offering_id,curriculum_version_id,plan_level,status,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fd050000-0000-4000-8000-000000000001','fd040000-0000-4000-8000-000000000001','department','draft','fd000000-0000-4000-8000-000000000003')$$,
  'Pacing plan creator must match authenticated actor',
  'authenticated leader cannot claim another manager as creator'
);

select lives_ok(
  $$insert into public.pacing_plans(tenant_id,school_id,academic_year,subject_offering_id,curriculum_version_id,plan_level,status,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fd050000-0000-4000-8000-000000000001','fd040000-0000-4000-8000-000000000001','department','draft','fd000000-0000-4000-8000-000000000001')$$,
  'authenticated academic leader can create a self-authored pacing plan'
);

reset role;

select ok(
  exists(
    select 1 from pg_policies
    where schemaname='public' and tablename='pacing_plans'
      and policyname='academic leaders can manage pacing plans [insert]'
      and with_check like '%created_by_user_id%auth.uid()%'
  ),
  'insert policy binds pacing plan creator to authenticated actor'
);

select * from finish();
rollback;
