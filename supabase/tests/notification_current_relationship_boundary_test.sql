begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('ca100000-0000-4000-8000-000000000001','notify-multischool@example.test','authenticated','authenticated',now(),now()),
  ('ca100000-0000-4000-8000-000000000002','notify-staff@example.test','authenticated','authenticated',now(),now()),
  ('ca100000-0000-4000-8000-000000000003','notify-guardian@example.test','authenticated','authenticated',now(),now()),
  ('ca100000-0000-4000-8000-000000000004','notify-support@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug)
values('ca110000-0000-4000-8000-000000000001','Notification Boundary Tenant','notification-boundary-tenant');

insert into public.schools(id,tenant_id,name,emis_number,status) values
  ('ca120000-0000-4000-8000-000000000001','ca110000-0000-4000-8000-000000000001','Notification Older School','NB-OLD','active'),
  ('ca120000-0000-4000-8000-000000000002','ca110000-0000-4000-8000-000000000001','Notification Current School','NB-CUR','active');

insert into public.school_memberships(id,tenant_id,school_id,user_id,role_key,active_from) values
  ('ca130000-0000-4000-8000-000000000001','ca110000-0000-4000-8000-000000000001','ca120000-0000-4000-8000-000000000001','ca100000-0000-4000-8000-000000000001','teacher',current_date-30),
  ('ca130000-0000-4000-8000-000000000002','ca110000-0000-4000-8000-000000000001','ca120000-0000-4000-8000-000000000002','ca100000-0000-4000-8000-000000000001','teacher',current_date-5);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values('ca140000-0000-4000-8000-000000000001','ca110000-0000-4000-8000-000000000001','ca100000-0000-4000-8000-000000000002','NB-STAFF','Ended','Staff','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values(
  'ca150000-0000-4000-8000-000000000001','ca110000-0000-4000-8000-000000000001','ca120000-0000-4000-8000-000000000002','ca140000-0000-4000-8000-000000000001','staff',current_date-30,current_date,'ca100000-0000-4000-8000-000000000001'
);

insert into public.learners(id,tenant_id,first_names,surname)
values('ca160000-0000-4000-8000-000000000001','ca110000-0000-4000-8000-000000000001','Notification','Learner');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,enrolled_to,status)
values('ca170000-0000-4000-8000-000000000001','ca110000-0000-4000-8000-000000000001','ca120000-0000-4000-8000-000000000002','ca160000-0000-4000-8000-000000000001',2026,current_date-30,current_date,'current');

insert into public.guardian_profiles(id,tenant_id,first_names,surname,status)
values('ca180000-0000-4000-8000-000000000001','ca110000-0000-4000-8000-000000000001','Notification','Guardian','active');

insert into public.learner_guardians(tenant_id,learner_id,guardian_id,relationship_type,effective_from,effective_to)
values('ca110000-0000-4000-8000-000000000001','ca160000-0000-4000-8000-000000000001','ca180000-0000-4000-8000-000000000001','guardian',current_date-30,current_date);

insert into public.guardian_user_links(tenant_id,guardian_id,user_id,linked_by_user_id)
values('ca110000-0000-4000-8000-000000000001','ca180000-0000-4000-8000-000000000001','ca100000-0000-4000-8000-000000000003','ca100000-0000-4000-8000-000000000003');

insert into public.platform_memberships(user_id,role_key,active_from)
values('ca100000-0000-4000-8000-000000000004','platform_support',current_date-30);

-- Seed rows while each relationship is valid. Tests below move time-bounded
-- relationships out of current authority without deleting notification history.
insert into public.notifications(id,recipient_user_id,tenant_id,school_id,title) values
  ('ca190000-0000-4000-8000-000000000001','ca100000-0000-4000-8000-000000000001','ca110000-0000-4000-8000-000000000001','ca120000-0000-4000-8000-000000000001','Older active school notice'),
  ('ca190000-0000-4000-8000-000000000002','ca100000-0000-4000-8000-000000000001','ca110000-0000-4000-8000-000000000001','ca120000-0000-4000-8000-000000000002','Current school notice'),
  ('ca190000-0000-4000-8000-000000000003','ca100000-0000-4000-8000-000000000002','ca110000-0000-4000-8000-000000000001','ca120000-0000-4000-8000-000000000002','Staff notice'),
  ('ca190000-0000-4000-8000-000000000004','ca100000-0000-4000-8000-000000000003','ca110000-0000-4000-8000-000000000001','ca120000-0000-4000-8000-000000000002','Guardian notice');

-- End staff, guardian, and enrolment authority after notification creation.
update public.staff_school_assignments set effective_to=current_date-1 where id='ca150000-0000-4000-8000-000000000001';
update public.learner_guardians set effective_to=current_date-1 where guardian_id='ca180000-0000-4000-8000-000000000001';
update public.enrolments set enrolled_to=current_date-1,status='transferred' where id='ca170000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ca100000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  (select count(*)::integer from public.notifications where id='ca190000-0000-4000-8000-000000000001'),
  0,
  'older still-active non-current school notification is not exposed'
);
select is(
  (select count(*)::integer from public.notifications where id='ca190000-0000-4000-8000-000000000002'),
  1,
  'deterministic current-school notification remains visible'
);
select is(
  public.mark_all_notifications_read(),
  1,
  'mark-all mutates only currently authorized notification rows'
);
select is(
  (select read_at is null from public.notifications where id='ca190000-0000-4000-8000-000000000002'),
  false,
  'current-school notification was marked read'
);

reset role;
select set_config('request.jwt.claim.sub','ca100000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.notifications where id='ca190000-0000-4000-8000-000000000003'),
  0,
  'ended staff placement no longer exposes school notification content'
);
select is(public.dismiss_all_notifications(),0,'ended staff placement cannot dismiss stale school notifications');
reset role;

select set_config('request.jwt.claim.sub','ca100000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.notifications where id='ca190000-0000-4000-8000-000000000004'),
  0,
  'ended guardian relationship/current enrolment no longer exposes school notification content'
);
select is(public.mark_all_notifications_read(),0,'ended guardian/enrolment authority cannot mark stale school notifications read');
reset role;

select throws_ok(
  $$insert into public.notifications(recipient_user_id,tenant_id,school_id,title)
    values('ca100000-0000-4000-8000-000000000004','ca110000-0000-4000-8000-000000000001','ca120000-0000-4000-8000-000000000002','School operational support notice')$$,
  'Notification scope mismatch: recipient is not related to school',
  'Platform Support is not a valid school-operational notification recipient relationship'
);

select ok(
  has_function_privilege('authenticated','app_private.can_access_notification_for_rls(uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.can_access_notification_for_rls(uuid)','EXECUTE'),
  'authenticated RLS can execute the narrow wrapper while anonymous access remains denied'
);

select * from finish();
rollback;
