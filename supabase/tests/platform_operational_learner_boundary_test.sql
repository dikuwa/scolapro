begin;

select plan(1);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fa000000-0000-4000-8000-000000000001','platform-only-learner-boundary@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key,active_from)
values('fa000000-0000-4000-8000-000000000001','platform_admin',current_date);

select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select throws_ok(
  $$select * from public.search_operational_learner_directory('22222222-2222-4222-8222-222222222222',null,30)$$,
  'Permission denied',
  'platform administration authority alone does not grant operational learner-directory visibility'
);

select * from finish();
rollback;
