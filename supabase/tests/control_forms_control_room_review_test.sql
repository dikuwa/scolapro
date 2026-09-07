begin;

select plan(14);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fe000000-0000-4000-8000-000000000001','n20-review-admin@example.test','authenticated','authenticated',now(),now()),
('fe000000-0000-4000-8000-000000000002','n20-review-hod-a@example.test','authenticated','authenticated',now(),now()),
('fe000000-0000-4000-8000-000000000003','n20-review-hod-b@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
('fe100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fe000000-0000-4000-8000-000000000002','N20-HOD-A','Ada','HOD','active'),
('fe100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fe000000-0000-4000-8000-000000000003','N20-HOD-B','Ben','HOD','active');

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,position_title,effective_from,created_by_user_id) values
('fe200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe100000-0000-4000-8000-000000000001','management','HOD A','2026-01-01','fe000000-0000-4000-8000-000000000001'),
('fe200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe100000-0000-4000-8000-000000000002','management','HOD B','2026-01-01','fe000000-0000-4000-8000-000000000001');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe000000-0000-4000-8000-000000000001',null,'school_admin','2026-01-01'),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe000000-0000-4000-8000-000000000002','fe100000-0000-4000-8000-000000000001','hod','2026-01-01'),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe000000-0000-4000-8000-000000000003','fe100000-0000-4000-8000-000000000002','hod','2026-01-01');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.create_control_template_version('22222222-2222-4222-8222-222222222222','dept-a','Department A Control','2026-01-01',null,'fe200000-0000-4000-8000-000000000001')$$,
  'school leadership can create a department-owned control template'
);
select lives_ok(
  $$select public.create_control_template_version('22222222-2222-4222-8222-222222222222','dept-b','Department B Control','2026-01-01',null,'fe200000-0000-4000-8000-000000000002')$$,
  'school leadership can create another department-owned control template'
);

select lives_ok(
  $$select public.add_control_template_item((select id from public.control_template where template_key='dept-a'),'item-a','Department A item',1)$$,
  'school leadership can configure department A template'
);
select lives_ok(
  $$select public.add_control_template_item((select id from public.control_template where template_key='dept-b'),'item-b','Department B item',1)$$,
  'school leadership can configure department B template'
);
select lives_ok(
  $$select public.publish_control_template((select id from public.control_template where template_key='dept-a'),'2026-06-30')$$,
  'department A template publishes with bounded effective period'
);
select lives_ok(
  $$select public.publish_control_template((select id from public.control_template where template_key='dept-b'),'2026-06-30')$$,
  'department B template publishes with bounded effective period'
);

select lives_ok(
  $$select public.create_control_cycle((select id from public.control_template where template_key='dept-a'),'DEPT-A-IN','2026-02-01','2026-02-28',null)$$,
  'cycle wholly inside published template period succeeds'
);
select throws_ok(
  $$select public.create_control_cycle((select id from public.control_template where template_key='dept-a'),'DEPT-A-OUT','2026-06-01','2026-07-01',null)$$,
  'Control cycle period must fall within the published template effective period',
  'cycle extending beyond template effective period is rejected'
);

select lives_ok(
  $$select public.create_control_template_version('22222222-2222-4222-8222-222222222222','dept-a','Department A Control','2026-07-01',(select id from public.control_template where template_key='dept-a' and version_no=1),'fe200000-0000-4000-8000-000000000001')$$,
  'draft successor begins after predecessor effective period'
);

reset role;
select throws_ok(
  $$update public.control_template set effective_from='2026-06-30' where template_key='dept-a' and version_no=2$$,
  'Successor control template must start after its predecessor effective period ends',
  'draft successor update cannot create predecessor-period overlap'
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000002',true);

select is(
  (select array_agg(distinct template_key order by template_key) from public.control_template),
  array['dept-a']::text[],
  'HOD enumerates only own-department control templates across all permitted versions'
);

select lives_ok(
  $$select public.add_control_template_item((select id from public.control_template where template_key='dept-a' and version_no=2),'item-a2','Department A successor item',1)$$,
  'HOD can mutate a draft template in own department'
);

select throws_ok(
  $$select public.add_control_template_item((select id from public.control_template where template_key='dept-b'),'blocked','Blocked',2)$$,
  'Control template not found',
  'HOD cannot discover or mutate another department template'
);

select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000001',true);
select is(
  (select count(distinct template_key)::integer from public.control_template where template_key in ('dept-a','dept-b')),
  2,
  'school leadership retains school-wide enumeration across department-owned controls'
);

select * from finish();
rollback;