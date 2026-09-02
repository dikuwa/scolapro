begin;

select plan(25);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fa5b0000-0000-4000-8000-000000000001','subject-registration-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa5b0000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status) values
  ('fa5b1000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','SUBREG-10A','Subject Registration Grade 10','active'),
  ('fa5b1000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','SUBREG-11A','Subject Registration Grade 11','active'),
  ('fa5b1000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','SUBREG-10X','Inactive Subject Registration','active');

insert into public.subject_offerings(
  id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status
) values
  ('fa5b2000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fa5b1000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active'),
  ('fa5b2000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fa5b1000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000011',5,'active'),
  ('fa5b2000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fa5b1000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000010',5,'inactive');

select has_table('public','learner_subject_registrations','learner subject registration table exists');
select ok(
  (select relrowsecurity from pg_class where oid='public.learner_subject_registrations'::regclass),
  'learner subject registrations use RLS'
);
select ok(
  not has_table_privilege('anon','public.learner_subject_registrations','SELECT'),
  'anonymous users cannot read learner subject registrations'
);
select ok(
  has_table_privilege('authenticated','public.learner_subject_registrations','SELECT'),
  'authenticated users receive only the RLS-scoped read privilege'
);
select ok(
  not has_table_privilege('authenticated','public.learner_subject_registrations','INSERT'),
  'authenticated clients cannot insert registrations directly'
);
select ok(
  not has_table_privilege('authenticated','public.learner_subject_registrations','UPDATE'),
  'authenticated clients cannot update registrations directly'
);
select ok(
  not has_table_privilege('authenticated','public.learner_subject_registrations','DELETE'),
  'authenticated clients cannot delete registrations directly'
);
select ok(
  not has_function_privilege('anon','public.register_learner_subject(uuid,uuid,text)','EXECUTE'),
  'anonymous users cannot call subject registration mutation'
);
select ok(
  not has_function_privilege('anon','public.withdraw_learner_subject_registration(uuid,text)','EXECUTE'),
  'anonymous users cannot call subject withdrawal mutation'
);
select ok(
  not has_function_privilege('authenticated','app_private.can_manage_learner_subject_registrations(uuid)','EXECUTE'),
  'academic authorization helper remains private'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa5b0000-0000-4000-8000-000000000001',true);
set local role authenticated;

create temporary table subject_registration_result on commit drop as
select public.register_learner_subject(
  '60000000-0000-4000-8000-000000000001',
  'fa5b2000-0000-4000-8000-000000000001',
  'qa'
) as registration_id;

select ok(
  (select registration_id is not null from subject_registration_result),
  'school academic management can register a learner for a valid same-grade offering'
);
select is(
  (select r.status from public.learner_subject_registrations r join subject_registration_result x on x.registration_id=r.id),
  'active',
  'new subject registration is active'
);
select is(
  (select r.learner_id from public.learner_subject_registrations r join subject_registration_result x on x.registration_id=r.id),
  '50000000-0000-4000-8000-000000000001'::uuid,
  'registration derives learner identity from the enrolment'
);
select is(
  public.register_learner_subject(
    '60000000-0000-4000-8000-000000000001',
    'fa5b2000-0000-4000-8000-000000000001',
    'qa-repeat'
  ),
  (select registration_id from subject_registration_result),
  'repeating an already-active registration is idempotent'
);
select is(
  (select count(*)::integer from public.audit_events
   where entity_type='learner_subject_registration'
     and entity_id=(select registration_id from subject_registration_result)
     and event_type='learner_subject_registration.registered'),
  1,
  'idempotent active registration does not duplicate registration audit events'
);

select throws_ok(
  $$select public.register_learner_subject(
    '60000000-0000-4000-8000-000000000001',
    'fa5b2000-0000-4000-8000-000000000002',
    'qa'
  )$$,
  'Learner subject registration scope mismatch: subject offering grade does not match enrolment grade',
  'learner cannot be registered into an offering for another grade'
);
select throws_ok(
  $$select public.register_learner_subject(
    '60000000-0000-4000-8000-000000000001',
    'fa5b2000-0000-4000-8000-000000000003',
    'qa'
  )$$,
  'Learner subject registration requires an active subject offering',
  'learner cannot be newly registered into an inactive subject offering'
);

select is(
  public.withdraw_learner_subject_registration(
    (select registration_id from subject_registration_result),
    'Changed subject choice'
  ),
  true,
  'academic management can withdraw a subject choice without deleting history'
);
select is(
  (select r.status from public.learner_subject_registrations r join subject_registration_result x on x.registration_id=r.id),
  'withdrawn',
  'withdrawal changes lifecycle state'
);
select is(
  (select count(*)::integer from public.audit_events
   where entity_type='learner_subject_registration'
     and entity_id=(select registration_id from subject_registration_result)
     and event_type='learner_subject_registration.withdrawn'),
  1,
  'withdrawal is auditable'
);
select is(
  public.withdraw_learner_subject_registration(
    (select registration_id from subject_registration_result),
    'Repeated request'
  ),
  true,
  'repeated withdrawal is idempotent'
);
select is(
  public.register_learner_subject(
    '60000000-0000-4000-8000-000000000001',
    'fa5b2000-0000-4000-8000-000000000001',
    'reconciliation'
  ),
  (select registration_id from subject_registration_result),
  'withdrawn subject choice can be reactivated without creating a second identity'
);
select is(
  (select r.status from public.learner_subject_registrations r join subject_registration_result x on x.registration_id=r.id),
  'active',
  'reactivation restores active lifecycle state'
);
select is(
  (select count(*)::integer from public.audit_events
   where entity_type='learner_subject_registration'
     and entity_id=(select registration_id from subject_registration_result)
     and event_type='learner_subject_registration.reactivated'),
  1,
  'reactivation is separately auditable'
);

reset role;

select throws_ok(
  $$update public.learner_subject_registrations
    set subject_offering_id='fa5b2000-0000-4000-8000-000000000002'
    where id=(select registration_id from subject_registration_result)$$,
  'P0001',
  'Learner subject registration scope and identity are immutable',
  'registration root identity cannot be rewritten after creation'
);

select * from finish();
rollback;
