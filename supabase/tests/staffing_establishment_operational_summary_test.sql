begin;

select plan(17);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fc000000-0000-4000-8000-000000000001','n14-manager@example.test','authenticated','authenticated',now(),now()),
('fc000000-0000-4000-8000-000000000002','n14-hod@example.test','authenticated','authenticated',now(),now()),
('fc000000-0000-4000-8000-000000000003','n14-teacher@example.test','authenticated','authenticated',now(),now()),
('fc000000-0000-4000-8000-000000000004','n14-other-school@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values('fc100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','N14 Other School','N14-OTHER','Erongo','Walvis Bay','active');

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status) values
('fc200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','N14-STAFF-1','N14','Staff One','active'),
('fc200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','N14-STAFF-2','N14','Staff Two','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000001','school_admin','2026-01-01'),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000002','hod','2026-01-01'),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000003','teacher','2026-01-01'),
('11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000002','fc000000-0000-4000-8000-000000000004','school_admin','2026-01-01');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id
) values
('fc300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc200000-0000-4000-8000-000000000001','staff','2026-01-01','fc000000-0000-4000-8000-000000000001'),
('fc300000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc200000-0000-4000-8000-000000000002','staff','2026-01-01','fc000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.create_staffing_establishment_post(
    '22222222-2222-4222-8222-222222222222','N14 Science Post','2026-01-01',null,null,null,null
  )$$,
  'manager can create first N13 establishment fact used by N14 reporting'
);

select lives_ok(
  $$select public.create_staffing_establishment_post(
    '22222222-2222-4222-8222-222222222222','N14 Mathematics Post','2026-01-01',null,null,null,null
  )$$,
  'manager can create second N13 establishment fact used by N14 reporting'
);

select lives_ok(
  $$select public.occupy_staffing_establishment_post(
    (select id from public.staffing_establishment_posts where title='N14 Science Post'),
    'fc300000-0000-4000-8000-000000000001','2026-02-01','2026-06-30'
  )$$,
  'manager can link authoritative placement to one establishment post'
);

select is(
  (select establishment_posts from public.staffing_establishment_summary_as_of('22222222-2222-4222-8222-222222222222','2026-01-15')),
  2,
  'as-of summary counts approved establishment posts before occupancy begins'
);

select is(
  (select occupied_posts from public.staffing_establishment_summary_as_of('22222222-2222-4222-8222-222222222222','2026-01-15')),
  0,
  'as-of summary does not count future occupancy early'
);

select is(
  (select vacant_posts from public.staffing_establishment_summary_as_of('22222222-2222-4222-8222-222222222222','2026-03-01')),
  1,
  'vacancy count is derived from effective establishment minus occupied posts'
);

select is(
  (select occupied_posts from public.staffing_establishment_summary_as_of('22222222-2222-4222-8222-222222222222','2026-03-01')),
  1,
  'occupied count is derived from effective N13 occupancy'
);

select is(
  (select active_staff_placements from public.staffing_establishment_summary_as_of('22222222-2222-4222-8222-222222222222','2026-03-01')),
  2,
  'summary reconciles against authoritative effective staff placements'
);

select is(
  (select linked_staff_placements from public.staffing_establishment_summary_as_of('22222222-2222-4222-8222-222222222222','2026-03-01')),
  1,
  'summary counts authoritative placements linked to effective establishment occupancy'
);

select is(
  (select unlinked_staff_placements from public.staffing_establishment_summary_as_of('22222222-2222-4222-8222-222222222222','2026-03-01')),
  1,
  'summary exposes aggregate reconciliation gap without naming staff'
);

select is(
  (select occupied_posts from public.staffing_establishment_summary_as_of('22222222-2222-4222-8222-222222222222','2026-07-01')),
  0,
  'historical as-of summary reflects ended occupancy'
);

select is(
  (select vacant_posts from public.staffing_establishment_summary_as_of('22222222-2222-4222-8222-222222222222','2026-07-01')),
  2,
  'historical as-of summary restores vacancies after occupancy ends'
);

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000002',true);

select is(
  (select occupied_posts from public.staffing_establishment_summary_as_of('22222222-2222-4222-8222-222222222222','2026-03-01')),
  1,
  'HOD can read safe aggregate staffing reconciliation'
);

select is(
  (select count(*)::integer from public.staffing_post_occupancies),
  0,
  'aggregate visibility does not let HOD enumerate named occupancy records'
);

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000003',true);

select throws_ok(
  $$select * from public.staffing_establishment_summary_as_of('22222222-2222-4222-8222-222222222222','2026-03-01')$$,
  'Permission denied',
  'ordinary teacher cannot enumerate staffing establishment aggregates'
);

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000004',true);

select throws_ok(
  $$select * from public.staffing_establishment_summary_as_of('22222222-2222-4222-8222-222222222222','2026-03-01')$$,
  'Permission denied',
  'other-school leadership cannot read school staffing aggregates'
);

select ok(
  not has_function_privilege('anon','public.staffing_establishment_summary_as_of(uuid,date)','EXECUTE')
  and has_function_privilege('authenticated','public.staffing_establishment_summary_as_of(uuid,date)','EXECUTE'),
  'aggregate function is unavailable anonymously and exposed only through authenticated authorization checks'
);

select * from finish();
rollback;
