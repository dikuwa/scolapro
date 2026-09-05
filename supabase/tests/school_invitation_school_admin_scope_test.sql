begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fb000000-0000-4000-8000-000000000001','school-scope-admin@example.test','authenticated','authenticated',now(),now()),
  ('fb000000-0000-4000-8000-000000000002','sw-accept@example.test','authenticated','authenticated',now(),now()),
  ('fb000000-0000-4000-8000-000000000003','platform-onboard@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values(
  '22222222-2222-4222-8222-222222222223',
  '11111111-1111-4111-8111-111111111111',
  'Other Scope School','DEMO002','Khomas','Windhoek','active'
);

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fb000000-0000-4000-8000-000000000001',
  'school_admin',
  current_date
);

insert into public.platform_memberships(user_id,role_key,active_from)
values('fb000000-0000-4000-8000-000000000003','platform_admin',current_date);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"fb000000-0000-4000-8000-000000000001","role":"authenticated","email":"school-scope-admin@example.test"}',true);
set local role authenticated;

create temp table created_invitation as
  select * from public.create_school_invitation(
    '22222222-2222-4222-8222-222222222222','sw-accept@example.test','Social','Worker',null,'social_worker');

select is((select count(*)::integer from created_invitation),1,'school admin can invite a social worker into their own school');

select throws_ok(
  $$select * from public.create_school_invitation(
    '22222222-2222-4222-8222-222222222223','other@example.test','Other','School',null,'teacher')$$,
  'Permission denied','school admin cannot invite into another school'
);

select throws_ok(
  $$select * from public.create_school_invitation(
    '22222222-2222-4222-8222-222222222222','platform@example.test','Platform','Admin',null,'platform_admin')$$,
  'Unsupported school role','school admin cannot invite platform-level roles'
);

-- Exercise the physical actor trigger as a trusted/RLS-bypassing writer while the
-- authenticated actor context remains the School Admin. Client table privileges are
-- intentionally closed, so this test must not rely on a raw authenticated insert.
reset role;
select throws_ok(
  $$insert into public.school_invitations(
      tenant_id,school_id,email,role_key,token_hash,invited_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'forged@example.test','teacher','forged-hash','fb000000-0000-4000-8000-000000000002')$$,
  'School invitation inviter must match authenticated actor',
  'school invitation actor-integrity protections remain intact'
);
set local role authenticated;

select is(
  (select count(*)::integer from public.school_invitations
   where school_id='22222222-2222-4222-8222-222222222222'),1,
  'school admin invitation history contains only their managed school invitations'
);
select is(
  (select count(*)::integer from public.school_invitations
   where school_id='22222222-2222-4222-8222-222222222223'),0,
  'school admin has no visibility into another school invitation history'
);

reset role;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"fb000000-0000-4000-8000-000000000002","role":"authenticated","email":"sw-accept@example.test"}',true);
set local role authenticated;

select is(
  (select role_key from public.accept_school_invitation((select invitation_token from created_invitation))),
  'social_worker','social worker invitation acceptance grants the social worker school role'
);
select ok(
  exists(
    select 1 from public.school_memberships
    where user_id='fb000000-0000-4000-8000-000000000002'
      and school_id='22222222-2222-4222-8222-222222222222'
      and role_key='social_worker'
  ),
  'accepted social worker membership is created at the managed school'
);
select is(
  (select ssa.assignment_type
   from public.staff_school_assignments ssa
   join public.staff_members sm on sm.id=ssa.staff_member_id
   where sm.user_id='fb000000-0000-4000-8000-000000000002'
     and ssa.school_id='22222222-2222-4222-8222-222222222222'
   limit 1),
  'support','accepted social worker receives a support school placement'
);

reset role;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"fb000000-0000-4000-8000-000000000003","role":"authenticated","email":"platform-onboard@example.test"}',true);
set local role authenticated;

select is(
  (select count(*)::integer from public.create_school_invitation(
    '22222222-2222-4222-8222-222222222223','first-admin@example.test','First','Admin',null,'school_admin')),
  1,'platform admin onboarding of a first school administrator remains available'
);

reset role;
select * from finish();
rollback;