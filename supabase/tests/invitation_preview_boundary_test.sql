begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('f9700000-0000-4000-8000-000000000001','invite-boundary-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'f9700000-0000-4000-8000-000000000001',
  'school_admin',
  current_date
);

insert into public.school_invitations(
  id,tenant_id,school_id,email,first_name,last_name,role_key,token_hash,status,invited_by_user_id,expires_at
) values
  ('f9710000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','valid-invite@example.test','Valid','Invite','teacher',encode(extensions.digest('valid-preview-token','sha256'),'hex'),'pending','f9700000-0000-4000-8000-000000000001',now()+interval '1 day'),
  ('f9710000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','expired-invite@example.test','Expired','Invite','teacher',encode(extensions.digest('expired-preview-token','sha256'),'hex'),'pending','f9700000-0000-4000-8000-000000000001',now()-interval '1 minute'),
  ('f9710000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','revoked-invite@example.test','Revoked','Invite','teacher',encode(extensions.digest('revoked-preview-token','sha256'),'hex'),'pending','f9700000-0000-4000-8000-000000000001',now()+interval '1 day');

update public.school_invitations
set status='revoked'
where id='f9710000-0000-4000-8000-000000000003';

select ok(has_function_privilege('anon','public.get_school_invitation_preview(text)','EXECUTE'),'anonymous join screen intentionally may call invitation preview');
select ok(
  not exists(
    select 1 from information_schema.routine_privileges
    where specific_schema='public'
      and routine_name='get_school_invitation_preview'
      and grantee='PUBLIC'
      and privilege_type='EXECUTE'
  ),
  'PUBLIC does not receive invitation preview execution'
);

set local role anon;

select is((select count(*)::integer from public.get_school_invitation_preview('valid-preview-token')),1,'valid possession token resolves one pending invitation');
select is((select email from public.get_school_invitation_preview('valid-preview-token')),'valid-invite@example.test','preview returns the intended invitation identity');
select is((select count(*)::integer from public.get_school_invitation_preview('wrong-preview-token')),0,'unknown token reveals no invitation');
select is((select count(*)::integer from public.get_school_invitation_preview('expired-preview-token')),0,'expired token reveals no invitation');
select is((select count(*)::integer from public.get_school_invitation_preview('revoked-preview-token')),0,'revoked token reveals no invitation');

reset role;
select * from finish();
rollback;
