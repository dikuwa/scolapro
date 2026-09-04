begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('ca700000-0000-4000-8000-000000000001','comm-author-valid@example.test','authenticated','authenticated',now(),now()),
  ('ca700000-0000-4000-8000-000000000002','comm-author-unrelated@example.test','authenticated','authenticated',now(),now()),
  ('ca700000-0000-4000-8000-000000000003','comm-author-expired@example.test','authenticated','authenticated',now(),now()),
  ('ca700000-0000-4000-8000-000000000004','comm-author-platform@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from,active_to)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ca700000-0000-4000-8000-000000000001','teacher',current_date,null),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ca700000-0000-4000-8000-000000000003','teacher',current_date-10,current_date-1);

insert into public.platform_memberships(user_id,role_key,active_from,active_to)
values('ca700000-0000-4000-8000-000000000004','platform_admin',current_date,null);

select throws_ok(
  $$insert into public.communication_messages(tenant_id,school_id,channel,body,audience_type,status,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','email','Unrelated author','individual','draft','ca700000-0000-4000-8000-000000000002')$$,
  'Communication scope mismatch: author is not authorized for school',
  'unrelated account cannot be recorded as a school communication author'
);

select throws_ok(
  $$insert into public.communication_messages(tenant_id,school_id,channel,body,audience_type,status,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','email','Expired author','individual','draft','ca700000-0000-4000-8000-000000000003')$$,
  'Communication scope mismatch: author is not authorized for school',
  'expired school membership cannot originate a fresh communication'
);

select lives_ok(
  $$insert into public.communication_messages(id,tenant_id,school_id,channel,body,audience_type,status,created_by_user_id)
    values('ca710000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','email','Valid teacher author','individual','draft','ca700000-0000-4000-8000-000000000001')$$,
  'authorized school role remains a valid communication author'
);

select lives_ok(
  $$insert into public.communication_messages(id,tenant_id,school_id,channel,body,audience_type,status,created_by_user_id)
    values('ca710000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','email','Platform author','individual','draft','ca700000-0000-4000-8000-000000000004')$$,
  'active platform administrator remains a valid communication author'
);

select throws_ok(
  $$update public.communication_messages set created_by_user_id='ca700000-0000-4000-8000-000000000002' where id='ca710000-0000-4000-8000-000000000001'$$,
  'Communication message scope and author are immutable',
  'communication author cannot be rewritten after creation'
);

select is(
  (select count(*)::integer from public.communication_messages where created_by_user_id='ca700000-0000-4000-8000-000000000002'),
  0,
  'rejected unrelated author leaves no message behind'
);

select is(
  (select count(*)::integer from public.communication_messages where created_by_user_id='ca700000-0000-4000-8000-000000000003'),
  0,
  'rejected expired author leaves no message behind'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_communication_message_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_communication_message_scope_integrity()','EXECUTE'),
  'communication author integrity helper remains private from client roles'
);

select is(
  (select count(*)::integer from pg_trigger where tgrelid='public.communication_messages'::regclass and tgname='communication_message_scope_integrity_guard' and not tgisinternal),
  1,
  'communication messages retain exactly one scope-integrity trigger'
);

select * from finish();
rollback;
