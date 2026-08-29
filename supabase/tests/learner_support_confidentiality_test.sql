begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fd000000-0000-4000-8000-000000000001','support-admin@example.test','authenticated','authenticated',now(),now()),
  ('fd000000-0000-4000-8000-000000000002','support-principal@example.test','authenticated','authenticated',now(),now()),
  ('fd000000-0000-4000-8000-000000000003','support-counsellor@example.test','authenticated','authenticated',now(),now()),
  ('fd000000-0000-4000-8000-000000000004','support-hod@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values('fd100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd000000-0000-4000-8000-000000000003','SUPPORT-001','Case','Counsellor','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd000000-0000-4000-8000-000000000001',null,'school_admin',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd000000-0000-4000-8000-000000000002',null,'principal',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd000000-0000-4000-8000-000000000003','fd100000-0000-4000-8000-000000000001','counsellor',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd000000-0000-4000-8000-000000000004',null,'hod',current_date);

insert into public.learner_support_cases(
  id,tenant_id,school_id,learner_id,enrolment_id,opened_on,case_type,sensitivity,summary,status,owner_staff_member_id,opened_by_user_id
) values
  ('fd200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',current_date,'wellbeing','restricted','Restricted support test','open','fd100000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000003'),
  ('fd200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',current_date,'counselling','highly_restricted','Highly restricted support test','open','fd100000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000003');

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);
select is(app_private.can_manage_learner_support('22222222-2222-4222-8222-222222222222'),false,'school administrator role alone is not counselling authority');
select is(app_private.can_access_learner_support_case('fd200000-0000-4000-8000-000000000001'),false,'school administrator cannot read restricted counselling case by generic administration role');

select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000004',true);
select is(app_private.can_access_learner_support_case('fd200000-0000-4000-8000-000000000001'),false,'HOD role does not imply counselling case access');

select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000002',true);
select is(app_private.can_access_learner_support_case('fd200000-0000-4000-8000-000000000001'),true,'principal can oversee restricted support case');
select is(app_private.can_access_learner_support_case('fd200000-0000-4000-8000-000000000002'),false,'principal does not automatically receive highly restricted counselling access');

select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000003',true);
select is(app_private.can_access_learner_support_case('fd200000-0000-4000-8000-000000000001'),true,'counsellor can access restricted case');
select is(app_private.can_access_learner_support_case('fd200000-0000-4000-8000-000000000002'),true,'counsellor can access highly restricted case');

select ok(not has_table_privilege('authenticated','public.learner_support_cases','DELETE'),'authenticated clients cannot delete learner support case history');
select ok(not has_table_privilege('authenticated','public.learner_support_interventions','UPDATE') and not has_table_privilege('authenticated','public.learner_support_interventions','DELETE'),'support interventions are append-only for authenticated clients');

select * from finish();
rollback;