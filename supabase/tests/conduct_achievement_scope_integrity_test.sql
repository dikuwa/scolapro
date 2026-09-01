begin;

select plan(14);

select has_function(
  'app_private','enforce_learner_observation_provenance',array[]::text[],
  'learner observation provenance helper exists'
);

select trigger_is(
  'public','conduct_events','zz_conduct_event_provenance_guard','app_private','enforce_learner_observation_provenance',
  'conduct event provenance trigger installed'
);
select trigger_is(
  'public','achievement_events','zz_achievement_event_provenance_guard','app_private','enforce_learner_observation_provenance',
  'achievement event provenance trigger installed'
);

select ok(
  not has_function_privilege('anon','app_private.enforce_learner_observation_provenance()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_learner_observation_provenance()','EXECUTE'),
  'learner observation provenance helper is private from client roles'
);

select trigger_is(
  'public','conduct_events','conduct_events_learner_scope_guard','app_private','enforce_learner_enrolment_record_scope',
  'existing conduct learner-enrolment scope guard remains authoritative'
);
select trigger_is(
  'public','achievement_events','achievement_events_learner_scope_guard','app_private','enforce_learner_enrolment_record_scope',
  'existing achievement learner-enrolment scope guard remains authoritative'
);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fa000000-0000-4000-8000-000000000001','observation-provenance-recorder@example.test','authenticated','authenticated',now(),now()),
  ('fa000000-0000-4000-8000-000000000002','observation-provenance-other@example.test','authenticated','authenticated',now(),now());

select lives_ok(
  $$insert into public.conduct_events(
      id,tenant_id,school_id,learner_id,enrolment_id,occurred_on,direction,category_code,summary,recorded_by_user_id
    ) values(
      'fa200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','2026-09-01','positive','provenance-test',
      'Valid conduct event','fa000000-0000-4000-8000-000000000001'
    )$$,
  'valid conduct event remains allowed'
);

select throws_ok(
  $$update public.conduct_events
       set learner_id='50000000-0000-4000-8000-000000000002',
           enrolment_id='60000000-0000-4000-8000-000000000002'
     where id='fa200000-0000-4000-8000-000000000001'$$,
  'Learner observation scope and provenance are immutable',
  'conduct history cannot be reassigned wholesale to another valid learner and enrolment'
);

select throws_ok(
  $$update public.conduct_events
       set recorded_by_user_id='fa000000-0000-4000-8000-000000000002'
     where id='fa200000-0000-4000-8000-000000000001'$$,
  'Learner observation scope and provenance are immutable',
  'conduct recorder provenance cannot be reassigned'
);

select lives_ok(
  $$update public.conduct_events
       set status='resolved', details='Resolved after review'
     where id='fa200000-0000-4000-8000-000000000001'$$,
  'normal conduct lifecycle and content updates remain allowed'
);

select lives_ok(
  $$insert into public.achievement_events(
      id,tenant_id,school_id,learner_id,enrolment_id,achieved_on,category_code,title,recorded_by_user_id
    ) values(
      'fa300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','2026-09-01','provenance-test',
      'Valid achievement','fa000000-0000-4000-8000-000000000001'
    )$$,
  'valid achievement event remains allowed'
);

select throws_ok(
  $$update public.achievement_events
       set learner_id='50000000-0000-4000-8000-000000000002',
           enrolment_id='60000000-0000-4000-8000-000000000002'
     where id='fa300000-0000-4000-8000-000000000001'$$,
  'Learner observation scope and provenance are immutable',
  'achievement history cannot be reassigned wholesale to another valid learner and enrolment'
);

select throws_ok(
  $$update public.achievement_events
       set recorded_by_user_id='fa000000-0000-4000-8000-000000000002'
     where id='fa300000-0000-4000-8000-000000000001'$$,
  'Learner observation scope and provenance are immutable',
  'achievement recorder provenance cannot be reassigned'
);

select lives_ok(
  $$update public.achievement_events
       set description='Updated achievement description after review'
     where id='fa300000-0000-4000-8000-000000000001'$$,
  'normal achievement content updates remain allowed'
);

select * from finish();
rollback;
