begin;

select plan(14);

select ok(
  to_regprocedure('public.get_school_payment_instructions(uuid)') is not null,
  'sanitized school payment instructions RPC exists'
);

select ok(
  not has_function_privilege('anon','public.get_school_payment_instructions(uuid)','EXECUTE'),
  'anonymous users cannot execute payment instructions RPC'
);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fa100000-0000-4000-8000-000000000001','payment-settings-finance@example.test','authenticated','authenticated',now(),now()),
  ('fa100000-0000-4000-8000-000000000002','payment-settings-teacher@example.test','authenticated','authenticated',now(),now()),
  ('fa100000-0000-4000-8000-000000000003','payment-settings-parent@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug)
values('fa110000-0000-4000-8000-000000000001','Payment Settings Tenant B','payment-settings-tenant-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('fa120000-0000-4000-8000-000000000001','fa110000-0000-4000-8000-000000000001','Payment Settings School B','PAY-SET-B','Khomas','Windhoek');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa100000-0000-4000-8000-000000000001','finance_officer',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa100000-0000-4000-8000-000000000002','teacher',current_date);

insert into public.guardian_profiles(id,tenant_id,first_names,surname,identity_number)
values('fa130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Payment','Guardian','PAY-SET-GUARDIAN');

insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,relationship_type,is_legal_guardian,effective_from)
values('fa140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','fa130000-0000-4000-8000-000000000001','parent',true,current_date-1);

insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id,linked_by_user_id)
values('fa150000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fa130000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000003','fa100000-0000-4000-8000-000000000003');

select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select lives_ok(
  $$select public.save_school_payment_settings(
    '22222222-2222-4222-8222-222222222222',
    'Test Bank',
    'ScolaPro School Account',
    '123456789',
    'Main Branch',
    '001',
    'Current',
    'Use learner admission number',
    'Send proof of payment to the school office',
    true
  )$$,
  'finance manager can save payment settings for own school'
);

select is(
  (select count(*)::int from public.school_payment_settings where school_id='22222222-2222-4222-8222-222222222222'),
  1,
  'finance manager can directly read own-school raw payment settings'
);

select throws_ok(
  $$select public.save_school_payment_settings(
    'fa120000-0000-4000-8000-000000000001',
    'Cross Bank','Cross Account','999',null,null,null,null,null,true
  )$$,
  'Permission denied',
  'finance manager cannot save settings for another school'
);

reset role;
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is(
  (select count(*)::int from public.school_payment_settings where school_id='22222222-2222-4222-8222-222222222222'),
  0,
  'ordinary school member cannot directly read raw payment settings'
);

select is(
  (select bank_name from public.get_school_payment_instructions('22222222-2222-4222-8222-222222222222')),
  'Test Bank',
  'current school member can read sanitized payment instructions'
);

select throws_ok(
  $$select public.save_school_payment_settings(
    '22222222-2222-4222-8222-222222222222',
    'Teacher Bank','Teacher Account','123',null,null,null,null,null,true
  )$$,
  'Permission denied',
  'ordinary school member cannot mutate payment settings'
);

reset role;
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000003',true);
set local role authenticated;

select is(
  (select count(*)::int from public.school_payment_settings where school_id='22222222-2222-4222-8222-222222222222'),
  0,
  'guardian cannot directly read raw payment settings'
);

select is(
  (select bank_name from public.get_school_payment_instructions('22222222-2222-4222-8222-222222222222')),
  'Test Bank',
  'current guardian can read sanitized payment instructions'
);

select throws_ok(
  $$select * from public.get_school_payment_instructions('fa120000-0000-4000-8000-000000000001')$$,
  'Permission denied',
  'guardian cannot read another school payment instructions'
);

reset role;
update public.learner_guardians
set effective_to=current_date-1
where id='fa140000-0000-4000-8000-000000000001';
set local role authenticated;

select throws_ok(
  $$select * from public.get_school_payment_instructions('22222222-2222-4222-8222-222222222222')$$,
  'Permission denied',
  'ended guardian relationship immediately removes payment instruction access'
);

reset role;

select ok(
  not has_table_privilege('authenticated','public.school_payment_settings','INSERT')
  and not has_table_privilege('authenticated','public.school_payment_settings','UPDATE')
  and not has_table_privilege('authenticated','public.school_payment_settings','DELETE'),
  'authenticated clients cannot directly mutate school payment settings'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_school_payment_setting_scope()','EXECUTE'),
  'payment settings scope trigger helper is not directly executable by authenticated clients'
);

select * from finish();
rollback;
