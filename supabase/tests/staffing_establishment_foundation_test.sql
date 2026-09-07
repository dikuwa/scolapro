begin;

select plan(21);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fd000000-0000-4000-8000-000000000001','n13-manager-a@example.test','authenticated','authenticated',now(),now()),
('fd000000-0000-4000-8000-000000000002','n13-hod-a@example.test','authenticated','authenticated',now(),now()),
('fd000000-0000-4000-8000-000000000003','n13-manager-b@example.test','authenticated','authenticated',now(),now()),
('fd000000-0000-4000-8000-000000000004','n13-staff-a@example.test','authenticated','authenticated',now(),now()),
('fd000000-0000-4000-8000-000000000005','n13-staff-b@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values('fd100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','N13 Second School','N13-B','Erongo','Walvis Bay','active');

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
('fd200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd000000-0000-4000-8000-000000000004','N13-A-STAFF','N13','Occupant A','active'),
('fd200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fd000000-0000-4000-8000-000000000005','N13-B-STAFF','N13','Occupant B','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd000000-0000-4000-8000-000000000001','school_admin','2026-01-01'),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd000000-0000-4000-8000-000000000002','hod','2026-01-01'),
('11111111-1111-4111-8111-111111111111','fd100000-0000-4000-8000-000000000002','fd000000-0000-4000-8000-000000000003','school_admin','2026-01-01');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id
) values
('fd300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd200000-0000-4000-8000-000000000001','staff','2026-01-01','fd000000-0000-4000-8000-000000000001'),
('fd300000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fd100000-0000-4000-8000-000000000002','fd200000-0000-4000-8000-000000000002','staff','2026-01-01','fd000000-0000-4000-8000-000000000003');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.create_staffing_establishment_post(
      '22222222-2222-4222-8222-222222222222','Vacant Science Post','2026-01-01',null,null,null,null
    )$$,
  'school management can create an approved unoccupied establishment post'
);

select is(
  (select vacancy_state from public.staffing_establishment_as_of('22222222-2222-4222-8222-222222222222','2026-03-01') where title='Vacant Science Post'),
  'vacant',
  'unoccupied approved post is derived as vacant'
);

select lives_ok(
  $$select public.create_staffing_establishment_post(
      '22222222-2222-4222-8222-222222222222','Filled Science Post','2026-01-01',null,null,null,null
    )$$,
  'second approved establishment post can be created independently of staff identity'
);

select lives_ok(
  $$select public.occupy_staffing_establishment_post(
      (select id from public.staffing_establishment_posts where title='Filled Science Post'),
      'fd300000-0000-4000-8000-000000000001','2026-02-01',null
    )$$,
  'authoritative school placement can occupy an approved post'
);

select is(
  (select vacancy_state from public.staffing_establishment_as_of('22222222-2222-4222-8222-222222222222','2026-03-01') where title='Filled Science Post'),
  'filled',
  'filled state is derived from effective occupancy'
);

select throws_ok(
  $$select public.occupy_staffing_establishment_post(
      (select id from public.staffing_establishment_posts where title='Filled Science Post'),
      'fd300000-0000-4000-8000-000000000001','2026-03-01',null
    )$$,
  'Staffing establishment post already has an overlapping occupant',
  'conflicting post occupancy intervals are rejected'
);

select lives_ok(
  $$select public.end_staffing_post_occupancy(
      (select id from public.staffing_post_occupancies o join public.staffing_establishment_posts p on p.id=o.post_id where p.title='Filled Science Post'),
      '2026-06-30'
    )$$,
  'occupancy can be ended without deleting its history'
);

select ok(
  exists(
    select 1 from public.staffing_post_occupancies o
    join public.staffing_establishment_posts p on p.id=o.post_id
    where p.title='Filled Science Post' and o.effective_from='2026-02-01' and o.effective_to='2026-06-30'
  ),
  'ended occupancy remains reproducible as an effective-dated historical row'
);

select is(
  (select vacancy_state from public.staffing_establishment_as_of('22222222-2222-4222-8222-222222222222','2026-03-15') where title='Filled Science Post'),
  'filled',
  'historical as-of state remains filled inside the occupancy interval'
);

select is(
  (select vacancy_state from public.staffing_establishment_as_of('22222222-2222-4222-8222-222222222222','2026-07-01') where title='Filled Science Post'),
  'vacant',
  'post returns to derived vacancy after occupancy ends'
);

select is(
  (select count(*)::integer from public.staff_members where id in ('fd200000-0000-4000-8000-000000000001','fd200000-0000-4000-8000-000000000002')),
  1,
  'staffing occupancy does not duplicate staff identities and school scope hides unrelated identity'
);

select ok(
  (select count(*)>=4 from public.audit_events
   where school_id='22222222-2222-4222-8222-222222222222'
     and event_type in ('staffing.establishment_post.created','staffing.post_occupancy.created','staffing.post_occupancy.ended')),
  'governed establishment and occupancy mutations emit audit events'
);

select ok(
  not has_table_privilege('authenticated','public.staffing_establishment_posts','INSERT')
  and not has_table_privilege('authenticated','public.staffing_establishment_posts','UPDATE')
  and not has_table_privilege('authenticated','public.staffing_establishment_posts','DELETE')
  and not has_table_privilege('authenticated','public.staffing_post_occupancies','INSERT')
  and not has_table_privilege('authenticated','public.staffing_post_occupancies','UPDATE')
  and not has_table_privilege('authenticated','public.staffing_post_occupancies','DELETE'),
  'authenticated clients cannot bypass audited staffing mutation RPCs'
);

select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000002',true);

select is(
  (select count(*)::integer from public.staffing_establishment_as_of('22222222-2222-4222-8222-222222222222','2026-03-01')),
  2,
  'HOD leadership can read non-sensitive establishment vacancy status'
);

select is(
  (select count(*)::integer from public.staffing_post_occupancies),
  0,
  'HOD cannot enumerate named occupancy records'
);

select throws_ok(
  $$select public.create_staffing_establishment_post(
      '22222222-2222-4222-8222-222222222222','Unauthorized HOD Post','2026-01-01',null,null,null,null
    )$$,
  'Permission denied',
  'HOD read authority does not grant staffing management writes'
);

select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000003',true);

select throws_ok(
  $$select * from public.staffing_establishment_as_of('22222222-2222-4222-8222-222222222222','2026-03-01')$$,
  'Permission denied',
  'leadership from another school cannot enumerate establishment status'
);

select throws_ok(
  $$select public.create_staffing_establishment_post(
      '22222222-2222-4222-8222-222222222222','Cross-school Post','2026-01-01',null,null,null,null
    )$$,
  'Permission denied',
  'cross-school staffing post writes are denied'
);

select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);

select throws_ok(
  $$select public.occupy_staffing_establishment_post(
      (select id from public.staffing_establishment_posts where title='Vacant Science Post'),
      'fd300000-0000-4000-8000-000000000002','2026-03-01',null
    )$$,
  'Staffing occupancy post and staff placement must belong to the same school and tenant',
  'cross-school staff placement cannot occupy a local establishment post'
);

select ok(
  exists(select 1 from public.staffing_establishment_posts where title='Vacant Science Post' and external_identifier is null and external_identifier_source is null),
  'external post identifiers remain nullable until an authoritative source is supplied'
);

select ok(
  not has_table_privilege('anon','public.staffing_establishment_posts','SELECT')
  and not has_table_privilege('anon','public.staffing_post_occupancies','SELECT')
  and not has_function_privilege('anon','public.staffing_establishment_as_of(uuid,date)','EXECUTE')
  and not has_function_privilege('anon','public.occupy_staffing_establishment_post(uuid,uuid,date,date)','EXECUTE'),
  'anonymous users have no staffing establishment or occupancy access'
);

select * from finish();
rollback;
