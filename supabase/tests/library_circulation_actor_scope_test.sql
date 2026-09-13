begin;

select plan(12);

insert into public.schools(id,tenant_id,name)
values(
  'fc810000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Library Actor Scope School'
);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fc820000-0000-4000-8000-000000000001','library-current-actor@example.test','authenticated','authenticated',now(),now()),
  ('fc820000-0000-4000-8000-000000000002','library-stale-actor@example.test','authenticated','authenticated',now(),now()),
  ('fc820000-0000-4000-8000-000000000003','library-support-actor@example.test','authenticated','authenticated',now(),now()),
  ('fc820000-0000-4000-8000-000000000004','library-return-actor@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status) values
  ('fc830000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','LIB-ACTOR-CURRENT','Current','Librarian','active'),
  ('fc830000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','LIB-ACTOR-STALE','Stale','Librarian','active');

insert into public.staff_school_assignments(
  tenant_id,school_id,staff_member_id,assignment_type,position_title,effective_from,effective_to,created_by_user_id
) values
  ('11111111-1111-4111-8111-111111111111','fc810000-0000-4000-8000-000000000001','fc830000-0000-4000-8000-000000000001','management','Librarian',app_private.learning_resource_today()-30,null,'fc820000-0000-4000-8000-000000000001'),
  ('11111111-1111-4111-8111-111111111111','fc810000-0000-4000-8000-000000000001','fc830000-0000-4000-8000-000000000002','management','Librarian',app_private.learning_resource_today()-60,app_private.learning_resource_today()-1,'fc820000-0000-4000-8000-000000000001');

insert into public.school_memberships(
  tenant_id,school_id,user_id,staff_member_id,role_key,active_from
) values
  ('11111111-1111-4111-8111-111111111111','fc810000-0000-4000-8000-000000000001','fc820000-0000-4000-8000-000000000001','fc830000-0000-4000-8000-000000000001','librarian',app_private.learning_resource_today()-30),
  ('11111111-1111-4111-8111-111111111111','fc810000-0000-4000-8000-000000000001','fc820000-0000-4000-8000-000000000002','fc830000-0000-4000-8000-000000000002','librarian',app_private.learning_resource_today()-60),
  ('11111111-1111-4111-8111-111111111111','fc810000-0000-4000-8000-000000000001','fc820000-0000-4000-8000-000000000003',null,'librarian',app_private.learning_resource_today()-30),
  ('11111111-1111-4111-8111-111111111111','fc810000-0000-4000-8000-000000000001','fc820000-0000-4000-8000-000000000004',null,'librarian',app_private.learning_resource_today()-30);

insert into public.platform_memberships(user_id,role_key,active_from)
values('fc820000-0000-4000-8000-000000000003','platform_support',app_private.learning_resource_today()-30);

insert into public.learners(id,tenant_id,first_names,surname) values
  ('fc840000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Current','Borrower'),
  ('fc840000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Ended','Borrower');

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,enrolled_to,status
) values
  ('fc850000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc810000-0000-4000-8000-000000000001','fc840000-0000-4000-8000-000000000001',2026,'LIB-ACTOR-CURRENT',app_private.learning_resource_today()-30,null,'current'),
  ('fc850000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fc810000-0000-4000-8000-000000000001','fc840000-0000-4000-8000-000000000002',2026,'LIB-ACTOR-ENDED',app_private.learning_resource_today()-60,app_private.learning_resource_today()-1,'withdrawn');

insert into public.learning_resource_titles(id,tenant_id,school_id,resource_type,title,status)
values(
  'fc860000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc810000-0000-4000-8000-000000000001','library_book','Actor Scope Book','active'
);

insert into public.learning_resource_copies(id,tenant_id,school_id,title_id,barcode,condition,availability) values
  ('fc870000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc810000-0000-4000-8000-000000000001','fc860000-0000-4000-8000-000000000001','LIB-ACTOR-001','good','available'),
  ('fc870000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fc810000-0000-4000-8000-000000000001','fc860000-0000-4000-8000-000000000001','LIB-ACTOR-002','good','available'),
  ('fc870000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fc810000-0000-4000-8000-000000000001','fc860000-0000-4000-8000-000000000001','LIB-ACTOR-003','good','available');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','fc820000-0000-4000-8000-000000000001',true);
select is(
  app_private.can_manage_ltsm('fc810000-0000-4000-8000-000000000001'),
  true,
  'current librarian with effective linked placement retains circulation mutation authority'
);

select set_config('request.jwt.claim.sub','fc820000-0000-4000-8000-000000000002',true);
select is(
  app_private.can_manage_ltsm('fc810000-0000-4000-8000-000000000001'),
  false,
  'ended linked staff placement removes circulation mutation authority'
);
select throws_ok(
  $$select public.issue_learning_resource('fc870000-0000-4000-8000-000000000001','fc840000-0000-4000-8000-000000000001',null,current_date+14,null)$$,
  'Permission denied',
  'stale librarian cannot issue a new loan'
);

select set_config('request.jwt.claim.sub','fc820000-0000-4000-8000-000000000003',true);
select is(
  app_private.can_manage_ltsm('fc810000-0000-4000-8000-000000000001'),
  false,
  'Platform Support remains denied even with an active librarian school membership'
);
select throws_ok(
  $$select public.issue_learning_resource('fc870000-0000-4000-8000-000000000001','fc840000-0000-4000-8000-000000000001',null,current_date+14,null)$$,
  'Permission denied',
  'Platform Support cannot issue through a school-local library role'
);

select set_config('request.jwt.claim.sub','fc820000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.issue_learning_resource('fc870000-0000-4000-8000-000000000002','fc840000-0000-4000-8000-000000000002',null,current_date+14,null)$$,
  'Learner is not currently enrolled at this school',
  'ended learner enrolment cannot be used for a new circulation loan'
);
select lives_ok(
  $$select public.issue_learning_resource('fc870000-0000-4000-8000-000000000003','fc840000-0000-4000-8000-000000000001',null,current_date+14,'actor-scope issue')$$,
  'effective current learner can receive a loan from the current librarian'
);
select is(
  (select issued_by_user_id from public.learning_resource_loans where copy_id='fc870000-0000-4000-8000-000000000003'),
  'fc820000-0000-4000-8000-000000000001'::uuid,
  'loan preserves issuer provenance'
);

reset role;
update public.staff_school_assignments
set effective_to=app_private.learning_resource_today()-1
where staff_member_id='fc830000-0000-4000-8000-000000000001'
  and school_id='fc810000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fc820000-0000-4000-8000-000000000001',true);

select throws_ok(
  $$select public.return_learning_resource((select id from public.learning_resource_loans where copy_id='fc870000-0000-4000-8000-000000000003'),'good','stale actor return')$$,
  'Permission denied',
  'actor whose linked placement ended cannot return a loan'
);
select is(
  (select status from public.learning_resource_loans where copy_id='fc870000-0000-4000-8000-000000000003'),
  'open',
  'denied stale return preserves the historical open loan unchanged'
);

select set_config('request.jwt.claim.sub','fc820000-0000-4000-8000-000000000004',true);
select lives_ok(
  $$select public.return_learning_resource((select id from public.learning_resource_loans where copy_id='fc870000-0000-4000-8000-000000000003'),'good','authorized recovery return')$$,
  'another current authorized librarian can complete the return'
);
select ok(
  exists(
    select 1
    from public.learning_resource_loans
    where copy_id='fc870000-0000-4000-8000-000000000003'
      and status='returned'
      and issued_by_user_id='fc820000-0000-4000-8000-000000000001'
      and returned_by_user_id='fc820000-0000-4000-8000-000000000004'
      and returned_on=(now() at time zone 'Africa/Windhoek')::date
  ),
  'completed return preserves immutable issuer and authenticated return provenance'
);

select * from finish();
rollback;
