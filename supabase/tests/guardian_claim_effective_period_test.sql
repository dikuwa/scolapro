begin;

select plan(6);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fdf00000-0000-4000-8000-000000000001','future.guardian@example.test','authenticated','authenticated',now(),now()),
('fdf00000-0000-4000-8000-000000000002','current.guardian@example.test','authenticated','authenticated',now(),now());

insert into public.guardian_profiles(id,tenant_id,first_names,surname,identity_number,status) values
('fdf10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Future','Guardian','CLAIM-PERIOD-FUTURE','active'),
('fdf10000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Current','Guardian','CLAIM-PERIOD-CURRENT','active');

insert into public.guardian_contacts(
  id,tenant_id,guardian_id,contact_type,contact_value,is_primary,effective_from,effective_to
) values
(
  'fdf20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'fdf10000-0000-4000-8000-000000000001','email','future.guardian@example.test',true,current_date+5,null
),
(
  'fdf20000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
  'fdf10000-0000-4000-8000-000000000002','email','current.guardian@example.test',true,current_date-5,current_date+5
);

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','fdf00000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.find_claimable_guardian_profiles()),
  0,
  'future-dated guardian email is not exposed as claimable before its effective start date'
);
select throws_ok(
  $$select public.claim_guardian_profile('fdf10000-0000-4000-8000-000000000001'::uuid)$$,
  'P0001','Account email does not match an active guardian email',
  'future-dated guardian email cannot bind an account before its effective start date'
);
reset role;
select is(
  (select count(*)::integer from public.guardian_user_links
   where guardian_id='fdf10000-0000-4000-8000-000000000001'::uuid),
  0,
  'denied future claim creates no guardian account link'
);

select set_config('request.jwt.claim.sub','fdf00000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.find_claimable_guardian_profiles()
   where guardian_id='fdf10000-0000-4000-8000-000000000002'::uuid),
  1,
  'currently effective guardian email remains claimable even with a scheduled future end date'
);
select is(
  public.claim_guardian_profile('fdf10000-0000-4000-8000-000000000002'::uuid),
  true,
  'currently effective finite-period guardian email can bind the matching account'
);
reset role;
select is(
  (select count(*)::integer from public.guardian_user_links
   where guardian_id='fdf10000-0000-4000-8000-000000000002'::uuid
     and user_id='fdf00000-0000-4000-8000-000000000002'::uuid),
  1,
  'valid finite-period claim creates exactly one guardian account link'
);

select * from finish();
rollback;
