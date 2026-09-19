begin;

select plan(12);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('56400000-0000-4000-8000-000000000001','staff-access-admin@example.test','authenticated','authenticated',now(),now()),
  ('56400000-0000-4000-8000-000000000002','staff-access-linked@example.test','authenticated','authenticated',now(),now());

set local session_replication_role = replica;
insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values
  ('56401000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',null,'EMP-564','Existing','Invitee','active'),
  ('56401000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','56400000-0000-4000-8000-000000000002','EMP-565','Linked','User','active');
insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id)
values
  ('56402000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','56401000-0000-4000-8000-000000000001','teacher',current_date-1,'56400000-0000-4000-8000-000000000001'),
  ('56402000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','56401000-0000-4000-8000-000000000002','teacher',current_date-1,'56400000-0000-4000-8000-000000000001');
insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values
  ('56403000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','56400000-0000-4000-8000-000000000001',null,'school_admin',current_date-1);
set local session_replication_role = origin;

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','56400000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select * from public.create_staff_access_invitation(
    '22222222-2222-4222-8222-222222222222',
    '56401000-0000-4000-8000-000000000001',
    'staff-access-invitee@example.test','teacher'
  )$$,
  'school admin can invite an exact existing staff identity'
);

select is(
  (select staff_member_id from public.school_invitations where email='staff-access-invitee@example.test'),
  '56401000-0000-4000-8000-000000000001'::uuid,
  'pending invitation stores the exact selected staff identity'
);

select throws_ok(
  $$select * from public.create_staff_access_invitation(
    '22222222-2222-4222-8222-222222222222',
    '56401000-0000-4000-8000-000000000002',
    'another@example.test','teacher'
  )$$,
  'Staff member already has a linked account; manage roles instead',
  'linked staff cannot receive a duplicate onboarding invitation'
);

select lives_ok(
  $$select public.add_staff_school_role(
    '22222222-2222-4222-8222-222222222222',
    '56401000-0000-4000-8000-000000000002','hod',current_date
  )$$,
  'school admin can add a role to an existing linked account'
);

select is(
  (select role_key from public.school_memberships where staff_member_id='56401000-0000-4000-8000-000000000002' and role_key='hod' and active_to is null),
  'hod',
  'added role is stored on the canonical school membership'
);

select lives_ok(
  $$select public.end_staff_school_role(
    '22222222-2222-4222-8222-222222222222',
    (select id from public.school_memberships where staff_member_id='56401000-0000-4000-8000-000000000002' and role_key='hod'),
    current_date
  )$$,
  'school admin can end a role without deleting its history'
);

select ok(
  (select active_to is not null from public.school_memberships where staff_member_id='56401000-0000-4000-8000-000000000002' and role_key='hod'),
  'ended role retains its effective end date'
);

select is(
  (select count(*)::integer from public.staff_school_assignments where staff_member_id='56401000-0000-4000-8000-000000000002'),
  1,
  'role management does not alter staff placement'
);

select is(
  (select count(*)::integer from public.audit_events where entity_type='school_membership' and entity_id=(select id from public.school_memberships where staff_member_id='56401000-0000-4000-8000-000000000002' and role_key='hod')),
  2,
  'role add and end append audit provenance'
);

select ok(
  not has_function_privilege('anon','public.create_staff_access_invitation(uuid,uuid,text,text)','EXECUTE')
  and not has_function_privilege('anon','public.add_staff_school_role(uuid,uuid,text,date)','EXECUTE')
  and not has_function_privilege('anon','public.end_staff_school_role(uuid,uuid,date)','EXECUTE'),
  'staff access mutations are not anonymously executable'
);

select is(
  (select count(*)::integer from public.school_memberships where staff_member_id='56401000-0000-4000-8000-000000000001'),
  0,
  'creating an invitation does not create a login membership'
);

select is(
  (select count(*)::integer from public.staff_members where employee_number='EMP-564'),
  1,
  'inviting existing staff does not create a duplicate staff identity'
);

select * from finish();
rollback;