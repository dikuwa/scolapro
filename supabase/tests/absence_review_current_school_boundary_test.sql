begin;

select plan(2);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values ('af700000-0000-4000-8000-000000000001','absence-current-school@example.test','authenticated','authenticated',now(),now());

-- The canonical seeded school has register classes. Start with it as the actor's only
-- active school so the existing school-admin absence-review behavior is proven first.
insert into public.school_memberships(
  id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from
) values (
  'af710000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'af700000-0000-4000-8000-000000000001',
  null,
  'school_admin',
  current_date - 10
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','af700000-0000-4000-8000-000000000001',true);

select ok(
  exists(
    select 1
    from public.resolve_absence_review_scope(
      '22222222-2222-4222-8222-222222222222',
      current_date - 7,
      current_date
    )
    where scope_kind='daily_class'
  ),
  'single-school administrator retains school-wide daily absence review scope'
);

-- A later active membership is the deterministic current school under PR #411.
-- The actor deliberately keeps school_admin at the older school: before this fix,
-- direct SECURITY DEFINER invocation could still resolve the older school's classes.
insert into public.schools(id,tenant_id,name,emis_number,status) values (
  'af720000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Absence Current School B',
  'TST-ABS-CURRENT-B',
  'active'
);

insert into public.school_memberships(
  id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from
) values (
  'af710000-0000-4000-8000-000000000002',
  '11111111-1111-4111-8111-111111111111',
  'af720000-0000-4000-8000-000000000001',
  'af700000-0000-4000-8000-000000000001',
  null,
  'school_admin',
  current_date
);

select is(
  (
    select count(*)::integer
    from public.resolve_absence_review_scope(
      '22222222-2222-4222-8222-222222222222',
      current_date - 7,
      current_date
    )
  ),
  0,
  'direct absence review resolver cannot borrow authority from a non-current active school membership'
);

select * from finish();
rollback;
