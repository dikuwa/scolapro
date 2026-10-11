\set ON_ERROR_STOP on
INSERT INTO auth.users(id,email,email_confirmed_at,aud,role,created_at,updated_at)
VALUES
  ('70000000-0000-4000-8000-000000000212','qa1202-concurrent-admin@example.test',now(),'authenticated','authenticated',now(),now()),
  ('70000000-0000-4000-8000-000000000213','qa1202-concurrent-invitee@example.test',now(),'authenticated','authenticated',now(),now());

INSERT INTO public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '70000000-0000-4000-8000-000000000212',
  'school_admin',current_date-30
);

INSERT INTO public.staff_members(id,tenant_id,first_name,last_name,employee_number)
VALUES (
  '70000000-0000-4000-8000-000000001212',
  '11111111-1111-4111-8111-111111111111',
  'Concurrent','Invitee','QA-1202-C'
);

INSERT INTO public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,effective_from,created_by_user_id
) VALUES (
  '70000000-0000-4000-8000-000000002212',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '70000000-0000-4000-8000-000000001212',
  current_date-30,
  '70000000-0000-4000-8000-000000000212'
);

INSERT INTO public.staff_planned_school_roles(
  id,tenant_id,school_id,staff_member_id,role_key,effective_from,created_by_user_id
) VALUES
  ('70000000-0000-4000-8000-000000003212','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','70000000-0000-4000-8000-000000001212','teacher',current_date-5,'70000000-0000-4000-8000-000000000212'),
  ('70000000-0000-4000-8000-000000004212','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','70000000-0000-4000-8000-000000001212','librarian',current_date,'70000000-0000-4000-8000-000000000212');

INSERT INTO public.school_invitations(
  id,tenant_id,school_id,staff_member_id,email,first_name,last_name,employee_number,
  role_key,token_hash,invited_by_user_id,expires_at
) VALUES (
  '70000000-0000-4000-8000-000000005212',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '70000000-0000-4000-8000-000000001212',
  'qa1202-concurrent-invitee@example.test','Concurrent','Invitee','QA-1202-C',
  'teacher',encode(digest('qa1202-concurrent-token','sha256'),'hex'),
  '70000000-0000-4000-8000-000000000212',now()+interval '7 days'
);
