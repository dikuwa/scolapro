begin;

select plan(4);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fa970000-0000-4000-8000-000000000001','same-school-multirole@example.test','authenticated','authenticated',now(),now()),
('fa970000-0000-4000-8000-000000000002','cross-school-current@example.test','authenticated','authenticated',now(),now()),
('fa970000-0000-4000-8000-000000000003','stale-placement-multirole@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,region,town) values
('fa971000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Issue 1047 Other School','I1047','Erongo','Swakopmund');

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
('fa972000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fa970000-0000-4000-8000-000000000001','I1047-A','Same','School','active'),
('fa972000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fa970000-0000-4000-8000-000000000003','I1047-C','Stale','Placement','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
-- Same school: newer teacher membership defines the current school, while the
-- older still-active school_admin membership must continue to authorize.
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa970000-0000-4000-8000-000000000001','fa972000-0000-4000-8000-000000000001','school_admin',current_date-30),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa970000-0000-4000-8000-000000000001','fa972000-0000-4000-8000-000000000001','teacher',current_date-1),
-- Cross school: the newer membership changes the deterministic current school;
-- the older NHS leadership role must not authorize NHS.
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa970000-0000-4000-8000-000000000002',null,'school_admin',current_date-30),
('11111111-1111-4111-8111-111111111111','fa971000-0000-4000-8000-000000000001','fa970000-0000-4000-8000-000000000002',null,'teacher',current_date-1),
-- Same-school leadership role with an ended staff placement remains denied.
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa970000-0000-4000-8000-000000000003','fa972000-0000-4000-8000-000000000003','school_admin',current_date-30),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa970000-0000-4000-8000-000000000003','fa972000-0000-4000-8000-000000000003','teacher',current_date-1);

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id) values
('fa973000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa972000-0000-4000-8000-000000000001','teacher',current_date-60,null,'fa970000-0000-4000-8000-000000000001'),
('fa973000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa972000-0000-4000-8000-000000000003','management',current_date-60,current_date-2,'fa970000-0000-4000-8000-000000000003');

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','fa970000-0000-4000-8000-000000000001',true);
select is(
  app_private.has_school_local_role(
    '22222222-2222-4222-8222-222222222222',
    array['school_admin','principal','deputy_principal']
  ),
  true,
  'newer teacher membership does not hide an active same-school leadership role'
);

select lives_ok(
  $$select * from public.get_academic_analysis_promotion_readiness(
    '22222222-2222-4222-8222-222222222222',
    2026
  )$$,
  'promotion-readiness RPC accepts same-school multi-role leadership authority'
);

select set_config('request.jwt.claim.sub','fa970000-0000-4000-8000-000000000002',true);
select is(
  app_private.has_school_local_role(
    '22222222-2222-4222-8222-222222222222',
    array['school_admin','principal','deputy_principal']
  ),
  false,
  'older leadership membership in a non-current school remains denied'
);

select set_config('request.jwt.claim.sub','fa970000-0000-4000-8000-000000000003',true);
select is(
  app_private.has_school_local_role(
    '22222222-2222-4222-8222-222222222222',
    array['school_admin','principal','deputy_principal']
  ),
  false,
  'ended staff placement still removes same-school leadership authority'
);

select * from finish();
rollback;
