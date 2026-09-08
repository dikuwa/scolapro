begin;

select plan(17);

insert into public.tenants(id,name,slug) values
  ('b1000000-0000-4000-8000-000000000001','Onboarding QA Tenant A','onboarding-qa-a'),
  ('b1000000-0000-4000-8000-000000000002','Onboarding QA Tenant B','onboarding-qa-b');

insert into public.schools(id,tenant_id,name) values
  ('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Onboarding QA School A'),
  ('b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','Onboarding QA School B');

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('b3000000-0000-4000-8000-000000000001','support-onboarding@example.test','authenticated','authenticated',now(),now()),
  ('b3000000-0000-4000-8000-000000000002','platform-admin-onboarding@example.test','authenticated','authenticated',now(),now()),
  ('b3000000-0000-4000-8000-000000000003','school-admin-onboarding@example.test','authenticated','authenticated',now(),now()),
  ('b3000000-0000-4000-8000-000000000004','teacher-onboarding@example.test','authenticated','authenticated',now(),now()),
  ('b3000000-0000-4000-8000-000000000005','invitee-onboarding@example.test','authenticated','authenticated',now(),now()),
  ('b3000000-0000-4000-8000-000000000006','expired-onboarding@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key) values
  ('b3000000-0000-4000-8000-000000000001','platform_support'),
  ('b3000000-0000-4000-8000-000000000002','platform_admin');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key) values
  ('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000003','school_admin'),
  ('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000004','teacher');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"b3000000-0000-4000-8000-000000000001","role":"authenticated","email":"support-onboarding@example.test"}',true);

select is(app_private.has_school_access('b2000000-0000-4000-8000-000000000001'), false,'platform support does not inherit generic school operational access');
select is(app_private.has_tenant_access('b1000000-0000-4000-8000-000000000001'), false,'platform support does not inherit generic tenant operational access');

select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"b3000000-0000-4000-8000-000000000002","role":"authenticated","email":"platform-admin-onboarding@example.test"}',true);
select is(app_private.has_school_access('b2000000-0000-4000-8000-000000000001'), true,'platform administrator retains explicit platform school scope');

insert into public.school_invitations(id,tenant_id,school_id,email,role_key,token_hash,invited_by_user_id,expires_at) values
  ('b4000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','invitee-onboarding@example.test','teacher',encode(digest('revoked-token','sha256'),'hex'),'b3000000-0000-4000-8000-000000000003',now()+interval '1 day'),
  ('b4000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','expired-onboarding@example.test','teacher',encode(digest('expired-token','sha256'),'hex'),'b3000000-0000-4000-8000-000000000003',now()-interval '1 minute'),
  ('b4000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','invitee-onboarding@example.test','teacher',encode(digest('accept-token','sha256'),'hex'),'b3000000-0000-4000-8000-000000000003',now()+interval '1 day');

select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"b3000000-0000-4000-8000-000000000004","role":"authenticated","email":"teacher-onboarding@example.test"}',true);
select throws_ok($$select public.revoke_school_invitation('b4000000-0000-4000-8000-000000000001','teacher attempt')$$,'Permission denied','generic school membership cannot revoke invitations');
select throws_ok($$select * from public.create_school_invitation('b2000000-0000-4000-8000-000000000001','teacher-created@example.test',null,null,null,'teacher')$$,'Permission denied','generic school membership cannot create invitations');

select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"b3000000-0000-4000-8000-000000000003","role":"authenticated","email":"school-admin-onboarding@example.test"}',true);
select is(public.revoke_school_invitation('b4000000-0000-4000-8000-000000000001','no longer required'), true,'school administrator can revoke a pending invitation in their school');
select ok(exists (select 1 from public.school_invitations where id='b4000000-0000-4000-8000-000000000001' and status='revoked' and revoked_by_user_id='b3000000-0000-4000-8000-000000000003' and revoked_at is not null) and exists (select 1 from public.audit_events where entity_id='b4000000-0000-4000-8000-000000000001' and event_type='school_invitation.revoked' and actor_user_id='b3000000-0000-4000-8000-000000000003' and tenant_id='b1000000-0000-4000-8000-000000000001' and school_id='b2000000-0000-4000-8000-000000000001'),'invitation revocation preserves actor, tenant, and school provenance');
select lives_ok($$select * from public.create_school_invitation('b2000000-0000-4000-8000-000000000001','admin-created@example.test','Admin','Created',null,'teacher')$$,'school administrator can create a scoped invitation');
select ok(exists (select 1 from public.audit_events ae join public.school_invitations si on si.id=ae.entity_id where si.email='admin-created@example.test' and si.tenant_id='b1000000-0000-4000-8000-000000000001' and si.school_id='b2000000-0000-4000-8000-000000000001' and ae.event_type='school_invitation.created' and ae.actor_user_id='b3000000-0000-4000-8000-000000000003'),'invitation creation derives tenant from school and records actor provenance');

select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"b3000000-0000-4000-8000-000000000005","role":"authenticated","email":"invitee-onboarding@example.test"}',true);
select throws_ok($$select * from public.accept_school_invitation('revoked-token')$$,'Invitation has been revoked','revoked invitation cannot be accepted');

select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000006',true);
select set_config('request.jwt.claims','{"sub":"b3000000-0000-4000-8000-000000000006","role":"authenticated","email":"expired-onboarding@example.test"}',true);
select throws_ok($$select * from public.accept_school_invitation('expired-token')$$,'Invitation has expired','expired invitation cannot be accepted');

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values ('b5000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',null,'ONBOARD-001','Existing','Staff','active');
update public.school_invitations set employee_number='ONBOARD-001', first_name='Existing', last_name='Staff' where id='b4000000-0000-4000-8000-000000000003';

select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"b3000000-0000-4000-8000-000000000005","role":"authenticated","email":"invitee-onboarding@example.test"}',true);
select lives_ok($$select * from public.accept_school_invitation('accept-token')$$,'valid scoped invitation can be accepted');
select lives_ok($$select * from public.accept_school_invitation('accept-token')$$,'already-consumed invitation is idempotent for the same identity');
select ok((select count(*)=1 from public.staff_members where tenant_id='b1000000-0000-4000-8000-000000000001' and employee_number='ONBOARD-001') and (select user_id='b3000000-0000-4000-8000-000000000005' from public.staff_members where id='b5000000-0000-4000-8000-000000000001'),'staff-linked acceptance reuses canonical staff identity rather than duplicating it');
select ok((select count(*)=1 from public.school_memberships where user_id='b3000000-0000-4000-8000-000000000005' and tenant_id='b1000000-0000-4000-8000-000000000001' and school_id='b2000000-0000-4000-8000-000000000001' and role_key='teacher') and not exists (select 1 from public.school_memberships where user_id='b3000000-0000-4000-8000-000000000005' and (school_id='b2000000-0000-4000-8000-000000000002' or role_key='school_admin')),'acceptance grants only the invitation school and role; cross-school replay/elevation is absent');
select is((select count(*)::integer from public.audit_events where entity_id='b4000000-0000-4000-8000-000000000003' and event_type='school_invitation.accepted' and actor_user_id='b3000000-0000-4000-8000-000000000005'),1,'idempotent acceptance records exactly one acceptance audit event');
select ok(exists (select 1 from public.school_invitations where id='b4000000-0000-4000-8000-000000000003' and email='invitee-onboarding@example.test' and tenant_id='b1000000-0000-4000-8000-000000000001' and school_id='b2000000-0000-4000-8000-000000000001' and role_key='teacher' and status='accepted' and accepted_user_id='b3000000-0000-4000-8000-000000000005'),'accepted invitation preserves immutable email, tenant, school, role, and consuming identity');

select * from finish();
rollback;
