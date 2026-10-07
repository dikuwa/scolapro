begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('11450000-0000-4000-8000-000000000001','issue1145-admin@example.test','authenticated','authenticated',now(),now()),
  ('11450000-0000-4000-8000-000000000002','issue1145-staff@example.test','authenticated','authenticated',now(),now());

set local session_replication_role = replica;

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values
  ('11451000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','11450000-0000-4000-8000-000000000002','EMP-1145','Role','Tester','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id
)
values
  ('11452000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','11451000-0000-4000-8000-000000000001','teacher',current_date-30,'11450000-0000-4000-8000-000000000001');

insert into public.school_memberships(
  id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from
)
values
  ('11453000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','11450000-0000-4000-8000-000000000001',null,'school_admin',current_date-30),
  ('11453000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','11450000-0000-4000-8000-000000000002','11451000-0000-4000-8000-000000000001','hod',current_date-7);

set local session_replication_role = origin;

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','11450000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.end_staff_school_role(
    '22222222-2222-4222-8222-222222222222',
    '11453000-0000-4000-8000-000000000002'
  )$$,
  'default staff role end revokes access immediately'
);

select is(
  (select active_to from public.school_memberships where id='11453000-0000-4000-8000-000000000002'),
  current_date - 1,
  'revoked role stores yesterday as its inclusive last active day'
);

select is(
  (
    select count(*)::integer
    from public.school_memberships
    where id='11453000-0000-4000-8000-000000000002'
      and active_from<=current_date
      and (active_to is null or active_to>=current_date)
  ),
  0,
  'canonical current-date authorization predicate no longer honors the revoked role'
);

select is(
  (
    select jsonb_array_length(active_roles)
    from public.list_staff_access_directory_page(
      '22222222-2222-4222-8222-222222222222',null,1,50
    )
    where staff_id='11451000-0000-4000-8000-000000000001'
  ),
  0,
  'staff directory no longer returns the revoked role'
);

select lives_ok(
  $$select public.add_staff_school_role(
    '22222222-2222-4222-8222-222222222222',
    '11451000-0000-4000-8000-000000000001',
    'hod',
    current_date
  )$$,
  'the same role can be granted again after immediate revocation'
);

select is(
  (
    select count(*)::integer
    from public.school_memberships
    where staff_member_id='11451000-0000-4000-8000-000000000001'
      and role_key='hod'
  ),
  2,
  'revocation preserves the historical membership row'
);

select lives_ok(
  $$select public.end_staff_school_role(
    '22222222-2222-4222-8222-222222222222',
    (
      select id
      from public.school_memberships
      where staff_member_id='11451000-0000-4000-8000-000000000001'
        and role_key='hod'
        and active_from=current_date
      order by created_at desc
      limit 1
    )
  )$$,
  'a role granted and revoked on the same day is retained without remaining active'
);

select is(
  (
    select count(*)::integer
    from public.school_memberships
    where staff_member_id='11451000-0000-4000-8000-000000000001'
      and role_key='hod'
      and active_from<=current_date
      and (active_to is null or active_to>=current_date)
  ),
  0,
  'same-day grant and revoke leaves no current authorization'
);

select * from finish();
rollback;
