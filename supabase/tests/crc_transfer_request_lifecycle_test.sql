begin;

select plan(20);

insert into public.schools(id,tenant_id,name,emis_number,region,town,status) values
  ('fce10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','CRC Origin School','CRC689-ORG','Erongo','Origin Town','active'),
  ('fce10000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','CRC Receiving School','CRC689-REC','Erongo','Receiving Town','active');

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fce40000-0000-4000-8000-000000000001','crc689-origin-custodian@example.test','authenticated','authenticated',now(),now()),
  ('fce40000-0000-4000-8000-000000000002','crc689-receiving-custodian@example.test','authenticated','authenticated',now(),now()),
  ('fce40000-0000-4000-8000-000000000003','crc689-origin-principal@example.test','authenticated','authenticated',now(),now()),
  ('fce40000-0000-4000-8000-000000000004','crc689-circuit@example.test','authenticated','authenticated',now(),now()),
  ('fce40000-0000-4000-8000-000000000005','crc689-receiving-principal@example.test','authenticated','authenticated',now(),now()),
  ('fce40000-0000-4000-8000-000000000006','crc689-platform-support@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('fce50000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fce40000-0000-4000-8000-000000000001','CRC689-ORG','Origin','Custodian','active'),
  ('fce50000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fce40000-0000-4000-8000-000000000002','CRC689-REC','Receiving','Custodian','active'),
  ('fce50000-0000-4000-8000-000000000006','11111111-1111-4111-8111-111111111111','fce40000-0000-4000-8000-000000000006','CRC689-SUP','Platform','Support','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','fce10000-0000-4000-8000-000000000001','fce40000-0000-4000-8000-000000000001','fce50000-0000-4000-8000-000000000001','teacher',current_date-500),
  ('11111111-1111-4111-8111-111111111111','fce10000-0000-4000-8000-000000000002','fce40000-0000-4000-8000-000000000002','fce50000-0000-4000-8000-000000000002','teacher',current_date-500),
  ('11111111-1111-4111-8111-111111111111','fce10000-0000-4000-8000-000000000001','fce40000-0000-4000-8000-000000000003',null,'principal',current_date-500),
  ('11111111-1111-4111-8111-111111111111','fce10000-0000-4000-8000-000000000002','fce40000-0000-4000-8000-000000000005',null,'principal',current_date-500),
  ('11111111-1111-4111-8111-111111111111','fce10000-0000-4000-8000-000000000002','fce40000-0000-4000-8000-000000000006','fce50000-0000-4000-8000-000000000006','teacher',current_date-500);

insert into public.staff_school_assignments(
  tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id
) values
  ('11111111-1111-4111-8111-111111111111','fce10000-0000-4000-8000-000000000001','fce50000-0000-4000-8000-000000000001','teacher',current_date-500,'fce40000-0000-4000-8000-000000000003'),
  ('11111111-1111-4111-8111-111111111111','fce10000-0000-4000-8000-000000000002','fce50000-0000-4000-8000-000000000002','teacher',current_date-500,'fce40000-0000-4000-8000-000000000005'),
  ('11111111-1111-4111-8111-111111111111','fce10000-0000-4000-8000-000000000002','fce50000-0000-4000-8000-000000000006','teacher',current_date-500,'fce40000-0000-4000-8000-000000000005');

insert into public.school_duty_assignments(
  tenant_id,school_id,staff_member_id,duty_key,active_from,assigned_by_user_id
) values
  ('11111111-1111-4111-8111-111111111111','fce10000-0000-4000-8000-000000000001','fce50000-0000-4000-8000-000000000001','crc_custodian',current_date-100,'fce40000-0000-4000-8000-000000000003'),
  ('11111111-1111-4111-8111-111111111111','fce10000-0000-4000-8000-000000000002','fce50000-0000-4000-8000-000000000002','crc_custodian',current_date-100,'fce40000-0000-4000-8000-000000000005'),
  ('11111111-1111-4111-8111-111111111111','fce10000-0000-4000-8000-000000000002','fce50000-0000-4000-8000-000000000006','crc_custodian',current_date-100,'fce40000-0000-4000-8000-000000000005');

insert into public.platform_memberships(user_id,role_key,active_from)
values('fce40000-0000-4000-8000-000000000006','platform_support',current_date-30);

insert into public.learners(id,tenant_id,first_names,surname,sex) values
  ('fce20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Transfer','Learner','unspecified');

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,enrolled_to,status
) values
  ('fce30000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fce10000-0000-4000-8000-000000000001','fce20000-0000-4000-8000-000000000001',2025,'ORG-001',current_date-500,current_date-31,'transferred'),
  ('fce30000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fce10000-0000-4000-8000-000000000002','fce20000-0000-4000-8000-000000000001',2026,'REC-001',current_date-30,null,'current');

insert into public.learner_cumulative_notes(
  tenant_id,school_id,learner_id,enrolment_id,note_date,note_type,note,sensitivity,recorded_by_user_id
) values(
  '11111111-1111-4111-8111-111111111111',
  'fce10000-0000-4000-8000-000000000001',
  'fce20000-0000-4000-8000-000000000001',
  'fce30000-0000-4000-8000-000000000001',
  current_date-40,
  'general_remark',
  'Origin CRC history before transfer.',
  'routine',
  'fce40000-0000-4000-8000-000000000003'
);

insert into public.education_authorities(id,name) values
  ('fce60000-0000-4000-8000-000000000001','CRC689 Authority');
insert into public.education_regions(id,name) values
  ('fce61000-0000-4000-8000-000000000001','CRC689 Region');
insert into public.education_circuits(id,name) values
  ('fce62000-0000-4000-8000-000000000001','CRC689 Circuit');
insert into public.education_region_authority_history(region_id,authority_id,effective_from) values
  ('fce61000-0000-4000-8000-000000000001','fce60000-0000-4000-8000-000000000001',current_date-500);
insert into public.education_circuit_region_history(circuit_id,region_id,effective_from) values
  ('fce62000-0000-4000-8000-000000000001','fce61000-0000-4000-8000-000000000001',current_date-500);
insert into public.school_network_assignments(
  school_id,authority_id,region_id,circuit_id,effective_from
) values
  ('fce10000-0000-4000-8000-000000000001','fce60000-0000-4000-8000-000000000001','fce61000-0000-4000-8000-000000000001','fce62000-0000-4000-8000-000000000001',current_date-500),
  ('fce10000-0000-4000-8000-000000000002','fce60000-0000-4000-8000-000000000001','fce61000-0000-4000-8000-000000000001','fce62000-0000-4000-8000-000000000001',current_date-500);

insert into public.education_network_memberships(
  user_id,role_key,circuit_id,active_from
) values(
  'fce40000-0000-4000-8000-000000000004','circuit_officer','fce62000-0000-4000-8000-000000000001',current_date-30
);

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','fce40000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is(
  (public.get_crc_custody_access_context('fce10000-0000-4000-8000-000000000002')->>'can_manage_custody')::boolean,
  true,
  'effective delegated CRC duty grants custody-workflow authority'
);

select is(
  (public.get_crc_custody_access_context('fce10000-0000-4000-8000-000000000002')->>'can_view_confidential_support')::boolean,
  false,
  'delegated CRC duty does not grant confidential learner-support authority'
);

create temp table crc689_request as
select public.request_crc_custody(
  'fce20000-0000-4000-8000-000000000001',
  'fce10000-0000-4000-8000-000000000001',
  null,
  'Please transfer the official CRC.'
) as request_id;

select is(
  (select count(*)::integer from public.get_my_crc_custody_requests() where outgoing),
  1,
  'receiving custodian sees the outgoing missing-CRC request'
);

reset role;
select set_config('request.jwt.claim.sub','fce40000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  (select count(*)::integer from public.get_my_crc_custody_requests() where incoming),
  1,
  'origin custodian sees the incoming request'
);

create temp table crc689_custody as
select public.accept_crc_custody_request((select request_id from crc689_request)) as custody_id;

select is(
  (select status from public.crc_custody_requests where id=(select request_id from crc689_request)),
  'accepted',
  'origin acceptance creates a prepared custody transfer'
);

reset role;
select set_config('request.jwt.claim.sub','fce40000-0000-4000-8000-000000000003',true);
set local role authenticated;

select lives_ok(
  $$select public.authorize_crc_custody((select custody_id from crc689_custody))$$,
  'origin leadership authorizes the transfer'
);

reset role;
select set_config('request.jwt.claim.sub','fce40000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.dispatch_crc_custody((select custody_id from crc689_custody))$$,
  'origin delegated custodian dispatches the authorized CRC'
);

reset role;
select set_config('request.jwt.claim.sub','fce40000-0000-4000-8000-000000000002',true);
set local role authenticated;

select lives_ok(
  $$select public.receive_crc_custody((select custody_id from crc689_custody))$$,
  'named receiving custodian receives the CRC'
);
select lives_ok(
  $$select public.acknowledge_crc_custody((select custody_id from crc689_custody))$$,
  'named receiving custodian acknowledges the CRC'
);
select lives_ok(
  $$select public.close_crc_custody((select custody_id from crc689_custody))$$,
  'receiving custodian closes custody after acknowledgement'
);

select is(
  (select status from public.crc_custody_requests where id=(select request_id from crc689_request)),
  'fulfilled',
  'closed custody automatically fulfills the linked request'
);

reset role;

select throws_ok(
  $$update public.learner_cumulative_notes
      set note='Origin history rewritten after transfer.'
    where enrolment_id='fce30000-0000-4000-8000-000000000001'$$,
  'Transferred origin CRC history is read-only',
  'origin CRC history becomes immutable after custody closes'
);

select lives_ok(
  $$insert into public.learner_cumulative_notes(
      tenant_id,school_id,learner_id,enrolment_id,note_date,note_type,note,sensitivity,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111',
      'fce10000-0000-4000-8000-000000000002',
      'fce20000-0000-4000-8000-000000000001',
      'fce30000-0000-4000-8000-000000000002',
      current_date,
      'general_remark',
      'Receiving school continues the longitudinal CRC.',
      'routine',
      'fce40000-0000-4000-8000-000000000005'
    )$$,
  'receiving-school current enrolment remains a writable longitudinal continuation'
);

select set_config('request.jwt.claim.sub','fce40000-0000-4000-8000-000000000006',true);
set local role authenticated;

select is(
  (public.get_crc_custody_access_context('fce10000-0000-4000-8000-000000000002')->>'can_manage_custody')::boolean,
  false,
  'Platform Support remains outside delegated CRC custody authority'
);

reset role;
select set_config('request.jwt.claim.sub','fce40000-0000-4000-8000-000000000002',true);
set local role authenticated;

create temp table crc689_escalation_request as
select public.request_crc_custody(
  'fce20000-0000-4000-8000-000000000001',
  'fce10000-0000-4000-8000-000000000001',
  null,
  'Second request used to verify governed escalation.'
) as request_id;

reset role;
update public.crc_custody_requests
set response_due_on=current_date-1
where id=(select request_id from crc689_escalation_request);

select set_config('request.jwt.claim.sub','fce40000-0000-4000-8000-000000000002',true);
set local role authenticated;

select lives_ok(
  $$select public.escalate_crc_custody_request(
    (select request_id from crc689_escalation_request),
    'circuit'
  )$$,
  'overdue request may be escalated through the schools current circuit relationship'
);

reset role;
select set_config('request.jwt.claim.sub','fce40000-0000-4000-8000-000000000004',true);
set local role authenticated;

select is(
  (select count(*)::integer from public.list_my_crc_request_escalations()),
  1,
  'current circuit officer receives only the explicit CRC referral metadata'
);

select is(
  (select count(*)::integer from public.learners where id='fce20000-0000-4000-8000-000000000001'),
  0,
  'network referral does not grant learner identity-table access'
);

select is(
  (select count(*)::integer from public.get_my_crc_custody_requests()),
  0,
  'network referral does not grant school CRC request details'
);

select lives_ok(
  $$select public.acknowledge_crc_request_escalation(
    (select escalation_id from public.list_my_crc_request_escalations() limit 1)
  )$$,
  'in-scope circuit officer can acknowledge the referral without opening CRC content'
);

reset role;

select ok(
  not has_function_privilege('authenticated','app_private.is_crc_custodian(uuid,uuid,date)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_transferred_crc_history_read_only()','EXECUTE'),
  'delegated custody and transfer-history security helpers remain private'
);

select * from finish();
rollback;
