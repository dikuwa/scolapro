begin;

select plan(10);

select ok(
  not has_function_privilege('authenticated','app_private.user_can_manage_examinations(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_can_manage_examinations(uuid,uuid)','EXECUTE'),
  'arbitrary-user examination authority helper remains private'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_examination_candidate_creator_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_examination_candidate_creator_integrity()','EXECUTE'),
  'candidate creator integrity helper remains private'
);

select trigger_is(
  'public','examination_candidates','examination_candidate_creator_integrity_trg',
  'app_private','enforce_examination_candidate_creator_integrity',
  'candidate creator provenance trigger is installed'
);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('f6c00000-0000-4000-8000-000000000001','candidate-creator-exam@example.test','authenticated','authenticated',now(),now()),
('f6c00000-0000-4000-8000-000000000002','candidate-creator-principal@example.test','authenticated','authenticated',now(),now()),
('f6c00000-0000-4000-8000-000000000003','candidate-creator-unrelated@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6c00000-0000-4000-8000-000000000001','exam_officer',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6c00000-0000-4000-8000-000000000002','principal',current_date);

insert into public.examination_cycles(
  id,tenant_id,school_id,academic_year,cycle_key,display_name,authority,status
) values(
  'f6c10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  2026,'CREATOR-INTEGRITY','Creator Integrity','DNEA','open'
);

select throws_ok(
  $$insert into public.examination_candidates(
      tenant_id,school_id,examination_cycle_id,learner_id,enrolment_id,created_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6c10000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','f6c00000-0000-4000-8000-000000000003'
    )$$,
  'Examination candidate creator is not authorized for school',
  'trusted path cannot forge unrelated candidate creator'
);

select lives_ok(
  $$insert into public.examination_candidates(
      id,tenant_id,school_id,examination_cycle_id,learner_id,enrolment_id,created_by_user_id
    ) values(
      'f6c20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6c10000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','f6c00000-0000-4000-8000-000000000001'
    )$$,
  'trusted path can create candidate with authorized exam manager provenance'
);

select throws_ok(
  $$update public.examination_candidates
       set created_by_user_id='f6c00000-0000-4000-8000-000000000002'
     where id='f6c20000-0000-4000-8000-000000000001'$$,
  'Examination candidate creator provenance is immutable',
  'candidate creator cannot later be rewritten to another authorized manager'
);

select set_config('request.jwt.claim.sub','f6c00000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select throws_ok(
  $$insert into public.examination_candidates(
      tenant_id,school_id,examination_cycle_id,learner_id,enrolment_id,created_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6c10000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002','f6c00000-0000-4000-8000-000000000002'
    )$$,
  'Examination candidate creator must match authenticated actor',
  'authenticated exam manager cannot claim another authorized manager as creator'
);

select lives_ok(
  $$insert into public.examination_candidates(
      id,tenant_id,school_id,examination_cycle_id,learner_id,enrolment_id,created_by_user_id
    ) values(
      'f6c20000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6c10000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002','f6c00000-0000-4000-8000-000000000001'
    )$$,
  'authenticated exam manager can create candidate under own identity'
);

select is(
  (select created_by_user_id from public.examination_candidates where id='f6c20000-0000-4000-8000-000000000002'),
  'f6c00000-0000-4000-8000-000000000001'::uuid,
  'authenticated candidate retains caller as creator'
);

reset role;

select ok(
  (select with_check from pg_policies
   where schemaname='public' and tablename='examination_candidates'
     and policyname='exam staff can manage candidates [insert]') ilike '%created_by_user_id%auth.uid%',
  'candidate insert RLS binds creator to authenticated actor'
);

select * from finish();
rollback;
