begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values ('bf700000-0000-4000-8000-000000000001','communication-current-school@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status)
values (
  'bf720000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Communication Current School B',
  'TST-COMM-CURRENT-B',
  'active'
);

insert into public.school_memberships(
  id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from
) values
  (
    'bf710000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'bf700000-0000-4000-8000-000000000001',
    null,
    'school_admin',
    current_date - 10
  ),
  (
    'bf710000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    'bf720000-0000-4000-8000-000000000001',
    'bf700000-0000-4000-8000-000000000001',
    null,
    'school_admin',
    current_date
  );

-- Seed queueable drafts under trusted/service context so queue_communication itself
-- is the operation under test after the actor JWT is installed.
insert into public.communication_messages(
  id,tenant_id,school_id,channel,body,audience_type,status,created_by_user_id
) values
  (
    'bf730000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'app','Old school draft','individual','draft','bf700000-0000-4000-8000-000000000001'
  ),
  (
    'bf730000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    'bf720000-0000-4000-8000-000000000001',
    'app','Current school draft','individual','draft','bf700000-0000-4000-8000-000000000001'
  );

insert into public.communication_recipients(
  tenant_id,school_id,message_id,destination
) values
  (
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'bf730000-0000-4000-8000-000000000001',
    'old-school@example.test'
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    'bf720000-0000-4000-8000-000000000001',
    'bf730000-0000-4000-8000-000000000002',
    'current-school@example.test'
  );

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','bf700000-0000-4000-8000-000000000001',true);

select ok(
  app_private.is_current_school('bf720000-0000-4000-8000-000000000001'),
  'latest effective active membership is the deterministic current school'
);

select ok(
  not app_private.is_current_school('22222222-2222-4222-8222-222222222222'),
  'older still-active school membership is not current'
);

select throws_ok(
  $$select public.create_communication_template(
    '22222222-2222-4222-8222-222222222222','email','current.school.denied','Denied','Non-current school'
  )$$,
  'Permission denied: communication operation is outside the current school',
  'school-local template governance cannot target another active non-current school'
);

select lives_ok(
  $$select public.create_communication_template(
    'bf720000-0000-4000-8000-000000000001','email','current.school.allowed','Allowed','Current school'
  )$$,
  'school-local template governance remains available in the deterministic current school'
);

select throws_ok(
  $$select public.queue_communication('bf730000-0000-4000-8000-000000000001')$$,
  'Permission denied: communication operation is outside the current school',
  'message author cannot queue a draft belonging to another active non-current school'
);

select lives_ok(
  $$select public.queue_communication('bf730000-0000-4000-8000-000000000002')$$,
  'message author can queue a valid draft in the deterministic current school'
);

select throws_ok(
  $$select * from public.list_communication_delivery_diagnostics(
    '22222222-2222-4222-8222-222222222222',100
  )$$,
  'Permission denied',
  'delivery diagnostics cannot be read through another active non-current school membership'
);

select * from finish();
rollback;
