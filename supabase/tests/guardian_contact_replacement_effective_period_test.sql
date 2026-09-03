begin;

select plan(14);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fdd00000-0000-4000-8000-000000000001','guardian-replace-admin@example.test','authenticated','authenticated',now(),now()),
  ('fdd00000-0000-4000-8000-000000000002','old-current@example.test','authenticated','authenticated',now(),now()),
  ('fdd00000-0000-4000-8000-000000000003','new-current@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fdd00000-0000-4000-8000-000000000001',
  'school_admin',
  current_date-10
);

insert into public.learners(id,tenant_id,first_names,surname,sex)
values('fdd10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Contact','Learner','unspecified');

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status
) values(
  'fdd20000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fdd10000-0000-4000-8000-000000000001',
  extract(year from current_date)::integer,
  make_date(extract(year from current_date)::integer,1,1),
  'current'
);

insert into public.guardian_profiles(id,tenant_id,first_names,surname,status)
values('fdd30000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Scheduled','Guardian','active');

insert into public.learner_guardians(
  id,tenant_id,learner_id,guardian_id,relationship_type,priority,effective_from,effective_to
) values(
  'fdd40000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'fdd10000-0000-4000-8000-000000000001',
  'fdd30000-0000-4000-8000-000000000001',
  'parent',1,current_date-20,current_date+20
);

insert into public.guardian_contacts(
  id,tenant_id,guardian_id,contact_type,contact_value,is_primary,effective_from,effective_to
) values
(
  'fdd50000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'fdd30000-0000-4000-8000-000000000001','email','old-current@example.test',true,current_date-10,null
),
(
  'fdd50000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
  'fdd30000-0000-4000-8000-000000000001','email','future@example.test',false,current_date+10,null
),
(
  'fdd50000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111',
  'fdd30000-0000-4000-8000-000000000001','mobile','0810000000',false,current_date,null
);

insert into public.guardian_addresses(
  id,tenant_id,guardian_id,address_type,address_line_1,is_primary,effective_from,effective_to
) values
(
  'fdd60000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'fdd30000-0000-4000-8000-000000000001','postal','Old Current Postal',true,current_date-10,null
),
(
  'fdd60000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
  'fdd30000-0000-4000-8000-000000000001','postal','Future Postal',false,current_date+10,null
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fdd00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.replace_guardian_contact_details(
    'fdd30000-0000-4000-8000-000000000001'::uuid,
    'fdd10000-0000-4000-8000-000000000001'::uuid,
    '[{"type":"email","value":"new-current@example.test","primary":true}]'::jsonb,
    '[{"type":"postal","line1":"New Current Postal","primary":true}]'::jsonb
  )$$,
  'replacement succeeds even when future-scheduled guardian contact/address rows exist'
);
reset role;

select is(
  (select effective_to from public.guardian_contacts where id='fdd50000-0000-4000-8000-000000000001'),
  current_date-1,
  'previously current contact stops being effective immediately on replacement'
);
select is(
  (select count(*)::integer from public.guardian_contacts where id='fdd50000-0000-4000-8000-000000000003'),
  0,
  'same-day superseded contact is removed instead of creating an invalid closed date range'
);
select is(
  (select effective_to from public.guardian_contacts where id='fdd50000-0000-4000-8000-000000000002'),
  null::date,
  'future-scheduled contact remains open-ended and untouched'
);
select is(
  (select effective_from from public.guardian_contacts where id='fdd50000-0000-4000-8000-000000000002'),
  current_date+10,
  'future-scheduled contact retains its planned start date'
);
select is(
  (select count(*)::integer from public.guardian_contacts
   where guardian_id='fdd30000-0000-4000-8000-000000000001'
     and contact_value='new-current@example.test'
     and effective_from=current_date
     and effective_to is null),
  1,
  'replacement creates one new current contact'
);

select is(
  (select effective_to from public.guardian_addresses where id='fdd60000-0000-4000-8000-000000000001'),
  current_date-1,
  'previously current address stops being effective immediately on replacement'
);
select is(
  (select effective_to from public.guardian_addresses where id='fdd60000-0000-4000-8000-000000000002'),
  null::date,
  'future-scheduled address remains open-ended and untouched'
);
select is(
  (select effective_from from public.guardian_addresses where id='fdd60000-0000-4000-8000-000000000002'),
  current_date+10,
  'future-scheduled address retains its planned start date'
);
select is(
  (select count(*)::integer from public.guardian_addresses
   where guardian_id='fdd30000-0000-4000-8000-000000000001'
     and address_line_1='New Current Postal'
     and effective_from=current_date
     and effective_to is null),
  1,
  'replacement creates one new current postal address'
);
select is(
  (select count(*)::integer from public.audit_events
   where event_type='guardian.contact_details.replaced'
     and entity_id='fdd30000-0000-4000-8000-000000000001'::uuid),
  1,
  'successful replacement preserves one durable audit event'
);

select set_config('request.jwt.claim.sub','fdd00000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.find_claimable_guardian_profiles()),
  0,
  'superseded guardian email is no longer claimable on the replacement date'
);
select throws_ok(
  $$select public.claim_guardian_profile('fdd30000-0000-4000-8000-000000000001'::uuid)$$,
  'P0001','Account email does not match an active guardian email',
  'superseded email cannot bind a guardian account after replacement'
);
reset role;

select set_config('request.jwt.claim.sub','fdd00000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.find_claimable_guardian_profiles()),
  1,
  'replacement email becomes the only claimable guardian identity'
);
select is(
  public.claim_guardian_profile('fdd30000-0000-4000-8000-000000000001'::uuid),
  true,
  'replacement email can bind the guardian account immediately'
);
reset role;

select * from finish();
rollback;
