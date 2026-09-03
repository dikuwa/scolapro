begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fdc00000-0000-4000-8000-000000000001','directory-support@example.test','authenticated','authenticated',now(),now()),
  ('fdc00000-0000-4000-8000-000000000002','directory-platform-admin@example.test','authenticated','authenticated',now(),now()),
  ('fdc00000-0000-4000-8000-000000000003','directory-school-admin@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key,active_from)
values
  ('fdc00000-0000-4000-8000-000000000001','platform_support',current_date),
  ('fdc00000-0000-4000-8000-000000000002','platform_admin',current_date);

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fdc00000-0000-4000-8000-000000000003',
  'school_admin',current_date-10
);

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','fdc00000-0000-4000-8000-000000000001',true);
select is(
  app_private.has_school_access('22222222-2222-4222-8222-222222222222'::uuid),
  true,
  'platform support retains broad support-safe school metadata access'
);
select is(
  app_private.has_school_membership_scope('22222222-2222-4222-8222-222222222222'::uuid),
  false,
  'platform support does not receive strict school identity scope'
);
select throws_ok(
  $$select * from public.list_staff_directory_page('22222222-2222-4222-8222-222222222222'::uuid,null,1,10)$$,
  'P0001','Permission denied',
  'platform support cannot enumerate staff names and employee identifiers through the SECURITY DEFINER directory RPC'
);
select throws_ok(
  $$select * from public.list_learner_directory_page('22222222-2222-4222-8222-222222222222'::uuid,2026,null,'current',null,null,null,false,1,10)$$,
  'P0001','Permission denied',
  'platform support cannot enumerate learner names and admission identifiers through the SECURITY DEFINER directory RPC'
);

select set_config('request.jwt.claim.sub','fdc00000-0000-4000-8000-000000000002',true);
select is(
  app_private.has_school_membership_scope('22222222-2222-4222-8222-222222222222'::uuid),
  true,
  'platform admin retains governed cross-school identity scope'
);
select lives_ok(
  $$select * from public.list_staff_directory_page('22222222-2222-4222-8222-222222222222'::uuid,null,1,10)$$,
  'platform admin can still inspect the staff directory'
);
select lives_ok(
  $$select * from public.list_learner_directory_page('22222222-2222-4222-8222-222222222222'::uuid,2026,null,'current',null,null,null,false,1,10)$$,
  'platform admin can still inspect the learner directory'
);

select set_config('request.jwt.claim.sub','fdc00000-0000-4000-8000-000000000003',true);
select lives_ok(
  $$select * from public.list_staff_directory_page('22222222-2222-4222-8222-222222222222'::uuid,null,1,10)$$,
  'current school administrator retains staff directory access'
);
select lives_ok(
  $$select * from public.list_learner_directory_page('22222222-2222-4222-8222-222222222222'::uuid,2026,null,'current',null,null,null,false,1,10)$$,
  'current school administrator retains learner directory access'
);

select * from finish();
rollback;
