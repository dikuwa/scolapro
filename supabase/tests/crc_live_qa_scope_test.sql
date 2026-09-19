begin;

select plan(16);

insert into public.tenants(id,name,slug) values
  ('51010000-0000-4000-8000-000000000001','CRC QA Other Tenant','crc-qa-other');

insert into public.schools(id,tenant_id,name,emis_number,status) values
  ('51020000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','CRC QA Receiving School','CRC-QA-REC','active'),
  ('51020000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','CRC QA Later School','CRC-QA-LATER','active'),
  ('51020000-0000-4000-8000-000000000003','51010000-0000-4000-8000-000000000001','CRC QA Cross Tenant School','CRC-QA-XTEN','active');

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('51030000-0000-4000-8000-000000000001','crc-qa-origin@example.test','authenticated','authenticated',now(),now()),
  ('51030000-0000-4000-8000-000000000002','crc-qa-receiver@example.test','authenticated','authenticated',now(),now()),
  ('51030000-0000-4000-8000-000000000003','crc-qa-cross-receiver@example.test','authenticated','authenticated',now(),now()),
  ('51030000-0000-4000-8000-000000000004','crc-qa-stale@example.test','authenticated','authenticated',now(),now()),
  ('51030000-0000-4000-8000-000000000005','crc-qa-support@example.test','authenticated','authenticated',now(),now()),
  ('51030000-0000-4000-8000-000000000006','crc-qa-hod@example.test','authenticated','authenticated',now(),now()),
  ('51030000-0000-4000-8000-000000000007','crc-qa-multi@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('51040000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','51030000-0000-4000-8000-000000000004','CRC-QA-STALE','Stale','Custodian','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values(
  '51050000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '51040000-0000-4000-8000-000000000001',
  'support',
  current_date-60,
  current_date-1,
  '51030000-0000-4000-8000-000000000001'
);

insert into public.school_memberships(
  tenant_id,school_id,user_id,staff_member_id,role_key,active_from
) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','51030000-0000-4000-8000-000000000001',null,'social_worker',current_date-30),
  ('11111111-1111-4111-8111-111111111111','51020000-0000-4000-8000-000000000001','51030000-0000-4000-8000-000000000002',null,'social_worker',current_date-30),
  ('51010000-0000-4000-8000-000000000001','51020000-0000-4000-8000-000000000003','51030000-0000-4000-8000-000000000003',null,'social_worker',current_date-30),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','51030000-0000-4000-8000-000000000004','51040000-0000-4000-8000-000000000001','social_worker',current_date-60),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','51030000-0000-4000-8000-000000000005',null,'social_worker',current_date-30),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','51030000-0000-4000-8000-000000000006',null,'hod',current_date-30),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','51030000-0000-4000-8000-000000000007',null,'social_worker',current_date-60),
  ('11111111-1111-4111-8111-111111111111','51020000-0000-4000-8000-000000000002','51030000-0000-4000-8000-000000000007',null,'teacher',current_date-1);

insert into public.platform_memberships(user_id,role_key,active_from)
values('51030000-0000-4000-8000-000000000005','platform_support',current_date-30);

select set_config('request.jwt.claim.role','authenticated',true);

select ok(
  app_private.is_support_role_member(
    '51030000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222'
  ),
  'current-school support role is eligible for CRC custody'
);

select ok(
  not app_private.is_support_role_member(
    '51030000-0000-4000-8000-000000000004',
    '22222222-2222-4222-8222-222222222222'
  ),
  'ended authoritative staff placement removes CRC custody authority'
);

select ok(
  not app_private.is_support_role_member(
    '51030000-0000-4000-8000-000000000005',
    '22222222-2222-4222-8222-222222222222'
  ),
  'Platform Support remains outside CRC custody even with a school support membership'
);

select ok(
  not app_private.is_support_role_member(
    '51030000-0000-4000-8000-000000000007',
    '22222222-2222-4222-8222-222222222222'
  ),
  'older support membership does not retain authority after deterministic current school changes'
);

select set_config('request.jwt.claim.sub','51030000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  (select count(*)::integer
   from public.list_crc_custody_destination_schools()
   where school_id='51020000-0000-4000-8000-000000000001'),
  1,
  'same-tenant active school is offered as a custody destination'
);

select is(
  (select count(*)::integer
   from public.list_crc_custody_destination_schools()
   where school_id='51020000-0000-4000-8000-000000000003'),
  0,
  'cross-tenant school is not exposed as a custody destination'
);

select throws_ok(
  $$select * from public.search_crc_custody_receivers('51020000-0000-4000-8000-000000000003')$$,
  'Receiving school is outside the authorized tenant scope',
  'cross-tenant receiving-custodian enumeration is denied'
);

select throws_ok(
  $$select * from public.prepare_crc_custody(
    '50000000-0000-4000-8000-000000000001',
    '51020000-0000-4000-8000-000000000003',
    '51030000-0000-4000-8000-000000000003',
    'cross tenant attempt'
  )$$,
  'Receiving school not found in learner tenant or inactive',
  'CRC custody cannot be prepared across tenant boundaries'
);

create temp table crc_qa_flow as
select * from public.prepare_crc_custody(
  '50000000-0000-4000-8000-000000000001',
  '51020000-0000-4000-8000-000000000001',
  '51030000-0000-4000-8000-000000000002',
  'same tenant QA custody'
);

select is(
  (select count(*)::integer from crc_qa_flow),
  1,
  'same-tenant current custodians can prepare CRC custody'
);

select is(
  (select tenant_id from public.crc_custody_records where id=(select custody_id from crc_qa_flow)),
  '11111111-1111-4111-8111-111111111111'::uuid,
  'prepared custody preserves the learner tenant'
);

reset role;

select throws_ok(
  $$insert into public.crc_custody_records(
    tenant_id,school_id,learner_id,enrolment_id,custody_status,
    prepared_by_user_id,receiving_school_id,receiving_user_id
  ) values(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '50000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    'prepared',
    '51030000-0000-4000-8000-000000000001',
    '51020000-0000-4000-8000-000000000003',
    '51030000-0000-4000-8000-000000000003'
  )$$,
  'CRC custody scope mismatch',
  'physical custody guard blocks cross-tenant trusted-path inserts'
);

select throws_ok(
  $$update public.crc_custody_records
     set receiving_school_id='51020000-0000-4000-8000-000000000003'
   where id=(select custody_id from crc_qa_flow)$$,
  'CRC custody provenance is immutable',
  'historical custody destination cannot be rewritten after preparation'
);

select set_config('request.jwt.claim.sub','51030000-0000-4000-8000-000000000006',true);
set local role authenticated;

select is(
  (select count(*)::integer from public.get_my_crc_custody_records()),
  0,
  'HOD school access does not broaden into confidential CRC custody records'
);

reset role;
select set_config('request.jwt.claim.sub','51030000-0000-4000-8000-000000000005',true);
set local role authenticated;

select is(
  (select count(*)::integer from public.get_my_crc_custody_records()),
  0,
  'Platform Support mixed membership does not expose confidential CRC custody records'
);

reset role;
select set_config('request.jwt.claim.sub','51030000-0000-4000-8000-000000000004',true);
set local role authenticated;

select is(
  (select count(*)::integer from public.get_my_crc_custody_records()),
  0,
  'stale staff placement does not retain confidential CRC custody visibility'
);

reset role;

select ok(
  not has_function_privilege('authenticated','app_private.enforce_crc_custody_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_crc_custody_scope_integrity()','EXECUTE'),
  'CRC custody scope-integrity helper remains private from clients'
);

select * from finish();
rollback;
