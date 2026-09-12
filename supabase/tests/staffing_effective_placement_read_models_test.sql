begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('ce000000-0000-4000-8000-000000000001','staffing-placement-manager@example.test','authenticated','authenticated',now(),now()),
  ('ce000000-0000-4000-8000-000000000002','staffing-placement-region@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug,status)
values('ce100000-0000-4000-8000-000000000001','Staffing placement audit tenant','staffing-placement-audit','active');

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values('ce110000-0000-4000-8000-000000000001','ce100000-0000-4000-8000-000000000001','Staffing Placement Audit School','SPA-001','Audit Region','Audit Town','active');

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values('ce120000-0000-4000-8000-000000000001','ce100000-0000-4000-8000-000000000001','SPA-STAFF-1','Placement','Occupant','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('ce100000-0000-4000-8000-000000000001','ce110000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000001','school_admin','2026-01-01');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id
) values(
  'ce130000-0000-4000-8000-000000000001','ce100000-0000-4000-8000-000000000001','ce110000-0000-4000-8000-000000000001',
  'ce120000-0000-4000-8000-000000000001','staff','2026-01-01','ce000000-0000-4000-8000-000000000001'
);

insert into public.education_authorities(id,name)
values('ce140000-0000-4000-8000-000000000001','Staffing Placement Audit Authority');
insert into public.education_regions(id,name)
values('ce141000-0000-4000-8000-000000000001','Staffing Placement Audit Region');
insert into public.education_circuits(id,name)
values('ce142000-0000-4000-8000-000000000001','Staffing Placement Audit Circuit');
insert into public.education_region_authority_history(id,region_id,authority_id,effective_from)
values('ce143000-0000-4000-8000-000000000001','ce141000-0000-4000-8000-000000000001','ce140000-0000-4000-8000-000000000001','2020-01-01');
insert into public.education_circuit_region_history(id,circuit_id,region_id,effective_from)
values('ce144000-0000-4000-8000-000000000001','ce142000-0000-4000-8000-000000000001','ce141000-0000-4000-8000-000000000001','2020-01-01');
insert into public.school_network_assignments(id,school_id,authority_id,region_id,circuit_id,effective_from)
values(
  'ce145000-0000-4000-8000-000000000001','ce110000-0000-4000-8000-000000000001','ce140000-0000-4000-8000-000000000001',
  'ce141000-0000-4000-8000-000000000001','ce142000-0000-4000-8000-000000000001','2020-01-01'
);
insert into public.education_network_memberships(id,user_id,role_key,region_id,circuit_id,active_from)
values(
  'ce146000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000002','regional_officer',
  'ce141000-0000-4000-8000-000000000001',null,'2026-01-01'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ce000000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.create_staffing_establishment_post(
    'ce110000-0000-4000-8000-000000000001','Audit Science Post','2026-01-01',null,null,null,null
  )$$,
  'manager creates establishment post'
);

select lives_ok(
  $$select public.occupy_staffing_establishment_post(
    (select id from public.staffing_establishment_posts where school_id='ce110000-0000-4000-8000-000000000001' and title='Audit Science Post'),
    'ce130000-0000-4000-8000-000000000001','2026-02-01',null
  )$$,
  'effective authoritative placement occupies post'
);

select is(
  (select vacancy_state from public.staffing_establishment_as_of('ce110000-0000-4000-8000-000000000001','2026-05-01')),
  'filled',
  'school establishment is filled while authoritative placement is effective'
);

reset role;
update public.staff_school_assignments
set effective_to='2026-06-30'
where id='ce130000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ce000000-0000-4000-8000-000000000001',true);

select is(
  (select vacancy_state from public.staffing_establishment_as_of('ce110000-0000-4000-8000-000000000001','2026-07-01')),
  'vacant',
  'ended authoritative placement makes still-open occupancy vacant'
);
select is(
  (select occupied_posts from public.staffing_establishment_summary_as_of('ce110000-0000-4000-8000-000000000001','2026-07-01')),
  0,
  'school aggregate excludes occupancy after authoritative placement ends'
);
select is(
  (select vacant_posts from public.staffing_establishment_summary_as_of('ce110000-0000-4000-8000-000000000001','2026-07-01')),
  1,
  'school aggregate restores vacancy after authoritative placement ends'
);
select is(
  (select active_staff_placements from public.staffing_establishment_summary_as_of('ce110000-0000-4000-8000-000000000001','2026-07-01')),
  0,
  'school aggregate has no active placement after placement end'
);

select set_config('request.jwt.claim.sub','ce000000-0000-4000-8000-000000000002',true);
select is(
  (select occupied_posts from public.network_operational_summary_as_of('2026-07-01')),
  0::bigint,
  'network staffing aggregate excludes occupancy after authoritative placement ends'
);
select is(
  (select vacant_posts from public.network_operational_summary_as_of('2026-07-01')),
  1::bigint,
  'network staffing aggregate restores vacancy after authoritative placement ends'
);
select is(
  (select active_staff_placements from public.network_operational_summary_as_of('2026-07-01')),
  0::bigint,
  'network staffing aggregate reflects ended authoritative placement'
);

select * from finish();
rollback;
