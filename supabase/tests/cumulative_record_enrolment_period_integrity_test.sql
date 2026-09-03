begin;

select plan(13);

select trigger_is(
  'public','learner_health_history','learner_health_history_temporal_scope_guard',
  'app_private','enforce_learner_event_enrolment_period',
  'health history is guarded by learner enrolment period'
);

select trigger_is(
  'public','learner_psychometric_records','learner_psychometric_records_temporal_scope_guard',
  'app_private','enforce_learner_event_enrolment_period',
  'psychometric records are guarded by learner enrolment period'
);

select trigger_is(
  'public','learner_development_observations','learner_development_observations_temporal_scope_guard',
  'app_private','enforce_learner_event_enrolment_period',
  'development observations are guarded by learner enrolment period'
);

select trigger_is(
  'public','learner_cumulative_notes','learner_cumulative_notes_temporal_scope_guard',
  'app_private','enforce_learner_event_enrolment_period',
  'cumulative notes are guarded by learner enrolment period'
);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('f9700000-0000-4000-8000-000000000001','crc-period-author@example.test','authenticated','authenticated',now(),now());

update public.enrolments
   set enrolled_to='2026-06-30', status='completed'
 where id='60000000-0000-4000-8000-000000000001';

select throws_ok(
  $$insert into public.learner_health_history(
      tenant_id,school_id,learner_id,enrolment_id,observed_on,general_health,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001','2026-07-01','Routine check','f9700000-0000-4000-8000-000000000001'
    )$$,
  'Learner event date must fall within referenced enrolment period',
  'health observation cannot postdate referenced enrolment'
);

select throws_ok(
  $$insert into public.learner_psychometric_records(
      tenant_id,school_id,learner_id,enrolment_id,test_date,test_name,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001','2026-01-11','Baseline','f9700000-0000-4000-8000-000000000001'
    )$$,
  'Learner event date must fall within referenced enrolment period',
  'psychometric test cannot predate referenced enrolment'
);

select throws_ok(
  $$insert into public.learner_cumulative_notes(
      tenant_id,school_id,learner_id,note_date,note_type,note,sensitivity,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',
      '2027-01-01','general_remark','No covering enrolment','routine','f9700000-0000-4000-8000-000000000001'
    )$$,
  'Learner event date must fall within a school enrolment period',
  'cumulative note without enrolment id still needs a covering school enrolment'
);

select throws_ok(
  $$insert into public.learner_development_observations(
      tenant_id,school_id,learner_id,enrolment_id,academic_year,domain,observation,observed_on,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',2026,'social','Outside period','2026-07-01','f9700000-0000-4000-8000-000000000001'
    )$$,
  'Learner event date must fall within referenced enrolment period',
  'dated development observation cannot postdate referenced enrolment'
);

select throws_ok(
  $$insert into public.learner_development_observations(
      tenant_id,school_id,learner_id,academic_year,domain,observation,observed_on,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',
      2027,'social','Wrong academic year','2026-05-01','f9700000-0000-4000-8000-000000000001'
    )$$,
  'Development observation academic year does not match learner enrolment on observation date',
  'dated development observation year must match covering learner enrolment'
);

select throws_ok(
  $$insert into public.learner_development_observations(
      tenant_id,school_id,learner_id,academic_year,domain,observation,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',
      2027,'overall_impression','Undated wrong academic year','f9700000-0000-4000-8000-000000000001'
    )$$,
  'Development observation academic year has no learner enrolment at school',
  'undated development observation still requires learner enrolment in recorded academic year'
);

select lives_ok(
  $$insert into public.learner_health_history(
      tenant_id,school_id,learner_id,enrolment_id,observed_on,general_health,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001','2026-05-01','Good','f9700000-0000-4000-8000-000000000001'
    );
    insert into public.learner_psychometric_records(
      tenant_id,school_id,learner_id,enrolment_id,test_date,test_name,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001','2026-05-02','Baseline','f9700000-0000-4000-8000-000000000001'
    );
    insert into public.learner_development_observations(
      tenant_id,school_id,learner_id,enrolment_id,academic_year,domain,observation,observed_on,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',2026,'social','Valid observation','2026-05-03','f9700000-0000-4000-8000-000000000001'
    );
    insert into public.learner_cumulative_notes(
      id,tenant_id,school_id,learner_id,enrolment_id,note_date,note_type,note,sensitivity,recorded_by_user_id
    ) values(
      'f9710000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001','2026-05-04','general_remark','Valid note','routine','f9700000-0000-4000-8000-000000000001'
    )$$,
  'cumulative record entries remain valid inside enrolment period'
);

select throws_ok(
  $$update public.learner_cumulative_notes
       set note_date='2026-07-01'
     where id='f9710000-0000-4000-8000-000000000001'$$,
  'Learner event date must fall within referenced enrolment period',
  'later correction cannot move cumulative note outside referenced enrolment period'
);

select lives_ok(
  $$insert into public.learner_development_observations(
      tenant_id,school_id,learner_id,academic_year,domain,observation,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',
      2026,'overall_impression','Valid undated year observation','f9700000-0000-4000-8000-000000000001'
    )$$,
  'undated development observation remains valid when learner has an enrolment in recorded year'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_development_observation_year_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_development_observation_year_integrity()','EXECUTE'),
  'development observation year helper remains private from client roles'
);

select * from finish();
rollback;
