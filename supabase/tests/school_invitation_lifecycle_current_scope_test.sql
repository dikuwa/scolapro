begin;

select plan(18);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('ac000000-0000-4000-8000-000000000001','invite-lifecycle-admin@example.test','authenticated','authenticated',now(),now()),
  ('ac000000-0000-4000-8000-000000000002','invite-lifecycle-ended@example.test','authenticated','authenticated',now(),now()),
  ('ac000000-0000-4000-8000-000000000003','invite-lifecycle-support@example.test','authenticated','authenticated',now(),now()),
  ('ac000000-0000-4000-8000-000000000004','invite-lifecycle-platform@example.test','authenticated','authenticated',now(),now()),
  ('ac000000-0000-4000-8000-000000000005','invite-lifecycle-recipient@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug,status)
values('ac100000-0000-4000-8000-000000000001','Invitation Other Tenant','invitation-other-tenant','active');

insert into public.schools(id,tenant_id,name,emis_number,status) values
  ('ac110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Invitation Old School','INV-OLD','active'),
  ('ac110000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Invitation Current School','INV-CURRENT','active'),
  ('ac110000-0000-4000-8000-000000000003','ac100000-0000-4000-8000-000000000001','Invitation Other Tenant School','INV-XTEN','active');

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('ac120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ac000000-0000-4000-8000-000000000001','INV-MGR','Current','Manager','active'),
  ('ac120000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ac000000-0000-4000-8000-000000000002','INV-END','Ended','Manager','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','ac110000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000001','ac120000-0000-4000-8000-000000000001','school_admin',current_date-30),
  ('11111111-1111-4111-8111-111111111111','ac110000-0000-4000-8000-000000000002','ac000000-0000-4000-8000-000000000001','ac120000-0000-4000-8000-000000000001','school_admin',current_date-10),
  ('11111111-1111-4111-8111-111111111111','ac110000-0000-4000-8000-000000000002','ac000000-0000-4000-8000-000000000002','ac120000-0000-4000-8000-000000000002','school_admin',current_date-20);

insert into public.staff_school_assignments(
  tenant_id,school_id,staff_member_id,assignment_type,position_title,effective_from,effective_to,created_by_user_id
) values
  ('11111111-1111-4111-8111-111111111111','ac110000-0000-4000-8000-000000000002','ac120000-0000-4000-8000-000000000001','management','Current Manager',current_date-10,null,'ac000000-0000-4000-8000-000000000004'),
  ('11111111-1111-4111-8111-111111111111','ac110000-0000-4000-8000-000000000002','ac120000-0000-4000-8000-000000000002','management','Ended Manager',current_date-30,current_date-1,'ac000000-0000-4000-8000-000000000004');

insert into public.platform_memberships(user_id,role_key,active_from) values
  ('ac000000-0000-4000-8000-000000000003','platform_support',current_date-5),
  ('ac000000-0000-4000-8000-000000000004','platform_admin',current_date-5);

-- Create lifecycle fixtures under governed Platform Admin authority.
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"ac000000-0000-4000-8000-000000000004","role":"authenticated","email":"invite-lifecycle-platform@example.test"}',true);
set local role authenticated;

create temp table old_revoke_invite as
  select * from public.create_school_invitation('ac110000-0000-4000-8000-000000000001','old-revoke@example.test',null,null,null,'teacher');
create temp table old_accept_invite as
  select * from public.create_school_invitation('ac110000-0000-4000-8000-000000000001','invite-lifecycle-recipient@example.test','Invite','Recipient','INV-REC','teacher');
create temp table current_invite as
  select * from public.create_school_invitation('ac110000-0000-4000-8000-000000000002','current-revoke@example.test',null,null,null,'teacher');
create temp table ended_invite as
  select * from public.create_school_invitation('ac110000-0000-4000-8000-000000000002','ended-revoke@example.test',null,null,null,'teacher');

-- Multi-school manager: old membership is still active, but current school is deterministic.
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"ac000000-0000-4000-8000-000000000001","role":"authenticated","email":"invite-lifecycle-admin@example.test"}',true);

select is(
  (select count(*)::integer from public.school_invitations where id=(select invitation_id from old_revoke_invite)),0,
  'older active non-current school cannot expose invitation history'
);
select is(
  (select count(*)::integer from public.school_invitations where id=(select invitation_id from current_invite)),1,
  'deterministic current school can expose its invitation history'
);
select throws_ok(
  format('select public.revoke_school_invitation(%L::uuid,%L)',(select invitation_id from old_revoke_invite),'old school'),
  'Permission denied','older active non-current school cannot revoke a pending invitation'
);
select lives_ok(
  format('select public.revoke_school_invitation(%L::uuid,%L)',(select invitation_id from current_invite),'current school'),
  'current-school administrator can revoke a pending invitation'
);
select is(
  (select revoked_by_user_id from public.school_invitations where id=(select invitation_id from current_invite)),
  'ac000000-0000-4000-8000-000000000001'::uuid,
  'current-school revocation preserves authenticated actor provenance'
);

-- Ended authoritative placement defeats stale school-admin membership.
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"ac000000-0000-4000-8000-000000000002","role":"authenticated","email":"invite-lifecycle-ended@example.test"}',true);
select is(
  (select count(*)::integer from public.school_invitations where id=(select invitation_id from ended_invite)),0,
  'ended manager placement removes invitation-history visibility despite stale membership'
);
select throws_ok(
  format('select public.revoke_school_invitation(%L::uuid,%L)',(select invitation_id from ended_invite),'ended manager'),
  'Permission denied','ended manager placement cannot retain invitation revocation authority'
);

-- Platform Support remains troubleshooting-only.
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"ac000000-0000-4000-8000-000000000003","role":"authenticated","email":"invite-lifecycle-support@example.test"}',true);
select is(
  (select count(*)::integer from public.school_invitations where id=(select invitation_id from ended_invite)),0,
  'Platform Support cannot read school invitation history'
);
select throws_ok(
  format('select public.revoke_school_invitation(%L::uuid,%L)',(select invitation_id from ended_invite),'support'),
  'Permission denied','Platform Support cannot revoke school invitations'
);

-- Governed Platform Admin cross-school lifecycle authority remains available.
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"ac000000-0000-4000-8000-000000000004","role":"authenticated","email":"invite-lifecycle-platform@example.test"}',true);
select is(
  (select count(*)::integer from public.school_invitations where id=(select invitation_id from old_revoke_invite)),1,
  'Platform Admin retains governed cross-school invitation visibility'
);
select lives_ok(
  format('select public.revoke_school_invitation(%L::uuid,%L)',(select invitation_id from old_revoke_invite),'platform governance'),
  'Platform Admin retains governed cross-school revocation authority'
);
select is(
  (select revoked_by_user_id from public.school_invitations where id=(select invitation_id from old_revoke_invite)),
  'ac000000-0000-4000-8000-000000000004'::uuid,
  'Platform Admin revocation preserves actor provenance'
);

-- Acceptance remains token-scoped: recipient needs no pre-existing school authority and
-- cannot supply tenant, school, role, staff identity, or effective dates.
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"ac000000-0000-4000-8000-000000000005","role":"authenticated","email":"invite-lifecycle-recipient@example.test"}',true);
select is(
  (select role_key from public.accept_school_invitation((select invitation_token from old_accept_invite))),
  'teacher','invited recipient can still accept a valid invitation without pre-existing school authority'
);
select ok(
  exists(
    select 1 from public.school_memberships sm
    where sm.user_id='ac000000-0000-4000-8000-000000000005'
      and sm.tenant_id='11111111-1111-4111-8111-111111111111'
      and sm.school_id='ac110000-0000-4000-8000-000000000001'
      and sm.role_key='teacher'
      and sm.active_from=current_date
      and sm.staff_member_id is not null
  ),
  'acceptance creates membership only in the invitation tenant and target school with invitation role/effective date'
);
select ok(
  exists(
    select 1
    from public.staff_school_assignments ssa
    join public.staff_members sm on sm.id=ssa.staff_member_id
    where sm.user_id='ac000000-0000-4000-8000-000000000005'
      and sm.tenant_id='11111111-1111-4111-8111-111111111111'
      and ssa.tenant_id=sm.tenant_id
      and ssa.school_id='ac110000-0000-4000-8000-000000000001'
      and ssa.assignment_type='teacher'
      and ssa.effective_from=current_date
      and ssa.created_by_user_id='ac000000-0000-4000-8000-000000000005'
  ),
  'acceptance links tenant staff identity to the target school and preserves placement creator provenance'
);
select ok(
  exists(
    select 1 from public.school_invitations si
    where si.id=(select invitation_id from old_accept_invite)
      and si.status='accepted'
      and si.accepted_user_id='ac000000-0000-4000-8000-000000000005'
      and si.accepted_at is not null
  ) and exists(
    select 1 from public.audit_events ae
    where ae.entity_id=(select invitation_id from old_accept_invite)
      and ae.event_type='school_invitation.accepted'
      and ae.actor_user_id='ac000000-0000-4000-8000-000000000005'
  ),
  'acceptance preserves immutable invitation and audit actor provenance'
);

-- Physical integrity prevents any invitation from being retargeted across tenant/school.
reset role;
select set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"ac000000-0000-4000-8000-000000000004","role":"authenticated","email":"invite-lifecycle-platform@example.test"}',true);
select throws_ok(
  $$insert into public.school_invitations(tenant_id,school_id,email,role_key,token_hash,invited_by_user_id)
    values('11111111-1111-4111-8111-111111111111','ac110000-0000-4000-8000-000000000003','cross-tenant@example.test','teacher','cross-tenant-invite','ac000000-0000-4000-8000-000000000004')$$,
  'School invitation scope mismatch: school does not belong to tenant',
  'invitation scope integrity rejects cross-tenant target construction'
);
select throws_ok(
  format('update public.school_invitations set school_id=%L::uuid where id=%L::uuid','ac110000-0000-4000-8000-000000000002',(select invitation_id from ended_invite)),
  'School invitation tenant and school are immutable','pending invitation target school cannot be rewritten before acceptance'
);

select * from finish();
rollback;
