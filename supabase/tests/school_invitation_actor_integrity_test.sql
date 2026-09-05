begin;

select plan(12);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fd600000-0000-4000-8000-000000000001','invitation-admin@example.test','authenticated','authenticated',now(),now()),
  ('fd600000-0000-4000-8000-000000000002','invitation-recipient@example.test','authenticated','authenticated',now(),now()),
  ('fd600000-0000-4000-8000-000000000003','invitation-outsider@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fd600000-0000-4000-8000-000000000001',
  'school_admin',
  current_date
);

select throws_ok(
  $$insert into public.school_invitations(tenant_id,school_id,email,role_key,token_hash,invited_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','invitation-recipient@example.test','teacher','invitation-forged-inviter','fd600000-0000-4000-8000-000000000003')$$,
  'School invitation inviter is not authorized for school',
  'trusted write cannot forge an unrelated invitation creator'
);

select throws_ok(
  $$insert into public.school_invitations(tenant_id,school_id,email,role_key,token_hash,status,invited_by_user_id,accepted_user_id,accepted_at)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','invitation-recipient@example.test','teacher','invitation-preaccepted','accepted','fd600000-0000-4000-8000-000000000001','fd600000-0000-4000-8000-000000000002',now())$$,
  'School invitations must be created pending without acceptance provenance',
  'trusted write cannot manufacture a pre-accepted invitation'
);

select lives_ok(
  $$insert into public.school_invitations(id,tenant_id,school_id,email,role_key,token_hash,status,invited_by_user_id,expires_at)
    values('fd610000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','invitation-recipient@example.test','teacher','invitation-canonical','pending','fd600000-0000-4000-8000-000000000001',now()+interval '7 days')$$,
  'authorized school admin can create a canonical pending invitation'
);

select throws_ok(
  $$update public.school_invitations set invited_by_user_id='fd600000-0000-4000-8000-000000000003' where id='fd610000-0000-4000-8000-000000000001'$$,
  'School invitation inviter provenance is immutable',
  'inviter provenance cannot be rewritten'
);

select throws_ok(
  $$update public.school_invitations set status='accepted' where id='fd610000-0000-4000-8000-000000000001'$$,
  'Accepted school invitation requires acceptance provenance',
  'acceptance requires actor and timestamp provenance'
);

select throws_ok(
  $$update public.school_invitations set status='accepted',accepted_user_id='fd600000-0000-4000-8000-000000000003',accepted_at=now() where id='fd610000-0000-4000-8000-000000000001'$$,
  'School invitation accepted user does not own invited email',
  'trusted acceptance cannot forge a different email owner'
);

select lives_ok(
  $$update public.school_invitations set status='accepted',accepted_user_id='fd600000-0000-4000-8000-000000000002',accepted_at=now() where id='fd610000-0000-4000-8000-000000000001'$$,
  'matching invited account can be recorded as the accepting user'
);

select throws_ok(
  $$update public.school_invitations set accepted_user_id='fd600000-0000-4000-8000-000000000003' where id='fd610000-0000-4000-8000-000000000001'$$,
  'Accepted school invitation provenance is immutable',
  'accepted user provenance cannot be rewritten'
);

select lives_ok(
  $$insert into public.school_invitations(id,tenant_id,school_id,email,role_key,token_hash,status,invited_by_user_id,expires_at)
    values('fd610000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','unused@example.test','teacher','invitation-revoke','pending','fd600000-0000-4000-8000-000000000001',now()+interval '7 days');
    update public.school_invitations set status='revoked' where id='fd610000-0000-4000-8000-000000000002'$$,
  'pending invitation can still move to revoked without acceptance provenance'
);

select throws_ok(
  $$insert into public.school_invitations(id,tenant_id,school_id,email,role_key,token_hash,status,invited_by_user_id,expires_at)
    values('fd610000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','expired-recipient@example.test','teacher','invitation-expired-accept','pending','fd600000-0000-4000-8000-000000000001',now()-interval '1 day');
    update public.school_invitations set status='accepted',accepted_user_id='fd600000-0000-4000-8000-000000000002',accepted_at=now() where id='fd610000-0000-4000-8000-000000000003'$$,
  'Expired school invitation cannot be accepted',
  'trusted write cannot accept an expired pending invitation'
);

select ok(
  not has_function_privilege('authenticated','app_private.user_can_manage_school_invitation(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_can_manage_school_invitation(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.user_owns_school_invitation_email(uuid,text)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_owns_school_invitation_email(uuid,text)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_school_invitation_actor_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_school_invitation_actor_integrity()','EXECUTE'),
  'school invitation arbitrary-user and trigger helpers remain private'
);

select is(
  (select count(*)::integer from pg_catalog.pg_trigger
   where tgname='school_invitation_actor_integrity_trg'
     and not tgisinternal),
  1,
  'school invitation actor integrity trigger is installed once'
);

select * from finish();
rollback;
