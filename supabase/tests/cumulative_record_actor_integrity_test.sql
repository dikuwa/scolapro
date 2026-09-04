begin;

select plan(14);

select has_function(
  'app_private','user_can_manage_learner_support',array['uuid','uuid'],
  'private arbitrary-actor learner-support manager helper exists'
);
select has_function(
  'app_private','user_can_access_sensitive_crc',array['uuid','uuid','text'],
  'private arbitrary-actor sensitive CRC helper exists'
);
select has_function(
  'app_private','user_can_manage_enrolment_workflow',array['uuid','uuid'],
  'private arbitrary-actor enrolment workflow helper exists'
);

select is(
  (select count(*)::integer from pg_trigger
   where tgname in (
     'learner_development_observations_actor_integrity_trg',
     'learner_cumulative_notes_actor_integrity_trg',
     'learner_health_history_actor_integrity_trg',
     'learner_psychometric_records_actor_integrity_trg',
     'learner_prior_school_history_actor_integrity_trg'
   ) and not tgisinternal),
  5,
  'all cumulative record tables have physical actor guards'
);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('f7a00000-0000-4000-8000-000000000001','crc-unrelated@example.test','authenticated','authenticated',now(),now()),
('f7a00000-0000-4000-8000-000000000002','crc-principal@example.test','authenticated','authenticated',now(),now()),
('f7a00000-0000-4000-8000-000000000003','crc-counsellor@example.test','authenticated','authenticated',now(),now()),
('f7a00000-0000-4000-8000-000000000004','crc-school-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f7a00000-0000-4000-8000-000000000002','principal',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f7a00000-0000-4000-8000-000000000003','counsellor',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f7a00000-0000-4000-8000-000000000004','school_admin',current_date);

select throws_ok(
  $$insert into public.learner_development_observations(
      tenant_id,school_id,learner_id,enrolment_id,academic_year,domain,observation,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
      2026,'social','Forged development observation','f7a00000-0000-4000-8000-000000000001'
    )$$,
  'Cumulative learner record recorder mismatch: user is not authorized for record',
  'unrelated account cannot be forged as development observation recorder'
);

select throws_ok(
  $$insert into public.learner_cumulative_notes(
      tenant_id,school_id,learner_id,enrolment_id,note_type,note,sensitivity,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
      'recommendation','Forged support note','restricted','f7a00000-0000-4000-8000-000000000001'
    )$$,
  'Cumulative learner record recorder mismatch: user is not authorized for record',
  'unrelated account cannot be forged as cumulative note recorder'
);

select throws_ok(
  $$insert into public.learner_health_history(
      tenant_id,school_id,learner_id,enrolment_id,observed_on,general_health,sensitivity,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
      current_date,'Forged health record','restricted','f7a00000-0000-4000-8000-000000000001'
    )$$,
  'Cumulative learner record recorder mismatch: user is not authorized for record',
  'unrelated account cannot be forged as health-history recorder'
);

select throws_ok(
  $$insert into public.learner_psychometric_records(
      tenant_id,school_id,learner_id,enrolment_id,test_date,test_name,tester_name,sensitivity,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
      current_date,'Forged test','External','highly_restricted','f7a00000-0000-4000-8000-000000000001'
    )$$,
  'Cumulative learner record recorder mismatch: user is not authorized for record',
  'unrelated account cannot be forged as psychometric recorder'
);

select throws_ok(
  $$insert into public.learner_prior_school_history(
      tenant_id,school_id,learner_id,enrolment_id,school_name,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
      'Forged Prior School','f7a00000-0000-4000-8000-000000000001'
    )$$,
  'Cumulative learner record recorder mismatch: user is not authorized for record',
  'unrelated account cannot be forged as prior-school recorder'
);

select lives_ok(
  $$insert into public.learner_health_history(
      tenant_id,school_id,learner_id,enrolment_id,observed_on,general_health,sensitivity,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
      current_date,'Principal restricted health record','restricted','f7a00000-0000-4000-8000-000000000002'
    )$$,
  'principal remains authorized for restricted sensitive CRC records'
);

select throws_ok(
  $$insert into public.learner_psychometric_records(
      tenant_id,school_id,learner_id,enrolment_id,test_date,test_name,tester_name,sensitivity,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
      current_date,'Principal restricted boundary','External','highly_restricted','f7a00000-0000-4000-8000-000000000002'
    )$$,
  'Cumulative learner record recorder mismatch: user is not authorized for record',
  'principal does not receive highly restricted CRC authority automatically'
);

select lives_ok(
  $$insert into public.learner_psychometric_records(
      tenant_id,school_id,learner_id,enrolment_id,test_date,test_name,tester_name,sensitivity,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
      current_date,'Counsellor assessment','External','highly_restricted','f7a00000-0000-4000-8000-000000000003'
    )$$,
  'counsellor retains highly restricted CRC authority'
);

select lives_ok(
  $$insert into public.learner_prior_school_history(
      tenant_id,school_id,learner_id,enrolment_id,school_name,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
      'Verified Prior School','f7a00000-0000-4000-8000-000000000004'
    )$$,
  'school administrator retains enrolment-workflow authority for prior-school history'
);

select ok(
  not has_function_privilege('authenticated','app_private.user_can_manage_learner_support(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.user_can_access_sensitive_crc(uuid,uuid,text)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.user_can_manage_enrolment_workflow(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_cumulative_record_actor_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_cumulative_record_actor_integrity()','EXECUTE'),
  'cumulative actor helpers remain private from clients'
);

select * from finish();
rollback;
