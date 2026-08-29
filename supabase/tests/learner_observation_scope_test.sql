begin;

select plan(5);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fd300000-0000-4000-8000-000000000001','observation-class@example.test','authenticated','authenticated',now(),now()),
  ('fd300000-0000-4000-8000-000000000002','observation-teacher@example.test','authenticated','authenticated',now(),now()),
  ('fd300000-0000-4000-8000-000000000003','observation-librarian@example.test','authenticated','authenticated',now(),now()),
  ('fd300000-0000-4000-8000-000000000004','observation-admin@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values('fd310000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd300000-0000-4000-8000-000000000001','OBS-CLASS-001','Observation','Class Teacher','active');

update public.register_classes
set register_teacher_staff_id='fd310000-0000-4000-8000-000000000001'
where id='40000000-0000-4000-8000-00000000001a';

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd300000-0000-4000-8000-000000000001','fd310000-0000-4000-8000-000000000001','class_teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd300000-0000-4000-8000-000000000002',null,'teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd300000-0000-4000-8000-000000000003',null,'librarian',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd300000-0000-4000-8000-000000000004',null,'school_admin',current_date);

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','fd300000-0000-4000-8000-000000000001',true);
select is(app_private.can_access_learner_observations('22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001'),true,'assigned register teacher can access observations for own class learner');

select set_config('request.jwt.claim.sub','fd300000-0000-4000-8000-000000000002',true);
select is(app_private.can_access_learner_observations('22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001'),false,'unassigned teacher cannot browse another class learner observation history');

select set_config('request.jwt.claim.sub','fd300000-0000-4000-8000-000000000003',true);
select is(app_private.can_access_learner_observations('22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001'),false,'librarian learner-directory access does not expose conduct observations');

select set_config('request.jwt.claim.sub','fd300000-0000-4000-8000-000000000004',true);
select is(app_private.can_access_learner_observations('22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001'),true,'school administrator retains operational learner observation access');

select throws_ok(
  $$insert into public.conduct_events(tenant_id,school_id,learner_id,enrolment_id,occurred_on,direction,category_code,severity,summary,recorded_by_user_id) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002',current_date,'negative','scope-test','routine','Mismatched enrolment','fd300000-0000-4000-8000-000000000004')$$,
  '23514',null,
  'conduct record cannot mix learner identity with another learner enrolment'
);

select * from finish();
rollback;