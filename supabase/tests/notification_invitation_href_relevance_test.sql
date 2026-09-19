begin;

select plan(8);

insert into public.tenants(id,name,slug)
values('d2800000-0000-4000-8000-000000000001','Notification QA Tenant','notification-qa-tenant');

insert into public.schools(id,tenant_id,name,emis_number,status) values
  ('d2810000-0000-4000-8000-000000000001','d2800000-0000-4000-8000-000000000001','Notification QA School A','NQA-A','active'),
  ('d2810000-0000-4000-8000-000000000002','d2800000-0000-4000-8000-000000000001','Notification QA School B','NQA-B','active');

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('d2820000-0000-4000-8000-000000000001','school-inviter@example.test','authenticated','authenticated',now(),now()),
  ('d2820000-0000-4000-8000-000000000002','platform-inviter@example.test','authenticated','authenticated',now(),now()),
  ('d2820000-0000-4000-8000-000000000003','stale-inviter@example.test','authenticated','authenticated',now(),now()),
  ('d2820000-0000-4000-8000-000000000004','accepted-one@example.test','authenticated','authenticated',now(),now()),
  ('d2820000-0000-4000-8000-000000000005','accepted-two@example.test','authenticated','authenticated',now(),now()),
  ('d2820000-0000-4000-8000-000000000006','accepted-three@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(id,tenant_id,school_id,user_id,role_key,active_from) values
  ('d2830000-0000-4000-8000-000000000001','d2800000-0000-4000-8000-000000000001','d2810000-0000-4000-8000-000000000001','d2820000-0000-4000-8000-000000000001','school_admin',current_date-10),
  ('d2830000-0000-4000-8000-000000000002','d2800000-0000-4000-8000-000000000001','d2810000-0000-4000-8000-000000000001','d2820000-0000-4000-8000-000000000003','school_admin',current_date-20),
  ('d2830000-0000-4000-8000-000000000003','d2800000-0000-4000-8000-000000000001','d2810000-0000-4000-8000-000000000002','d2820000-0000-4000-8000-000000000003','school_admin',current_date-1);

insert into public.platform_memberships(user_id,role_key,active_from)
values('d2820000-0000-4000-8000-000000000002','platform_admin',current_date-10);

insert into public.school_invitations(
  id,tenant_id,school_id,email,role_key,token_hash,status,invited_by_user_id,expires_at
) values
  ('d2840000-0000-4000-8000-000000000001','d2800000-0000-4000-8000-000000000001','d2810000-0000-4000-8000-000000000001','accepted-one@example.test','teacher','qa-token-1','pending','d2820000-0000-4000-8000-000000000001',now()+interval '1 day'),
  ('d2840000-0000-4000-8000-000000000002','d2800000-0000-4000-8000-000000000001','d2810000-0000-4000-8000-000000000001','accepted-two@example.test','school_admin','qa-token-2','pending','d2820000-0000-4000-8000-000000000002',now()+interval '1 day'),
  ('d2840000-0000-4000-8000-000000000003','d2800000-0000-4000-8000-000000000001','d2810000-0000-4000-8000-000000000001','accepted-three@example.test','teacher','qa-token-3','pending','d2820000-0000-4000-8000-000000000003',now()+interval '1 day');

select lives_ok(
  $$update public.school_invitations
    set status='accepted',accepted_at=now(),accepted_user_id='d2820000-0000-4000-8000-000000000004'
    where id='d2840000-0000-4000-8000-000000000001'$$,
  'school-admin invitation acceptance is not blocked by notification creation'
);

select is(
  (select href from public.notifications
   where recipient_user_id='d2820000-0000-4000-8000-000000000001'
     and title='School invitation accepted'
   order by created_at desc limit 1),
  '/school/invitations',
  'current school admin receives the school-local invitation route'
);

select lives_ok(
  $$update public.school_invitations
    set status='accepted',accepted_at=now(),accepted_user_id='d2820000-0000-4000-8000-000000000005'
    where id='d2840000-0000-4000-8000-000000000002'$$,
  'platform-admin invitation acceptance is not blocked by notification creation'
);

select is(
  (select href from public.notifications
   where recipient_user_id='d2820000-0000-4000-8000-000000000002'
     and title='School invitation accepted'
   order by created_at desc limit 1),
  '/platform/invitations',
  'platform admin retains the platform invitation route'
);

select lives_ok(
  $$update public.school_invitations
    set status='accepted',accepted_at=now(),accepted_user_id='d2820000-0000-4000-8000-000000000006'
    where id='d2840000-0000-4000-8000-000000000003'$$,
  'stale inviter does not block invitation acceptance'
);

select is(
  (select count(*)::integer from public.notifications
   where recipient_user_id='d2820000-0000-4000-8000-000000000003'
     and title='School invitation accepted'),
  0,
  'non-current school admin is not given an actionable stale-school notification'
);

select is(
  (select count(*)::integer from public.school_invitations where status='accepted'),
  3,
  'notification relevance does not rewrite or suppress accepted invitation history'
);

select ok(
  not has_function_privilege('authenticated','public.notify_school_invitation_status_change()','EXECUTE')
  and not has_function_privilege('anon','public.notify_school_invitation_status_change()','EXECUTE'),
  'notification producer remains trigger-only for client roles'
);

select * from finish();
rollback;
