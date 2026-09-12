begin;

select plan(16);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('ab000000-0000-4000-8000-000000000001','mutation-manager@example.test','authenticated','authenticated',now(),now()),
  ('ab000000-0000-4000-8000-000000000002','mutation-ended@example.test','authenticated','authenticated',now(),now()),
  ('ab000000-0000-4000-8000-000000000003','mutation-legacy@example.test','authenticated','authenticated',now(),now()),
  ('ab000000-0000-4000-8000-000000000004','mutation-support@example.test','authenticated','authenticated',now(),now()),
  ('ab000000-0000-4000-8000-000000000005','mutation-platform@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug,status) values
  ('ab100000-0000-4000-8000-000000000001','Mutation Other Tenant','mutation-other-tenant','active');

insert into public.schools(id,tenant_id,name,emis_number,status) values
  ('ab110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Mutation Old School','MUT-OLD','active'),
  ('ab110000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Mutation Current School','MUT-CURRENT','active');

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('ab120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ab000000-0000-4000-8000-000000000001','MUT-MGR','Current','Manager','active'),
  ('ab120000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ab000000-0000-4000-8000-000000000002','MUT-END','Ended','Manager','active'),
  ('ab120000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','ab000000-0000-4000-8000-000000000003','MUT-LEG','Legacy','Manager','active'),
  ('ab120000-0000-4000-8000-000000000010','11111111-1111-4111-8111-111111111111',null,'MUT-TGT-1','Target','One','active'),
  ('ab120000-0000-4000-8000-000000000011','11111111-1111-4111-8111-111111111111',null,'MUT-TGT-2','Target','Two','active'),
  ('ab120000-0000-4000-8000-000000000012','11111111-1111-4111-8111-111111111111',null,'MUT-TGT-3','Target','Three','active'),
  ('ab120000-0000-4000-8000-000000000013','11111111-1111-4111-8111-111111111111',null,'MUT-TGT-4','Target','Four','active'),
  ('ab120000-0000-4000-8000-000000000014','11111111-1111-4111-8111-111111111111',null,'MUT-TGT-5','Target','Five','active'),
  ('ab120000-0000-4000-8000-000000000020','ab100000-0000-4000-8000-000000000001',null,'MUT-XTEN','Cross','Tenant','active');

insert into public.school_memberships(
  id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from,active_to
) values
  ('ab130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ab110000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000001','ab120000-0000-4000-8000-000000000001','school_admin',current_date-30,null),
  ('ab130000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ab110000-0000-4000-8000-000000000002','ab000000-0000-4000-8000-000000000001','ab120000-0000-4000-8000-000000000001','school_admin',current_date-10,null),
  ('ab130000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','ab110000-0000-4000-8000-000000000002','ab000000-0000-4000-8000-000000000002','ab120000-0000-4000-8000-000000000002','school_admin',current_date-20,null),
  ('ab130000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','ab110000-0000-4000-8000-000000000002','ab000000-0000-4000-8000-000000000003','ab120000-0000-4000-8000-000000000003','school_admin',current_date-20,null);

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,position_title,effective_from,effective_to,created_by_user_id
) values
  ('ab140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ab110000-0000-4000-8000-000000000002','ab120000-0000-4000-8000-000000000001','management','Current Manager',current_date-10,null,'ab000000-0000-4000-8000-000000000001'),
  ('ab140000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ab110000-0000-4000-8000-000000000002','ab120000-0000-4000-8000-000000000002','management','Former Manager',current_date-30,current_date-1,'ab000000-0000-4000-8000-000000000001'),
  ('ab140000-0000-4000-8000-000000000010','11111111-1111-4111-8111-111111111111','ab110000-0000-4000-8000-000000000001','ab120000-0000-4000-8000-000000000014','staff','Old-school Target',current_date-5,null,'ab000000-0000-4000-8000-000000000001'),
  ('ab140000-0000-4000-8000-000000000011','11111111-1111-4111-8111-111111111111','ab110000-0000-4000-8000-000000000002','ab120000-0000-4000-8000-000000000013','staff','Current-school Target',current_date-5,null,'ab000000-0000-4000-8000-000000000001');

insert into public.platform_memberships(user_id,role_key,active_from) values
  ('ab000000-0000-4000-8000-000000000004','platform_support',current_date-5),
  ('ab000000-0000-4000-8000-000000000005','platform_admin',current_date-5);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000001',true);
set local role authenticated;

select throws_ok(
  $$select public.assign_staff_to_school('ab110000-0000-4000-8000-000000000001','ab120000-0000-4000-8000-000000000010','staff',null,current_date,null)$$,
  'Permission denied',
  'older active non-current school membership cannot create a staff assignment'
);
select lives_ok(
  $$select public.assign_staff_to_school('ab110000-0000-4000-8000-000000000002','ab120000-0000-4000-8000-000000000010','staff',null,current_date,null)$$,
  'current-school manager can create a staff assignment'
);
select throws_ok(
  $$select public.end_staff_school_assignment('ab140000-0000-4000-8000-000000000010',current_date)$$,
  'Permission denied',
  'older active non-current school membership cannot end a staff assignment'
);
select lives_ok(
  $$select public.end_staff_school_assignment('ab140000-0000-4000-8000-000000000011',current_date)$$,
  'current-school manager can end a current-school staff assignment'
);
select is(
  (select created_by_user_id from public.staff_school_assignments where school_id='ab110000-0000-4000-8000-000000000002' and staff_member_id='ab120000-0000-4000-8000-000000000010' and effective_from=current_date),
  'ab000000-0000-4000-8000-000000000001'::uuid,
  'staff assignment preserves authenticated creator provenance'
);
select is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='school_memberships' and cmd in ('INSERT','UPDATE','DELETE','ALL')),
  0,
  'school memberships expose no direct authenticated mutation policy outside governed workflows'
);

select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select public.assign_staff_to_school('ab110000-0000-4000-8000-000000000002','ab120000-0000-4000-8000-000000000011','staff',null,current_date,null)$$,
  'Permission denied',
  'ended authoritative manager placement cannot retain staffing mutation authority through stale membership'
);

select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000003',true);
select lives_ok(
  $$select public.assign_staff_to_school('ab110000-0000-4000-8000-000000000002','ab120000-0000-4000-8000-000000000011','staff',null,current_date,null)$$,
  'legacy linked manager with no assignment history retains membership fallback authority'
);

select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000004',true);
select throws_ok(
  $$select public.assign_staff_to_school('ab110000-0000-4000-8000-000000000002','ab120000-0000-4000-8000-000000000012','staff',null,current_date,null)$$,
  'Permission denied',
  'Platform Support cannot perform school staffing mutations'
);
select throws_ok(
  $$select * from public.create_school_invitation('ab110000-0000-4000-8000-000000000002','support-invite@example.test',null,null,null,'teacher')$$,
  'Permission denied',
  'Platform Support cannot create a school membership invitation'
);

select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000005',true);
select lives_ok(
  $$select public.assign_staff_to_school('ab110000-0000-4000-8000-000000000001','ab120000-0000-4000-8000-000000000012','staff',null,current_date,null)$$,
  'Platform Admin retains governed cross-school staffing authority'
);

select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.assign_staff_to_school('ab110000-0000-4000-8000-000000000002','ab120000-0000-4000-8000-000000000020','staff',null,current_date,null)$$,
  'Staff member not found in school tenant',
  'cross-tenant staff identity cannot be linked to a school assignment'
);
select throws_ok(
  $$select * from public.create_school_invitation('ab110000-0000-4000-8000-000000000001','old-school-invite@example.test',null,null,null,'teacher')$$,
  'Permission denied',
  'older active non-current school membership cannot create a future membership invitation'
);
select lives_ok(
  $$select * from public.create_school_invitation('ab110000-0000-4000-8000-000000000002','current-school-invite@example.test',null,null,null,'teacher')$$,
  'current-school school admin can create a governed membership invitation'
);

select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select * from public.create_school_invitation('ab110000-0000-4000-8000-000000000002','ended-manager-invite@example.test',null,null,null,'teacher')$$,
  'Permission denied',
  'ended authoritative manager placement cannot create memberships through stale school-admin membership'
);

select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000005',true);
select lives_ok(
  $$select * from public.create_school_invitation('ab110000-0000-4000-8000-000000000001','platform-governed-invite@example.test',null,null,null,'school_admin')$$,
  'Platform Admin retains governed cross-school school-admin onboarding authority'
);

reset role;
select * from finish();
rollback;
