begin;

select plan(12);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('f8a00000-0000-4000-8000-000000000001','crc-provenance-a@example.test','authenticated','authenticated',now(),now()),
('f8a00000-0000-4000-8000-000000000002','crc-provenance-b@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values('f8a10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','CRC-UNASSIGNED','Unassigned','Tester','active');

insert into public.learner_prior_school_history(
  id,tenant_id,school_id,learner_id,enrolment_id,school_name,recorded_by_user_id
) values(
  'f8a20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','Historical School','f8a00000-0000-4000-8000-000000000001'
);

insert into public.learner_health_history(
  id,tenant_id,school_id,learner_id,enrolment_id,observed_on,general_health,recorded_by_user_id
) values(
  'f8a20000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',current_date,'Good','f8a00000-0000-4000-8000-000000000001'
);

insert into public.learner_psychometric_records(
  id,tenant_id,school_id,learner_id,enrolment_id,test_date,test_name,tester_name,recorded_by_user_id
) values(
  'f8a20000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',current_date,'Baseline','External tester','f8a00000-0000-4000-8000-000000000001'
);

insert into public.learner_development_observations(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,domain,observation,recorded_by_user_id
) values(
  'f8a20000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',2026,'social','Baseline observation','f8a00000-0000-4000-8000-000000000001'
);

insert into public.learner_cumulative_notes(
  id,tenant_id,school_id,learner_id,enrolment_id,note_type,note,recorded_by_user_id
) values(
  'f8a20000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','recommendation','Baseline note','f8a00000-0000-4000-8000-000000000001'
);

select lives_ok(
  $$update public.learner_health_history set general_health='Updated narrative' where id='f8a20000-0000-4000-8000-000000000002'$$,
  'ordinary cumulative record narrative corrections remain allowed'
);

select throws_ok(
  $$update public.learner_prior_school_history set recorded_by_user_id='f8a00000-0000-4000-8000-000000000002' where id='f8a20000-0000-4000-8000-000000000001'$$,
  'Cumulative learner record scope and recorder provenance are immutable',
  'prior-school recorder provenance cannot be rewritten'
);

select throws_ok(
  $$update public.learner_health_history set learner_id='50000000-0000-4000-8000-000000000002' where id='f8a20000-0000-4000-8000-000000000002'$$,
  'Cumulative learner record scope and recorder provenance are immutable',
  'health-history learner identity cannot be rebound'
);

select throws_ok(
  $$update public.learner_psychometric_records set enrolment_id=null where id='f8a20000-0000-4000-8000-000000000003'$$,
  'Cumulative learner record scope and recorder provenance are immutable',
  'psychometric enrolment provenance cannot be detached'
);

select throws_ok(
  $$update public.learner_development_observations set school_id='22222222-2222-4222-8222-222222222223' where id='f8a20000-0000-4000-8000-000000000004'$$,
  'Cumulative learner record scope and recorder provenance are immutable',
  'development observation school scope cannot be rebound'
);

select throws_ok(
  $$update public.learner_cumulative_notes set recorded_by_user_id='f8a00000-0000-4000-8000-000000000002' where id='f8a20000-0000-4000-8000-000000000005'$$,
  'Cumulative learner record scope and recorder provenance are immutable',
  'cumulative-note recorder provenance cannot be rewritten'
);

select throws_ok(
  $$insert into public.learner_development_observations(
      tenant_id,school_id,learner_id,enrolment_id,academic_year,domain,observation,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',2025,'social','Wrong year','f8a00000-0000-4000-8000-000000000001'
    )$$,
  'Development observation academic year does not match enrolment',
  'development observation year must match linked enrolment'
);

select throws_ok(
  $$insert into public.learner_psychometric_records(
      tenant_id,school_id,learner_id,enrolment_id,test_date,test_name,tester_staff_member_id,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',current_date,'Unassigned tester','f8a10000-0000-4000-8000-000000000001','f8a00000-0000-4000-8000-000000000001'
    )$$,
  'Psychometric tester is not assigned to learner school on test date',
  'internal psychometric tester must be assigned to learner school'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_cumulative_record_provenance_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_cumulative_record_provenance_integrity()','EXECUTE'),
  'cumulative record provenance helper is private from client roles'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_development_observation_year_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_development_observation_year_integrity()','EXECUTE'),
  'development observation year helper is private from client roles'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_psychometric_tester_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_psychometric_tester_scope_integrity()','EXECUTE'),
  'psychometric tester helper is private from client roles'
);

select is(
  (select count(*)::integer from pg_trigger
   where tgname in (
     'learner_prior_school_history_provenance_integrity_trg',
     'learner_health_history_provenance_integrity_trg',
     'learner_psychometric_records_provenance_integrity_trg',
     'learner_development_observations_provenance_integrity_trg',
     'learner_cumulative_notes_provenance_integrity_trg'
   ) and not tgisinternal),
  5,
  'all cumulative record tables have provenance-finality triggers'
);

select is(
  (select count(*)::integer from pg_trigger
   where tgname in ('learner_development_observations_year_integrity_trg','learner_psychometric_records_tester_scope_integrity_trg')
     and not tgisinternal),
  2,
  'specialized development-year and psychometric-tester guards are installed'
);

select * from finish();
rollback;
