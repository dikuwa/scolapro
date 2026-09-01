begin;

select plan(14);

select has_function('app_private','enforce_conduct_event_scope_integrity',array[]::text[],'conduct event scope helper exists');
select has_function('app_private','enforce_achievement_event_scope_integrity',array[]::text[],'achievement event scope helper exists');

select trigger_is('public','conduct_events','conduct_event_scope_integrity_trg','app_private','enforce_conduct_event_scope_integrity','conduct event integrity trigger installed');
select trigger_is('public','achievement_events','achievement_event_scope_integrity_trg','app_private','enforce_achievement_event_scope_integrity','achievement event integrity trigger installed');

select ok(
  not has_function_privilege('anon','app_private.enforce_conduct_event_scope_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_conduct_event_scope_integrity()','EXECUTE'),
  'conduct event helper is private from client roles'
);
select ok(
  not has_function_privilege('anon','app_private.enforce_achievement_event_scope_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_achievement_event_scope_integrity()','EXECUTE'),
  'achievement event helper is private from client roles'
);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fa000000-0000-4000-8000-000000000001','conduct-scope-recorder@example.test','authenticated','authenticated',now(),now()),
  ('fa000000-0000-4000-8000-000000000002','conduct-scope-other@example.test','authenticated','authenticated',now(),now());

insert into public.learners(id,tenant_id,first_names,surname,date_of_birth,sex)
values('fa100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','No School','Enrolment','2011-03-12','unspecified');

select throws_ok(
  $$insert into public.conduct_events(
      tenant_id,school_id,learner_id,occurred_on,direction,category_code,summary,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa100000-0000-4000-8000-000000000001',
      '2026-09-01','negative','scope-test','Orphan learner conduct event','fa000000-0000-4000-8000-000000000001'
    )$$,
  'Conduct event scope mismatch: learner has no enrolment at school',
  'conduct event requires the learner to belong to the school'
);

select throws_ok(
  $$insert into public.conduct_events(
      tenant_id,school_id,learner_id,enrolment_id,occurred_on,direction,category_code,summary,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000002',
      '60000000-0000-4000-8000-000000000001','2026-09-01','negative','scope-test','Mismatched enrolment conduct event','fa000000-0000-4000-8000-000000000001'
    )$$,
  'Conduct event scope mismatch: enrolment does not belong to learner and school',
  'conduct event enrolment must belong to the selected learner'
);

select lives_ok(
  $$insert into public.conduct_events(
      id,tenant_id,school_id,learner_id,enrolment_id,occurred_on,direction,category_code,summary,recorded_by_user_id
    ) values(
      'fa200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001','2026-09-01','positive','scope-test','Valid conduct event','fa000000-0000-4000-8000-000000000001'
    )$$,
  'valid conduct event remains allowed'
);

select throws_ok(
  $$update public.conduct_events
       set recorded_by_user_id='fa000000-0000-4000-8000-000000000002'
     where id='fa200000-0000-4000-8000-000000000001'$$,
  'Conduct event scope and provenance are immutable',
  'conduct event recorder provenance cannot be reassigned'
);

select throws_ok(
  $$insert into public.achievement_events(
      tenant_id,school_id,learner_id,achieved_on,category_code,title,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa100000-0000-4000-8000-000000000001',
      '2026-09-01','scope-test','Orphan learner achievement','fa000000-0000-4000-8000-000000000001'
    )$$,
  'Achievement event scope mismatch: learner has no enrolment at school',
  'achievement event requires the learner to belong to the school'
);

select throws_ok(
  $$insert into public.achievement_events(
      tenant_id,school_id,learner_id,enrolment_id,achieved_on,category_code,title,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000002',
      '60000000-0000-4000-8000-000000000001','2026-09-01','scope-test','Mismatched enrolment achievement','fa000000-0000-4000-8000-000000000001'
    )$$,
  'Achievement event scope mismatch: enrolment does not belong to learner and school',
  'achievement event enrolment must belong to the selected learner'
);

select lives_ok(
  $$insert into public.achievement_events(
      id,tenant_id,school_id,learner_id,enrolment_id,achieved_on,category_code,title,recorded_by_user_id
    ) values(
      'fa300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001','2026-09-01','scope-test','Valid achievement','fa000000-0000-4000-8000-000000000001'
    )$$,
  'valid achievement event remains allowed'
);

select throws_ok(
  $$update public.achievement_events
       set recorded_by_user_id='fa000000-0000-4000-8000-000000000002'
     where id='fa300000-0000-4000-8000-000000000001'$$,
  'Achievement event scope and provenance are immutable',
  'achievement event recorder provenance cannot be reassigned'
);

select * from finish();
rollback;
