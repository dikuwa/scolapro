begin;

select plan(11);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('ec000000-0000-4000-8000-000000000001','conduct-current-principal@example.test','authenticated','authenticated',now(),now()),
  ('ec000000-0000-4000-8000-000000000002','conduct-class-teacher@example.test','authenticated','authenticated',now(),now()),
  ('ec000000-0000-4000-8000-000000000003','conduct-platform-support@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,region,town,status) values
  ('ec100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Conduct Other Active School','CONDUCT-OTHER','Erongo','Walvis Bay','active'),
  ('ec100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Conduct Current School','CONDUCT-CURRENT','Erongo','Swakopmund','active');

insert into public.school_memberships(id,tenant_id,school_id,user_id,role_key,active_from) values
  ('ec110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ec100000-0000-4000-8000-000000000001','ec000000-0000-4000-8000-000000000001','principal',current_date-30),
  ('ec110000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ec100000-0000-4000-8000-000000000002','ec000000-0000-4000-8000-000000000001','principal',current_date-5),
  ('ec110000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','ec100000-0000-4000-8000-000000000002','ec000000-0000-4000-8000-000000000002','class_teacher',current_date-5);

insert into public.platform_memberships(user_id,role_key,active_from)
values('ec000000-0000-4000-8000-000000000003','platform_support',current_date);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('ec120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ec000000-0000-4000-8000-000000000002','COND-CT-01','Conduct','Teacher','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values (
  'ec130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ec100000-0000-4000-8000-000000000002',
  'ec120000-0000-4000-8000-000000000001','teacher',current_date-20,null,'ec000000-0000-4000-8000-000000000001'
);

set local session_replication_role = replica;

insert into public.register_classes(id,tenant_id,school_id,grade_id,academic_year,class_code,display_name,register_teacher_staff_id) values
  ('ec140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ec100000-0000-4000-8000-000000000002','ec141000-0000-4000-8000-000000000001',2026,'COND-A','Conduct A','ec120000-0000-4000-8000-000000000001');

insert into public.learners(id,tenant_id,first_names,surname) values
  ('ec150000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Other','Learner'),
  ('ec150000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Current','Learner'),
  ('ec150000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Ended','Learner'),
  ('ec150000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','Class','Learner');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,grade_id,register_class_id,enrolled_from,enrolled_to,status) values
  ('ec160000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ec100000-0000-4000-8000-000000000001','ec150000-0000-4000-8000-000000000001',2026,'ec141000-0000-4000-8000-000000000001',null,current_date-30,null,'current'),
  ('ec160000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ec100000-0000-4000-8000-000000000002','ec150000-0000-4000-8000-000000000002',2026,'ec141000-0000-4000-8000-000000000001',null,current_date-30,null,'current'),
  ('ec160000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','ec100000-0000-4000-8000-000000000002','ec150000-0000-4000-8000-000000000003',2026,'ec141000-0000-4000-8000-000000000001',null,current_date-30,current_date-1,'withdrawn'),
  ('ec160000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','ec100000-0000-4000-8000-000000000002','ec150000-0000-4000-8000-000000000004',2026,'ec141000-0000-4000-8000-000000000001','ec140000-0000-4000-8000-000000000001',current_date-30,null,'current');

insert into public.conduct_policy_categories(id,tenant_id,school_id,domain,direction,code,display_name,default_severity,active) values
  ('ec170000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ec100000-0000-4000-8000-000000000001','conduct','negative','OTHER','Other incident','routine',true),
  ('ec170000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ec100000-0000-4000-8000-000000000002','conduct','negative','CURRENT','Current incident','routine',true);

insert into public.conduct_events(
  id,tenant_id,school_id,learner_id,enrolment_id,occurred_on,direction,category_code,severity,summary,status,recorded_by_user_id
) values (
  'ec180000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ec100000-0000-4000-8000-000000000001',
  'ec150000-0000-4000-8000-000000000001','ec160000-0000-4000-8000-000000000001',current_date,'negative','OTHER','routine','Historical other-school incident','recorded','ec000000-0000-4000-8000-000000000001'
);

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ec000000-0000-4000-8000-000000000001',true);

select is(
  has_function_privilege('authenticated','app_private.user_current_school_matches(uuid,uuid)','EXECUTE'),
  false,
  'authenticated callers cannot execute the private deterministic current-school helper directly'
);
select is(
  has_function_privilege('anon','app_private.user_current_school_matches(uuid,uuid)','EXECUTE'),
  false,
  'anonymous callers cannot execute the private deterministic current-school helper'
);
select is(
  app_private.can_access_learner_observations('ec100000-0000-4000-8000-000000000001','ec150000-0000-4000-8000-000000000001'),
  false,
  'school-local principal authority cannot target another active non-current school'
);
select is(
  (select count(*)::integer from public.conduct_events where id='ec180000-0000-4000-8000-000000000001'),
  0,
  'RLS hides sensitive conduct history from another active non-current school'
);
select throws_ok(
  $$select public.create_conduct_event_group(
      'ec100000-0000-4000-8000-000000000001','ec170000-0000-4000-8000-000000000001','routine','Blocked other-school incident','',current_date,
      array['ec150000-0000-4000-8000-000000000001'::uuid]
    )$$,
  'Learner is outside your conduct scope',
  'another active non-current school cannot receive a conduct write'
);
select lives_ok(
  $$select public.create_conduct_event_group(
      'ec100000-0000-4000-8000-000000000002','ec170000-0000-4000-8000-000000000002','routine','Current-school incident','',current_date,
      array['ec150000-0000-4000-8000-000000000002'::uuid]
    )$$,
  'current-school principal can record a current learner incident'
);
select throws_ok(
  $$select public.create_conduct_event_group(
      'ec100000-0000-4000-8000-000000000002','ec170000-0000-4000-8000-000000000002','routine','Ended learner incident','',current_date,
      array['ec150000-0000-4000-8000-000000000003'::uuid]
    )$$,
  'Learner is not enrolled in this school on the event date',
  'ended learner enrolment cannot receive a new conduct incident'
);

select set_config('request.jwt.claim.sub','ec000000-0000-4000-8000-000000000002',true);
select is(
  app_private.can_access_learner_observations('ec100000-0000-4000-8000-000000000002','ec150000-0000-4000-8000-000000000004'),
  true,
  'current class teacher with governed placement can access class learner observations'
);

reset role;
update public.staff_school_assignments
set effective_to=current_date-1
where id='ec130000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ec000000-0000-4000-8000-000000000002',true);
select is(
  app_private.can_access_learner_observations('ec100000-0000-4000-8000-000000000002','ec150000-0000-4000-8000-000000000004'),
  false,
  'ended class-teacher placement removes learner observation authority'
);

reset role;
select throws_ok(
  $$insert into public.conduct_events(
      id,tenant_id,school_id,learner_id,enrolment_id,occurred_on,direction,category_code,severity,summary,status,recorded_by_user_id
    ) values (
      'ec180000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ec100000-0000-4000-8000-000000000002',
      'ec150000-0000-4000-8000-000000000004','ec160000-0000-4000-8000-000000000004',current_date,'negative','CURRENT','routine','Stale recorder incident','recorded','ec000000-0000-4000-8000-000000000002'
    )$$,
  'Learner observation recorder mismatch: user is not authorized for learner',
  'physical recorder provenance guard rejects stale class-teacher placement without exposing its private helper'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ec000000-0000-4000-8000-000000000003',true);
select is(
  (select count(*)::integer from public.conduct_events),
  0,
  'Platform Support cannot read sensitive school conduct records'
);

select * from finish();
rollback;
