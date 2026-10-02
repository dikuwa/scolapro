begin;

select plan(4);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fb100000-0000-4000-8000-000000000001','governance-platform@example.test','authenticated','authenticated',now(),now()),
  ('fb100000-0000-4000-8000-000000000002','governance-school@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key,active_from)
values('fb100000-0000-4000-8000-000000000001','platform_admin',current_date-1);

insert into public.curriculum_sources(
  id,authority,source_key,title,source_url,checksum,provenance,status
) values(
  'fb110000-0000-4000-8000-000000000001',
  'NIED',
  'governance-withdrawn-source',
  'Governance withdrawn source',
  'https://example.test/governance-source.pdf',
  'sha256:governance-source',
  '{"locator":"governance fixture"}'::jsonb,
  'withdrawn'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb100000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  (select count(*) from public.curriculum_sources where id='fb110000-0000-4000-8000-000000000001'),
  1::bigint,
  'platform admin can review withdrawn curriculum source evidence'
);

reset role;
select set_config('request.jwt.claim.sub','fb100000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is(
  (select count(*) from public.curriculum_sources where id='fb110000-0000-4000-8000-000000000001'),
  0::bigint,
  'ordinary authenticated user cannot read withdrawn curriculum source evidence'
);

reset role;

select ok(
  exists(
    select 1 from pg_policies
    where schemaname='public'
      and tablename='curriculum_sources'
      and policyname='platform admins read all curriculum sources'
      and cmd='SELECT'
  ),
  'platform-admin withdrawn-source review policy is installed'
);

select ok(
  not has_table_privilege('anon','public.curriculum_sources','SELECT'),
  'anonymous role retains no direct curriculum-source table read privilege'
);

select * from finish();
rollback;
