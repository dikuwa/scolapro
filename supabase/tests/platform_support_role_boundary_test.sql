begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('ff000000-0000-4000-8000-000000000001','platform-support-boundary@example.test','authenticated','authenticated',now(),now()),
  ('ff000000-0000-4000-8000-000000000002','platform-admin-boundary@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key,active_from)
values
  ('ff000000-0000-4000-8000-000000000001','platform_support',current_date),
  ('ff000000-0000-4000-8000-000000000002','platform_admin',current_date);

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','ff000000-0000-4000-8000-000000000001',true);
select is(app_private.has_school_access('22222222-2222-4222-8222-222222222222'),true,'platform support retains explicit support-safe school metadata access');
select is(app_private.has_tenant_access('11111111-1111-4111-8111-111111111111'),true,'platform support retains explicit support-safe tenant metadata access');
select is(app_private.can_view_audit('22222222-2222-4222-8222-222222222222'),true,'platform support retains explicit audit troubleshooting access');
select is(app_private.has_school_role('22222222-2222-4222-8222-222222222222',array['school_admin']),false,'platform support does not automatically become a school administrator');
select is(app_private.has_school_role('22222222-2222-4222-8222-222222222222',array['teacher','class_teacher']),false,'platform support does not automatically become teaching staff');
select is(app_private.can_view_operational_learners('22222222-2222-4222-8222-222222222222'),false,'platform support generic troubleshooting role does not automatically expose operational learner data');

select set_config('request.jwt.claim.sub','ff000000-0000-4000-8000-000000000002',true);
select is(app_private.has_school_role('22222222-2222-4222-8222-222222222222',array['school_admin']),true,'platform administrator retains cross-school administrative authority');
select is(app_private.can_view_operational_learners('22222222-2222-4222-8222-222222222222'),true,'platform administrator retains governed operational learner access');

select * from finish();
rollback;