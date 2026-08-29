begin;

select plan(6);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fa000000-0000-4000-8000-000000000001','parent.claim@example.test','authenticated','authenticated',now(),now()),
  ('fa000000-0000-4000-8000-000000000002','wrong.parent@example.test','authenticated','authenticated',now(),now());

insert into public.guardian_profiles(id,tenant_id,first_names,surname,identity_number)
values('fa100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Claim','Guardian','CLAIM-ID-001');

insert into public.guardian_contacts(id,tenant_id,guardian_id,contact_type,contact_value,is_primary,effective_from)
values('fa200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fa100000-0000-4000-8000-000000000001','email',' Parent.Claim@Example.Test ',true,current_date-5);

select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);

select throws_ok(
  $$select public.claim_guardian_profile('fa100000-0000-4000-8000-000000000001')$$,
  'Account email does not match an active guardian email',
  'different account email cannot claim guardian profile'
);

select is(
  (select count(*)::integer from public.guardian_user_links where guardian_id='fa100000-0000-4000-8000-000000000001'),
  0,
  'failed claim creates no guardian account link'
);

select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);

select is(
  public.claim_guardian_profile('fa100000-0000-4000-8000-000000000001'),
  true,
  'matching authenticated email claims guardian profile case-insensitively and after trimming contact value'
);

select is(
  (select count(*)::integer from public.guardian_user_links where guardian_id='fa100000-0000-4000-8000-000000000001' and user_id='fa000000-0000-4000-8000-000000000001'),
  1,
  'successful claim creates exactly one guardian account link'
);

select is(
  public.claim_guardian_profile('fa100000-0000-4000-8000-000000000001'),
  true,
  'repeating the same valid claim is idempotent'
);

select is(
  (select count(*)::integer from public.guardian_user_links where guardian_id='fa100000-0000-4000-8000-000000000001' and user_id='fa000000-0000-4000-8000-000000000001'),
  1,
  'repeated valid claim does not duplicate guardian account links'
);

select * from finish();
rollback;
