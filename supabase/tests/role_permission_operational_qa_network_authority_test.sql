begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('f1000000-0000-4000-8000-000000000001','qa-current-circuit@example.test','authenticated','authenticated',now(),now()),
  ('f1000000-0000-4000-8000-000000000002','qa-expired-region@example.test','authenticated','authenticated',now(),now()),
  ('f1000000-0000-4000-8000-000000000003','qa-other-region@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug,status)
values('f1100000-0000-4000-8000-000000000001','Permission QA tenant','permission-qa-network-authority','active');

insert into public.schools(id,tenant_id,name,status) values
  ('f1200000-0000-4000-8000-000000000001','f1100000-0000-4000-8000-000000000001','Permission QA School A','active'),
  ('f1200000-0000-4000-8000-000000000002','f1100000-0000-4000-8000-000000000001','Permission QA School B','active');

insert into public.education_authorities(id,name)
values('f1300000-0000-4000-8000-000000000001','Permission QA Authority');

insert into public.education_regions(id,name) values
  ('f1310000-0000-4000-8000-000000000001','Permission QA Region A'),
  ('f1310000-0000-4000-8000-000000000002','Permission QA Region B');

insert into public.education_circuits(id,name) values
  ('f1320000-0000-4000-8000-000000000001','Permission QA Circuit A'),
  ('f1320000-0000-4000-8000-000000000002','Permission QA Circuit B');

insert into public.education_region_authority_history(id,region_id,authority_id,effective_from) values
  ('f1330000-0000-4000-8000-000000000001','f1310000-0000-4000-8000-000000000001','f1300000-0000-4000-8000-000000000001',current_date-interval '1000 days'),
  ('f1330000-0000-4000-8000-000000000002','f1310000-0000-4000-8000-000000000002','f1300000-0000-4000-8000-000000000001',current_date-interval '1000 days');

insert into public.education_circuit_region_history(id,circuit_id,region_id,effective_from) values
  ('f1340000-0000-4000-8000-000000000001','f1320000-0000-4000-8000-000000000001','f1310000-0000-4000-8000-000000000001',current_date-interval '1000 days'),
  ('f1340000-0000-4000-8000-000000000002','f1320000-0000-4000-8000-000000000002','f1310000-0000-4000-8000-000000000002',current_date-interval '1000 days');

insert into public.school_network_assignments(id,school_id,authority_id,region_id,circuit_id,effective_from) values
  ('f1350000-0000-4000-8000-000000000001','f1200000-0000-4000-8000-000000000001','f1300000-0000-4000-8000-000000000001','f1310000-0000-4000-8000-000000000001','f1320000-0000-4000-8000-000000000001',current_date-interval '900 days'),
  ('f1350000-0000-4000-8000-000000000002','f1200000-0000-4000-8000-000000000002','f1300000-0000-4000-8000-000000000001','f1310000-0000-4000-8000-000000000002','f1320000-0000-4000-8000-000000000002',current_date-interval '900 days');

insert into public.education_network_memberships(id,user_id,role_key,region_id,circuit_id,active_from,active_to) values
  ('f1360000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','circuit_officer',null,'f1320000-0000-4000-8000-000000000001',current_date-interval '800 days',null),
  ('f1360000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000002','regional_officer','f1310000-0000-4000-8000-000000000001',null,current_date-interval '800 days',current_date-1),
  ('f1360000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000003','regional_officer','f1310000-0000-4000-8000-000000000002',null,current_date-interval '800 days',null);

insert into public.examination_cycles(
  id,tenant_id,school_id,academic_year,cycle_key,display_name,status
) values(
  'f1400000-0000-4000-8000-000000000001','f1100000-0000-4000-8000-000000000001','f1200000-0000-4000-8000-000000000001',
  extract(year from current_date-interval '100 days')::integer,'qa-cycle-a','Permission QA Cycle A','setup'
);

insert into public.examination_centres(id,display_name)
values('f1410000-0000-4000-8000-000000000001','Permission QA Examination Centre');

insert into public.school_examination_centre_assignments(
  id,tenant_id,school_id,examination_centre_id,effective_from,source_name
) values(
  'f1420000-0000-4000-8000-000000000001','f1100000-0000-4000-8000-000000000001','f1200000-0000-4000-8000-000000000001',
  'f1410000-0000-4000-8000-000000000001',current_date-interval '900 days','permission-qa'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);

select is(
  app_private.can_view_school_via_network('f1200000-0000-4000-8000-000000000001',current_date-100),
  true,
  'current circuit membership may resolve historical school placement inside its current authority'
);

select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
select is(
  app_private.can_view_school_via_network('f1200000-0000-4000-8000-000000000001',current_date-100),
  false,
  'historical p_as_of does not revive an expired regional membership'
);

select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000003',true);
select is(
  app_private.can_view_school_via_network('f1200000-0000-4000-8000-000000000001',current_date-100),
  false,
  'current membership in another region cannot cross network scope'
);

select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.list_dnea_readiness_scope(current_date-100) d where d.school_id='f1200000-0000-4000-8000-000000000001'),
  1,
  'current circuit officer receives the network-safe historical DNEA readiness summary'
);
reset role;

select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.list_dnea_readiness_scope(current_date-100) d where d.school_id='f1200000-0000-4000-8000-000000000001'),
  0,
  'expired regional officer receives no historical DNEA readiness summary'
);
reset role;

select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.list_examination_centres_scope(current_date-100) c where c.examination_centre_id='f1410000-0000-4000-8000-000000000001'),
  1,
  'current circuit officer receives the historical examination-centre reference row in scope'
);
reset role;

select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.list_examination_centres_scope(current_date-100) c where c.examination_centre_id='f1410000-0000-4000-8000-000000000001'),
  0,
  'expired regional officer receives no historical examination-centre reference rows'
);
reset role;

select is(
  has_function_privilege('anon','public.list_dnea_readiness_scope(date)','EXECUTE'),
  false,
  'anonymous role cannot execute the DNEA network review surface'
);

select * from finish();
rollback;
