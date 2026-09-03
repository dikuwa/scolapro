begin;

select plan(8);

select ok(
  to_regprocedure('public.get_parent_message_overview(integer)') is not null,
  'parent message overview function exists'
);

select ok(
  not has_function_privilege('anon','public.get_parent_message_overview(integer)','EXECUTE'),
  'anonymous users cannot read parent message overview'
);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fd000000-0000-4000-8000-000000000001','parent-message@example.test','authenticated','authenticated',now(),now()),
  ('fd000000-0000-4000-8000-000000000002','other-parent-message@example.test','authenticated','authenticated',now(),now()),
  ('fd000000-0000-4000-8000-000000000003','message-author@example.test','authenticated','authenticated',now(),now());

-- Parent-facing communication rows represent actual school-linked guardian accounts.
-- Keep the fixture faithful to that domain relationship rather than creating arbitrary
-- auth users that happen to be labelled as parents.
insert into public.learners(id,tenant_id,first_names,surname,date_of_birth,sex)
values
  ('fd010000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Parent Message','Learner One','2010-01-01','unspecified'),
  ('fd010000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Parent Message','Learner Two','2010-01-02','unspecified');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values
  ('fd020000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd010000-0000-4000-8000-000000000001',2026,current_date,'current'),
  ('fd020000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd010000-0000-4000-8000-000000000002',2026,current_date,'current');

insert into public.guardian_profiles(id,tenant_id,first_names,surname,status)
values
  ('fd030000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Parent','Message One','active'),
  ('fd030000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Parent','Message Two','active');

insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id,linked_by_user_id)
values
  ('fd040000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd030000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000003'),
  ('fd040000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fd030000-0000-4000-8000-000000000002','fd000000-0000-4000-8000-000000000002','fd000000-0000-4000-8000-000000000003');

insert into public.learner_guardians(
  id,tenant_id,learner_id,guardian_id,relationship_type,is_legal_guardian,is_emergency_contact,is_pickup_authorized,priority,effective_from
)
values
  ('fd050000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd010000-0000-4000-8000-000000000001','fd030000-0000-4000-8000-000000000001','parent',true,true,true,1,current_date),
  ('fd050000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fd010000-0000-4000-8000-000000000002','fd030000-0000-4000-8000-000000000002','parent',true,true,true,1,current_date);

insert into public.communication_messages(
  id,tenant_id,school_id,channel,subject,body,audience_type,status,sensitive,created_by_user_id,sent_at
)
values
  ('fd100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','app','Linked parent notice','Message for the signed-in parent only','individual','sent',false,'fd000000-0000-4000-8000-000000000003',now()-interval '3 minutes'),
  ('fd100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','app','Other parent notice','Message for another account','individual','sent',false,'fd000000-0000-4000-8000-000000000003',now()-interval '2 minutes'),
  ('fd100000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','app','Pending parent notice','Not yet delivered','individual','sent',false,'fd000000-0000-4000-8000-000000000003',now()-interval '1 minute');

insert into public.communication_recipients(
  id,tenant_id,school_id,message_id,user_id,destination,delivery_status,delivered_at
)
values
  ('fd200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd100000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','parent-message@example.test','delivered',now()-interval '2 minutes'),
  ('fd200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd100000-0000-4000-8000-000000000002','fd000000-0000-4000-8000-000000000002','other-parent-message@example.test','delivered',now()-interval '1 minute'),
  ('fd200000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd100000-0000-4000-8000-000000000003','fd000000-0000-4000-8000-000000000001','parent-message@example.test','pending',null);

select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select is(
  (select count(*)::bigint from public.get_parent_message_overview(50)),
  1::bigint,
  'parent message overview returns only delivered messages addressed directly to the signed-in account'
);

select is(
  (select subject from public.get_parent_message_overview(50) limit 1),
  'Linked parent notice',
  'parent message overview returns the signed-in parent message content'
);

select is(
  (select count(*)::bigint from public.get_parent_message_overview(50) where message_id='fd100000-0000-4000-8000-000000000002'),
  0::bigint,
  'message delivered to another parent account is never exposed'
);

select is(
  (select count(*)::bigint from public.get_parent_message_overview(50) where message_id='fd100000-0000-4000-8000-000000000003'),
  0::bigint,
  'pending delivery to the signed-in account is not presented as a delivered parent message'
);

select results_eq(
  $$select id from public.communication_messages where id='fd100000-0000-4000-8000-000000000001'$$,
  ARRAY[]::uuid[],
  'parent account cannot browse the canonical communication message ledger directly'
);

select results_eq(
  $$select id from public.communication_recipients where id='fd200000-0000-4000-8000-000000000001'$$,
  ARRAY[]::uuid[],
  'parent account cannot browse canonical recipient rows or destinations directly'
);

reset role;
select * from finish();
rollback;
