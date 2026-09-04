begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('e1900000-0000-4000-8000-000000000001','observation-class-teacher@example.test','authenticated','authenticated',now(),now()),
  ('e1900000-0000-4000-8000-000000000002','observation-unrelated@example.test','authenticated','authenticated',now(),now()),
  ('e1900000-0000-4000-8000-000000000003','observation-principal@example.test','authenticated','authenticated',now(),now());

set local session_replication_role = replica;

insert into public.staff_members(id,tenant_id,user_id,first_name,last_name,status)
values
  ('e1910000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','e1900000-0000-4000-8000-000000000001','Class','Teacher','active');

insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from,active_to)
values
  ('e1920000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e1900000-0000-4000-8000-000000000001','e1910000-0000-4000-8000-000000000001','class_teacher',current_date-10,null),
  ('e1920000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e1900000-0000-4000-8000-000000000003',null,'principal',current_date-10,null);

insert into public.register_classes(
  id,tenant_id,school_id,grade_id,academic_year,class_code,display_name,register_teacher_staff_id
) values(
  'e1930000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'e1940000-0000-4000-8000-000000000001',2026,'OBS-A','Observation A','e1910000-0000-4000-8000-000000000001'
);

insert into public.learners(id,tenant_id,first_names,surname)
values('e1950000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Observation','Learner');

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,grade_id,register_class_id,enrolled_from,status
) values(
  'e1960000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'e1950000-0000-4000-8000-000000000001',2026,'e1940000-0000-4000-8000-000000000001','e1930000-0000-4000-8000-000000000001',current_date-10,'current'
);

set local session_replication_role = origin;

select throws_ok(
  $$insert into public.conduct_events(
      id,tenant_id,school_id,learner_id,enrolment_id,occurred_on,direction,category_code,summary,recorded_by_user_id
    ) values(
      'e1970000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'e1950000-0000-4000-8000-000000000001','e1960000-0000-4000-8000-000000000001',current_date,'negative','behavior','Forged recorder','e1900000-0000-4000-8000-000000000002'
    )$$,
  'Learner observation recorder mismatch: user is not authorized for learner',
  'unrelated user cannot be forged as conduct recorder'
);

select throws_ok(
  $$insert into public.achievement_events(
      id,tenant_id,school_id,learner_id,enrolment_id,achieved_on,category_code,title,recorded_by_user_id
    ) values(
      'e1980000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'e1950000-0000-4000-8000-000000000001','e1960000-0000-4000-8000-000000000001',current_date,'academic','Forged achievement','e1900000-0000-4000-8000-000000000002'
    )$$,
  'Learner observation recorder mismatch: user is not authorized for learner',
  'unrelated user cannot be forged as achievement recorder'
);

select lives_ok(
  $$insert into public.conduct_events(
      id,tenant_id,school_id,learner_id,enrolment_id,occurred_on,direction,category_code,summary,recorded_by_user_id
    ) values(
      'e1970000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'e1950000-0000-4000-8000-000000000001','e1960000-0000-4000-8000-000000000001',current_date,'positive','behavior','Class teacher conduct','e1900000-0000-4000-8000-000000000001'
    )$$,
  'current register class teacher can record conduct'
);

select lives_ok(
  $$insert into public.achievement_events(
      id,tenant_id,school_id,learner_id,enrolment_id,achieved_on,category_code,title,recorded_by_user_id
    ) values(
      'e1980000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'e1950000-0000-4000-8000-000000000001','e1960000-0000-4000-8000-000000000001',current_date,'academic','Class teacher achievement','e1900000-0000-4000-8000-000000000001'
    )$$,
  'current register class teacher can record achievement'
);

select lives_ok(
  $$insert into public.conduct_events(
      id,tenant_id,school_id,learner_id,enrolment_id,occurred_on,direction,category_code,summary,recorded_by_user_id
    ) values(
      'e1970000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'e1950000-0000-4000-8000-000000000001','e1960000-0000-4000-8000-000000000001',current_date,'negative','behavior','Principal conduct','e1900000-0000-4000-8000-000000000003'
    )$$,
  'current principal can record conduct'
);

select is(
  (select count(*)::integer from public.conduct_events where id='e1970000-0000-4000-8000-000000000001'),
  0,
  'rejected conduct forgery leaves no row'
);

select is(
  (select count(*)::integer from public.achievement_events where id='e1980000-0000-4000-8000-000000000001'),
  0,
  'rejected achievement forgery leaves no row'
);

select ok(
  not has_function_privilege('authenticated','app_private.user_can_access_learner_observations(uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_can_access_learner_observations(uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_learner_observation_recorder_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_learner_observation_recorder_integrity()','EXECUTE'),
  'learner observation arbitrary-actor helpers remain private'
);

select is(
  (select count(*)::integer from pg_trigger where tgrelid='public.conduct_events'::regclass and tgname='conduct_event_recorder_integrity_trg' and not tgisinternal),
  1,
  'conduct recorder integrity trigger is installed exactly once'
);

select is(
  (select count(*)::integer from pg_trigger where tgrelid='public.achievement_events'::regclass and tgname='achievement_event_recorder_integrity_trg' and not tgisinternal),
  1,
  'achievement recorder integrity trigger is installed exactly once'
);

select * from finish();
rollback;
