begin;

select plan(5);

select ok(
  has_function_privilege(
    'authenticated',
    'app_private.can_review_guardian_absence_notice(uuid)',
    'EXECUTE'
  ),
  'authenticated can execute the guardian absence review policy helper'
);

select ok(
  not has_function_privilege(
    'anon',
    'app_private.can_review_guardian_absence_notice(uuid)',
    'EXECUTE'
  ),
  'anon remains denied guardian absence review policy helper execution'
);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('ab900000-0000-4000-8000-000000000001','absence-review-runtime-admin@example.test','authenticated','authenticated',now(),now()),
  ('ab900000-0000-4000-8000-000000000002','absence-review-runtime-support@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(
  tenant_id,school_id,user_id,role_key,active_from
) values (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'ab900000-0000-4000-8000-000000000001',
  'school_admin',
  current_date
);

insert into public.platform_memberships(user_id,role_key,active_from) values (
  'ab900000-0000-4000-8000-000000000002',
  'platform_support',
  current_date
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ab900000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select count(*) from public.guardian_absence_notices
    where school_id='22222222-2222-4222-8222-222222222222'::uuid$$,
  'current-school administrator can evaluate guardian absence notice RLS without a function permission error'
);

select lives_ok(
  $$select count(*) from public.guardian_absence_notice_attachments$$,
  'guardian absence attachment RLS can evaluate the same review helper without a function permission error'
);

select set_config('request.jwt.claim.sub','ab900000-0000-4000-8000-000000000002',true);

select is(
  (select count(*) from public.guardian_absence_notices),
  0::bigint,
  'Platform Support receives no guardian absence notice rows after policy execution is restored'
);

select * from finish();
rollback;