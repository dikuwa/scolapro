begin;

select plan(11);

insert into public.tenants(id,name,slug) values
  ('b1000000-0000-4000-8000-000000000001','Onboarding QA Tenant','onboarding-qa');
insert into public.schools(id,tenant_id,name) values
  ('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Onboarding QA School');
insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('b3000000-0000-4000-8000-000000000001','admin-onboarding@example.test','authenticated','authenticated',now(),now()),
  ('b3000000-0000-4000-8000-000000000002','invitee-onboarding@example.test','authenticated','authenticated',now(),now()),
  ('b3000000-0000-4000-8000-000000000003','other-onboarding@example.test','authenticated','authenticated',now(),now()),
  ('b3000000-0000-4000-8000-000000000004','expired-onboarding@example.test','authenticated','authenticated',now(),now()),
  ('b3000000-0000-4000-8000-000000000005','revoked-onboarding@example.test','authenticated','authenticated',now(),now());
insert into public.school_memberships(tenant_id,school_id,user_id,role_key) values
  ('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','school_admin');

create temporary table onboarding_invites(
  kind text primary key,
  invitation_id uuid not null,
  invitation_token text not null
) on commit drop;

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b3000000-0000-4000-8000-000000000001","role":"authenticated","email":"admin-onboarding@example.test"}',true);

insert into onboarding_invites(kind,invitation_id,invitation_token)
select 'accepted',invitation_id,invitation_token
from public.create_school_invitation(
  'b2000000-0000-4000-8000-000000000001','invitee-onboarding@example.test','Existing','Staff','ONBOARD-001','teacher'
);
insert into onboarding_invites(kind,invitation_id,invitation_token)
select 'expired',invitation_id,invitation_token
from public.create_school_invitation(
  'b2000000-0000-4000-8000-000000000001','expired-onboarding@example.test','Expired','Staff',null,'teacher'
);
insert into onboarding_invites(kind,invitation_id,invitation_token)
select 'revoked',invitation_id,invitation_token
from public.create_school_invitation(
  'b2000000-0000-4000-8000-000000000001','revoked-onboarding@example.test','Revoked','Staff',null,'teacher'
);

update public.school_invitations
set expires_at=now()-interval '1 minute'
where id=(select invitation_id from onboarding_invites where kind='expired');

select lives_ok(
  format('select public.revoke_school_invitation(%L::uuid)',(select invitation_id from onboarding_invites where kind='revoked')),
  'authorized school administrator can revoke a pending invitation'
);
select ok(
  exists(select 1 from public.audit_events ae where ae.entity_id=(select invitation_id from onboarding_invites where kind='revoked') and ae.event_type='school_invitation.revoked' and ae.actor_user_id='b3000000-0000-4000-8000-000000000001'),
  'revocation preserves actor provenance'
);

select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"b3000000-0000-4000-8000-000000000005","role":"authenticated","email":"revoked-onboarding@example.test"}',true);
select throws_ok(
  format('select * from public.accept_school_invitation(%L)',(select invitation_token from onboarding_invites where kind='revoked')),
  'Invitation is invalid or no longer available',
  'revoked invitation cannot be accepted'
);

select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"b3000000-0000-4000-8000-000000000004","role":"authenticated","email":"expired-onboarding@example.test"}',true);
select throws_ok(
  format('select * from public.accept_school_invitation(%L)',(select invitation_token from onboarding_invites where kind='expired')),
  'Invitation has expired',
  'expired invitation cannot be accepted'
);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('b5000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',null,'ONBOARD-001','Existing','Staff','active');

select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"b3000000-0000-4000-8000-000000000002","role":"authenticated","email":"invitee-onboarding@example.test"}',true);
select lives_ok(
  format('select * from public.accept_school_invitation(%L)',(select invitation_token from onboarding_invites where kind='accepted')),
  'valid invitation can be accepted'
);
select lives_ok(
  format('select * from public.accept_school_invitation(%L)',(select invitation_token from onboarding_invites where kind='accepted')),
  'consumed invitation is idempotent for the same authenticated identity'
);
select is(
  (select count(*)::integer from public.school_memberships where school_id='b2000000-0000-4000-8000-000000000001' and user_id='b3000000-0000-4000-8000-000000000002' and role_key='teacher'),
  1,
  'idempotent replay does not create duplicate membership'
);
select is(
  (select count(*)::integer from public.audit_events where entity_id=(select invitation_id from onboarding_invites where kind='accepted') and event_type='school_invitation.accepted'),
  1,
  'idempotent replay does not duplicate acceptance audit provenance'
);
select ok(
  (select count(*)=1 from public.staff_members where tenant_id='b1000000-0000-4000-8000-000000000001' and upper(employee_number)='ONBOARD-001')
  and (select user_id='b3000000-0000-4000-8000-000000000002' from public.staff_members where id='b5000000-0000-4000-8000-000000000001'),
  'acceptance reuses canonical pre-existing staff identity'
);

select throws_ok(
  $$update public.school_invitations set role_key='school_admin' where id=(select invitation_id from onboarding_invites where kind='accepted')$$,
  'Accepted school invitation identity and role are immutable',
  'accepted invitation role cannot be rewritten for elevation'
);
select throws_ok(
  $$update public.school_invitations set email='other-onboarding@example.test' where id=(select invitation_id from onboarding_invites where kind='accepted')$$,
  'Accepted school invitation identity and role are immutable',
  'accepted invitation email cannot be rewritten'
);

select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"b3000000-0000-4000-8000-000000000003","role":"authenticated","email":"other-onboarding@example.test"}',true);
select throws_ok(
  format('select * from public.accept_school_invitation(%L)',(select invitation_token from onboarding_invites where kind='accepted')),
  'Invitation email does not match the signed-in account',
  'consumed invitation token cannot be replayed by another identity'
);

select * from finish();
rollback;
