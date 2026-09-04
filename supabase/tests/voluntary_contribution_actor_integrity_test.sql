begin;

select plan(17);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fd500000-0000-4000-8000-000000000001','contribution-actor-leader@example.test','authenticated','authenticated',now(),now()),
  ('fd500000-0000-4000-8000-000000000002','contribution-actor-class@example.test','authenticated','authenticated',now(),now()),
  ('fd500000-0000-4000-8000-000000000003','contribution-actor-outsider@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values(
  'fd510000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd500000-0000-4000-8000-000000000002','CONTRIB-ACTOR-001','Actor','Teacher','active'
);

update public.register_classes
set register_teacher_staff_id='fd510000-0000-4000-8000-000000000001'
where id='40000000-0000-4000-8000-00000000001a';

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd500000-0000-4000-8000-000000000001',null,'school_admin',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd500000-0000-4000-8000-000000000002','fd510000-0000-4000-8000-000000000001','class_teacher',current_date);

insert into public.learners(id,tenant_id,first_names,surname,date_of_birth,sex)
values('fd550000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Contribution','Actor Learner','2010-01-01','unspecified');

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,grade_id,register_class_id,enrolled_from,status
)
values(
  'fd560000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fd550000-0000-4000-8000-000000000001',
  2026,
  (select grade_id from public.register_classes where id='40000000-0000-4000-8000-00000000001a'),
  '40000000-0000-4000-8000-00000000001a',
  current_date-30,
  'current'
);

select throws_ok(
  $$insert into public.voluntary_contribution_campaigns(tenant_id,school_id,academic_year,title,starts_on,status,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'Forged campaign',current_date,'draft','fd500000-0000-4000-8000-000000000003')$$,
  'Voluntary contribution campaign creator is not authorized for school',
  'trusted write cannot forge an unrelated contribution campaign creator'
);

select lives_ok(
  $$insert into public.voluntary_contribution_campaigns(id,tenant_id,school_id,academic_year,title,starts_on,ends_on,status,created_by_user_id)
    values('fd520000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'Actor campaign',current_date-1,current_date+7,'published','fd500000-0000-4000-8000-000000000001')$$,
  'current school leader remains a valid campaign creator'
);

insert into public.voluntary_contribution_items(id,tenant_id,school_id,campaign_id,item_type,label,suggested_amount)
values('fd530000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd520000-0000-4000-8000-000000000001','money','Actor item',100);

select throws_ok(
  $$insert into public.learner_voluntary_contributions(tenant_id,school_id,learner_id,enrolment_id,campaign_id,item_id,contribution_date,amount,status,recorded_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd550000-0000-4000-8000-000000000001','fd560000-0000-4000-8000-000000000001','fd520000-0000-4000-8000-000000000001','fd530000-0000-4000-8000-000000000001',current_date,25,'recorded','fd500000-0000-4000-8000-000000000003')$$,
  'Voluntary contribution recorder is not authorized for learner',
  'trusted write cannot forge an unrelated contribution recorder'
);

select throws_ok(
  $$insert into public.learner_voluntary_contributions(tenant_id,school_id,learner_id,enrolment_id,campaign_id,item_id,contribution_date,amount,status,recorded_by_user_id,verified_by_user_id,verified_at)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd550000-0000-4000-8000-000000000001','fd560000-0000-4000-8000-000000000001','fd520000-0000-4000-8000-000000000001','fd530000-0000-4000-8000-000000000001',current_date,25,'verified','fd500000-0000-4000-8000-000000000001','fd500000-0000-4000-8000-000000000001',now())$$,
  'Voluntary contributions must be created in recorded state without review provenance',
  'trusted write cannot manufacture a pre-verified contribution'
);

select lives_ok(
  $$insert into public.learner_voluntary_contributions(id,tenant_id,school_id,learner_id,enrolment_id,campaign_id,item_id,contribution_date,amount,status,recorded_by_user_id)
    values('fd540000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd550000-0000-4000-8000-000000000001','fd560000-0000-4000-8000-000000000001','fd520000-0000-4000-8000-000000000001','fd530000-0000-4000-8000-000000000001',current_date,25,'recorded','fd500000-0000-4000-8000-000000000002')$$,
  'assigned register teacher remains a valid recorder for their learner'
);

select throws_ok(
  $$update public.learner_voluntary_contributions set recorded_by_user_id='fd500000-0000-4000-8000-000000000001' where id='fd540000-0000-4000-8000-000000000001'$$,
  'Learner voluntary contribution identity and provenance are immutable',
  'existing scope guard keeps recorder provenance immutable'
);

select throws_ok(
  $$update public.learner_voluntary_contributions set status='verified',verified_by_user_id='fd500000-0000-4000-8000-000000000002',verified_at=now() where id='fd540000-0000-4000-8000-000000000001'$$,
  'Voluntary contribution verifier is not authorized for school',
  'class teacher cannot forge leadership verification provenance'
);

select throws_ok(
  $$update public.learner_voluntary_contributions set status='verified',verified_by_user_id='fd500000-0000-4000-8000-000000000003',verified_at=now() where id='fd540000-0000-4000-8000-000000000001'$$,
  'Voluntary contribution verifier is not authorized for school',
  'unrelated account cannot verify a contribution'
);

select lives_ok(
  $$update public.learner_voluntary_contributions set status='verified',verified_by_user_id='fd500000-0000-4000-8000-000000000001',verified_at=now() where id='fd540000-0000-4000-8000-000000000001'$$,
  'school leader remains an authorized contribution verifier'
);

select throws_ok(
  $$update public.learner_voluntary_contributions set verified_by_user_id='fd500000-0000-4000-8000-000000000003' where id='fd540000-0000-4000-8000-000000000001'$$,
  'Voluntary contribution verification provenance is immutable',
  'verification actor cannot be rewritten after verification'
);

select throws_ok(
  $$update public.learner_voluntary_contributions set status='reversed',reversed_by_user_id='fd500000-0000-4000-8000-000000000003',reversed_at=now(),reversal_note='Forged reversal' where id='fd540000-0000-4000-8000-000000000001'$$,
  'Voluntary contribution reverser is not authorized for school',
  'unrelated account cannot forge reversal provenance'
);

select throws_ok(
  $$update public.learner_voluntary_contributions set status='reversed',reversed_by_user_id='fd500000-0000-4000-8000-000000000001',reversed_at=now(),reversal_note='   ' where id='fd540000-0000-4000-8000-000000000001'$$,
  'Reversed voluntary contribution requires reversal provenance',
  'trusted reversal still requires a meaningful correction reason'
);

select lives_ok(
  $$update public.learner_voluntary_contributions set status='reversed',reversed_by_user_id='fd500000-0000-4000-8000-000000000001',reversed_at=now(),reversal_note='Duplicate record' where id='fd540000-0000-4000-8000-000000000001'$$,
  'school leader can reverse a contribution with durable provenance'
);

select throws_ok(
  $$update public.learner_voluntary_contributions set reversal_note='Changed reason' where id='fd540000-0000-4000-8000-000000000001'$$,
  'Voluntary contribution reversal provenance is immutable',
  'reversal reason cannot be rewritten after reversal'
);

select ok(
  (select status='reversed'
          and recorded_by_user_id='fd500000-0000-4000-8000-000000000002'
          and verified_by_user_id='fd500000-0000-4000-8000-000000000001'
          and reversed_by_user_id='fd500000-0000-4000-8000-000000000001'
          and reversal_note='Duplicate record'
   from public.learner_voluntary_contributions
   where id='fd540000-0000-4000-8000-000000000001'),
  'authorized lifecycle preserves recorder, verifier and reverser provenance'
);

select ok(
  not has_function_privilege('authenticated','app_private.user_can_govern_voluntary_contributions(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_can_govern_voluntary_contributions(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.user_can_record_voluntary_contribution(uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_can_record_voluntary_contribution(uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_voluntary_contribution_campaign_actor_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_learner_voluntary_contribution_actor_integrity()','EXECUTE'),
  'voluntary contribution arbitrary-user and trigger helpers remain private'
);

select is(
  (select count(*)::integer from pg_catalog.pg_trigger
   where tgname in ('voluntary_contribution_campaign_actor_integrity_trg','learner_voluntary_contribution_actor_integrity_trg')
     and not tgisinternal),
  2,
  'voluntary contribution actor integrity triggers are each installed once'
);

select * from finish();
rollback;
