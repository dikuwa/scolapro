begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('f9900000-0000-4000-8000-000000000001','notification-member@example.test','authenticated','authenticated',now(),now()),
  ('f9900000-0000-4000-8000-000000000002','notification-future-staff@example.test','authenticated','authenticated',now(),now()),
  ('f9900000-0000-4000-8000-000000000003','notification-guardian@example.test','authenticated','authenticated',now(),now()),
  ('f9900000-0000-4000-8000-000000000004','notification-platform@example.test','authenticated','authenticated',now(),now()),
  ('f9900000-0000-4000-8000-000000000005','notification-unrelated@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug)
values('f9910000-0000-4000-8000-000000000001','Notification Relationship Tenant','notification-relationship-tenant');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('f9920000-0000-4000-8000-000000000001','f9910000-0000-4000-8000-000000000001','Notification Relationship School','NOTIFY-REL','Khomas','Windhoek');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('f9910000-0000-4000-8000-000000000001','f9920000-0000-4000-8000-000000000001','f9900000-0000-4000-8000-000000000001','teacher',current_date);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values('f9930000-0000-4000-8000-000000000001','f9910000-0000-4000-8000-000000000001','f9900000-0000-4000-8000-000000000002','NOTIFY-FUTURE','Future','Supervisor','active');

insert into public.staff_school_assignments(
  tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id
) values(
  'f9910000-0000-4000-8000-000000000001','f9920000-0000-4000-8000-000000000001','f9930000-0000-4000-8000-000000000001',
  'staff',current_date+7,'f9900000-0000-4000-8000-000000000001'
);

insert into public.learners(id,tenant_id,first_names,surname)
values('f9940000-0000-4000-8000-000000000001','f9910000-0000-4000-8000-000000000001','Linked','Learner');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values('f9950000-0000-4000-8000-000000000001','f9910000-0000-4000-8000-000000000001','f9920000-0000-4000-8000-000000000001','f9940000-0000-4000-8000-000000000001',2026,current_date-30,'current');

insert into public.guardian_profiles(id,tenant_id,first_names,surname,status)
values('f9960000-0000-4000-8000-000000000001','f9910000-0000-4000-8000-000000000001','Linked','Guardian','active');

insert into public.learner_guardians(tenant_id,learner_id,guardian_id,relationship_type,effective_from)
values('f9910000-0000-4000-8000-000000000001','f9940000-0000-4000-8000-000000000001','f9960000-0000-4000-8000-000000000001','guardian',current_date-30);

insert into public.guardian_user_links(tenant_id,guardian_id,user_id,linked_by_user_id)
values('f9910000-0000-4000-8000-000000000001','f9960000-0000-4000-8000-000000000001','f9900000-0000-4000-8000-000000000003','f9900000-0000-4000-8000-000000000003');

insert into public.platform_memberships(user_id,role_key,active_from)
values('f9900000-0000-4000-8000-000000000004','platform_admin',current_date);

select throws_ok(
  $$insert into public.notifications(recipient_user_id,tenant_id,school_id,title,body)
    values('f9900000-0000-4000-8000-000000000005','f9910000-0000-4000-8000-000000000001','f9920000-0000-4000-8000-000000000001','Private school notice','Should not escape school scope')$$,
  'Notification scope mismatch: recipient is not related to school',
  'school notification cannot target an unrelated account'
);

select lives_ok(
  $$insert into public.notifications(recipient_user_id,tenant_id,school_id,title)
    values('f9900000-0000-4000-8000-000000000001','f9910000-0000-4000-8000-000000000001','f9920000-0000-4000-8000-000000000001','Member notice')$$,
  'active school member remains a valid notification recipient'
);

select lives_ok(
  $$insert into public.notifications(recipient_user_id,tenant_id,school_id,title)
    values('f9900000-0000-4000-8000-000000000002','f9910000-0000-4000-8000-000000000001','f9920000-0000-4000-8000-000000000001','Advance duty notice')$$,
  'future school staff placement remains valid for advance duty notification'
);

select lives_ok(
  $$insert into public.notifications(recipient_user_id,tenant_id,school_id,title)
    values('f9900000-0000-4000-8000-000000000003','f9910000-0000-4000-8000-000000000001','f9920000-0000-4000-8000-000000000001','Guardian notice')$$,
  'guardian linked to an enrolled learner remains a valid school notification recipient'
);

select lives_ok(
  $$insert into public.notifications(recipient_user_id,tenant_id,school_id,title)
    values('f9900000-0000-4000-8000-000000000004','f9910000-0000-4000-8000-000000000001','f9920000-0000-4000-8000-000000000001','Platform notice')$$,
  'active platform administrator remains a valid school notification recipient'
);

select lives_ok(
  $$insert into public.notifications(recipient_user_id,tenant_id,title)
    values('f9900000-0000-4000-8000-000000000005','f9910000-0000-4000-8000-000000000001','Tenant-only notice')$$,
  'tenant-only notification semantics remain unchanged by school recipient guard'
);

select is(
  (select count(*)::integer from public.notifications where recipient_user_id='f9900000-0000-4000-8000-000000000005' and school_id='f9920000-0000-4000-8000-000000000001'),
  0,
  'rejected unrelated notification leaves no school-scoped evidence'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_notification_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_notification_scope_integrity()','EXECUTE'),
  'notification integrity helper remains private from client roles'
);

select * from finish();
rollback;
