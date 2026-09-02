begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fa6d0000-0000-4000-8000-000000000001','subject-history-admin@example.test','authenticated','authenticated',now(),now());
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa6d0000-0000-4000-8000-000000000001','school_admin','2026-01-01');

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status) values
  ('fa6d1000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','HIST-A','Historical Readiness Subject','active');
insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status) values
  ('fa6d2000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fa6d1000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active');

insert into public.learner_subject_registrations(
  id,tenant_id,school_id,academic_year,enrolment_id,learner_id,subject_offering_id,status,source,
  registered_by_user_id,registered_at,created_at,updated_at
) values(
  'fa6d3000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
  '60000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','fa6d2000-0000-4000-8000-000000000001','active','reconciliation',
  'fa6d0000-0000-4000-8000-000000000001','2026-04-01 09:00:00+00','2026-02-01 09:00:00+00','2026-04-01 09:00:00+00'
);

insert into public.audit_events(
  id,tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata,occurred_at
) values
  ('fa6d4000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa6d0000-0000-4000-8000-000000000001','learner_subject_registration.registered','learner_subject_registration','fa6d3000-0000-4000-8000-000000000001','{}'::jsonb,'2026-02-01 09:00:00+00'),
  ('fa6d4000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa6d0000-0000-4000-8000-000000000001','learner_subject_registration.withdrawn','learner_subject_registration','fa6d3000-0000-4000-8000-000000000001','{}'::jsonb,'2026-03-01 09:00:00+00'),
  ('fa6d4000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa6d0000-0000-4000-8000-000000000001','learner_subject_registration.reactivated','learner_subject_registration','fa6d3000-0000-4000-8000-000000000001','{}'::jsonb,'2026-04-01 09:00:00+00');

select ok(
  to_regprocedure('app_private.subject_registration_is_active_at(uuid,date)') is not null,
  'private historical subject-registration lifecycle helper exists'
);
select ok(
  not has_function_privilege('authenticated','app_private.subject_registration_is_active_at(uuid,date)','EXECUTE'),
  'authenticated clients cannot bypass readiness RPC through lifecycle helper'
);
select is(
  app_private.subject_registration_is_active_at('fa6d3000-0000-4000-8000-000000000001','2026-02-15'),
  true,
  'registration is reconstructed as active after original registration even though row registered_at was later rewritten by reactivation'
);
select is(
  app_private.subject_registration_is_active_at('fa6d3000-0000-4000-8000-000000000001','2026-03-15'),
  false,
  'registration is reconstructed as withdrawn between withdrawal and later reactivation'
);
select is(
  app_private.subject_registration_is_active_at('fa6d3000-0000-4000-8000-000000000001','2026-04-15'),
  true,
  'registration is reconstructed as active after reactivation'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa6d0000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  (public.get_subject_registration_readiness('22222222-2222-4222-8222-222222222222',2026,'2026-02-15')->>'active_registrations')::integer,
  1,
  'February readiness includes the originally active subject choice'
);
select is(
  (public.get_subject_registration_readiness('22222222-2222-4222-8222-222222222222',2026,'2026-03-15')->>'active_registrations')::integer,
  0,
  'March readiness excludes the withdrawn subject choice'
);
select is(
  (public.get_subject_registration_readiness('22222222-2222-4222-8222-222222222222',2026,'2026-04-15')->>'active_registrations')::integer,
  1,
  'April readiness includes the reactivated subject choice'
);
select is(
  public.get_subject_registration_readiness('22222222-2222-4222-8222-222222222222',2026,'2026-02-15')->>'lifecycle_basis',
  'audit_events_with_row_fallback',
  'readiness source discloses its historical lifecycle basis'
);
select is(
  (select (item->>'registered_learners')::integer
   from jsonb_array_elements(public.get_subject_registration_readiness('22222222-2222-4222-8222-222222222222',2026,'2026-03-15')->'offerings') item
   where item->>'subject_code'='HIST-A'),
  0,
  'offering totals follow reconstructed historical lifecycle and do not treat the future reactivation as active in March'
);

reset role;
select * from finish();
rollback;
