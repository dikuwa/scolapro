begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('de100000-0000-4000-8000-000000000001','invite-platform@example.test','authenticated','authenticated',now(),now()),
  ('de100000-0000-4000-8000-000000000002','invite-recipient@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug,status)
values('de110000-0000-4000-8000-000000000001','Invitation Failure Tenant','invitation-failure-tenant','active');

insert into public.schools(id,tenant_id,name,emis_number,status)
values('de120000-0000-4000-8000-000000000001','de110000-0000-4000-8000-000000000001','Invitation Failure School','INV-FAIL','active');

insert into public.platform_memberships(user_id,role_key,active_from)
values('de100000-0000-4000-8000-000000000001','platform_admin',current_date-10);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','de100000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"de100000-0000-4000-8000-000000000001","role":"authenticated","email":"invite-platform@example.test"}',true);
set local role authenticated;

create temp table qa_invite as
select * from public.create_school_invitation(
  'de120000-0000-4000-8000-000000000001',
  'invite-recipient@example.test',
  'Invite',
  'Recipient',
  'INV-FAIL-RECIPIENT',
  'school_admin'
);

select is(
  (select count(*)::integer
   from public.get_school_invitation_preview((select invitation_token from qa_invite))),
  1,
  'pending invitation preview is available only through the valid token'
);

reset role;

create or replace function public.qa_fail_invitation_notification()
returns trigger
language plpgsql
as $$
begin
  if new.title = 'School invitation accepted' then
    raise exception 'forced notification failure';
  end if;
  return new;
end;
$$;

create trigger qa_fail_invitation_notification_trg
before insert on public.notifications
for each row execute function public.qa_fail_invitation_notification();

select set_config('request.jwt.claim.sub','de100000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"de100000-0000-4000-8000-000000000002","role":"authenticated","email":"invite-recipient@example.test"}',true);
set local role authenticated;

select lives_ok(
  format('select * from public.accept_school_invitation(%L)',(select invitation_token from qa_invite)),
  'notification insertion failure cannot roll back invitation acceptance'
);

reset role;

select is(
  (select status from public.school_invitations where id=(select invitation_id from qa_invite)),
  'accepted',
  'authoritative invitation outcome remains accepted'
);

select ok(
  exists(
    select 1
    from public.school_memberships sm
    where sm.user_id='de100000-0000-4000-8000-000000000002'
      and sm.school_id='de120000-0000-4000-8000-000000000001'
      and sm.role_key='school_admin'
      and sm.staff_member_id is not null
  ),
  'accepted invitation still creates canonical school membership'
);

select ok(
  exists(
    select 1
    from public.staff_school_assignments ssa
    join public.staff_members staff on staff.id=ssa.staff_member_id
    where staff.user_id='de100000-0000-4000-8000-000000000002'
      and staff.tenant_id='de110000-0000-4000-8000-000000000001'
      and ssa.school_id='de120000-0000-4000-8000-000000000001'
      and ssa.assignment_type='management'
      and ssa.effective_from=current_date
  ),
  'accepted invitation still creates canonical effective staff placement'
);

select ok(
  exists(
    select 1
    from public.audit_events ae
    where ae.entity_id=(select invitation_id from qa_invite)
      and ae.event_type='school_invitation.accepted'
      and ae.actor_user_id='de100000-0000-4000-8000-000000000002'
  ),
  'accepted invitation audit provenance survives notification failure'
);

select is(
  (select count(*)::integer
   from public.get_school_invitation_preview((select invitation_token from qa_invite))),
  0,
  'accepted invitation is no longer exposed by public preview'
);

set local role authenticated;
select lives_ok(
  format('select * from public.accept_school_invitation(%L)',(select invitation_token from qa_invite)),
  'same accepted identity replay remains idempotent'
);
reset role;

select is(
  (select count(*)::integer
   from public.audit_events
   where entity_id=(select invitation_id from qa_invite)
     and event_type='school_invitation.accepted'),
  1,
  'idempotent replay does not duplicate authoritative acceptance audit'
);

select * from finish();
rollback;
