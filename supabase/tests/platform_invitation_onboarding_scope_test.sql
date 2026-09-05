begin;

select plan(6);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fe000000-0000-4000-8000-000000000001','platform-invite-scope@example.test','authenticated','authenticated',now(),now()),
  ('fe000000-0000-4000-8000-000000000002','school-invite-scope@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key,active_from)
values('fe000000-0000-4000-8000-000000000001','platform_admin',current_date);

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fe000000-0000-4000-8000-000000000002',
  'school_admin',
  current_date
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000001',true);
set local role authenticated;

select throws_ok(
  $$select * from public.create_school_invitation(
    '22222222-2222-4222-8222-222222222222','teacher-by-platform@example.test','Teacher','Platform',null,'teacher')$$,
  'Platform onboarding may only establish a school administrator',
  'platform-only admin cannot invite routine school staff'
);

select is(
  (select count(*)::integer from public.create_school_invitation(
    '22222222-2222-4222-8222-222222222222','admin-by-platform@example.test','Admin','Platform',null,'school_admin')),
  1,
  'platform admin can establish a school administrator'
);

select is(
  (select count(*)::integer from public.school_invitations
   where invited_by_user_id='fe000000-0000-4000-8000-000000000001'),
  1,
  'blocked platform staffing attempt leaves no invitation row'
);

reset role;
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is(
  (select count(*)::integer from public.create_school_invitation(
    '22222222-2222-4222-8222-222222222222','teacher-by-school@example.test','Teacher','School',null,'teacher')),
  1,
  'target-school admin can invite routine school staff'
);

reset role;
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fe000000-0000-4000-8000-000000000001',
  'school_admin',
  current_date
);
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  (select count(*)::integer from public.create_school_invitation(
    '22222222-2222-4222-8222-222222222222','teacher-by-dual-role@example.test','Teacher','Dual',null,'teacher')),
  1,
  'a platform admin who is also the target school admin may act in school-admin capacity'
);

reset role;
select ok(
  not has_function_privilege('authenticated','app_private.enforce_platform_invitation_onboarding_scope()','EXECUTE'),
  'platform invitation boundary helper remains private'
);

select * from finish();
rollback;
