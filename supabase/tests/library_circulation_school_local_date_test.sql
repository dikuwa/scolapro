begin;

select plan(9);

insert into public.schools(id,tenant_id,name)
values(
  'fd750000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Library Boundary School B'
);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fd740000-0000-4000-8000-000000000001','library-local@example.test','authenticated','authenticated',now(),now()),
  ('fd740000-0000-4000-8000-000000000002','library-platform@example.test','authenticated','authenticated',now(),now()),
  ('fd740000-0000-4000-8000-000000000003','library-ltsm@example.test','authenticated','authenticated',now(),now()),
  ('fd740000-0000-4000-8000-000000000004','library-principal@example.test','authenticated','authenticated',now(),now()),
  ('fd740000-0000-4000-8000-000000000005','library-other-school@example.test','authenticated','authenticated',now(),now()),
  ('fd740000-0000-4000-8000-000000000006','library-expired@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from,active_to) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd740000-0000-4000-8000-000000000001','librarian',app_private.learning_resource_today()-30,null),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd740000-0000-4000-8000-000000000003','ltsm',app_private.learning_resource_today()-30,null),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd740000-0000-4000-8000-000000000004','principal',app_private.learning_resource_today()-30,null),
  ('11111111-1111-4111-8111-111111111111','fd750000-0000-4000-8000-000000000001','fd740000-0000-4000-8000-000000000005','librarian',app_private.learning_resource_today()-30,null),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd740000-0000-4000-8000-000000000006','librarian',app_private.learning_resource_today()-60,app_private.learning_resource_today()-1);

insert into public.platform_memberships(user_id,role_key,active_from)
values(
  'fd740000-0000-4000-8000-000000000002',
  'platform_admin',
  app_private.learning_resource_today()-30
);

insert into public.learners(id,tenant_id,first_names,surname)
values(
  'fd760000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Library','Borrower'
);

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,status
) values(
  'fd770000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fd760000-0000-4000-8000-000000000001',
  extract(year from app_private.learning_resource_today())::integer,
  'LIB-BOUNDARY-001',
  app_private.learning_resource_today()-30,
  'current'
);

insert into public.learning_resource_titles(
  id,tenant_id,school_id,resource_type,title,status
) values(
  'fd780000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'library_book','Library Security Boundary Book','active'
);

insert into public.learning_resource_copies(
  id,tenant_id,school_id,title_id,barcode,condition,availability
) values
  ('fd790000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd780000-0000-4000-8000-000000000001','LIB-BOUNDARY-001','good','available'),
  ('fd790000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd780000-0000-4000-8000-000000000001','LIB-BOUNDARY-002','good','available');

insert into public.learning_resource_loans(
  id,tenant_id,school_id,copy_id,learner_id,issued_on,due_on,issued_condition,status,issued_by_user_id
) values(
  'fd7a0000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fd790000-0000-4000-8000-000000000002',
  'fd760000-0000-4000-8000-000000000001',
  app_private.learning_resource_today()-1,
  app_private.learning_resource_today()+14,
  'good','open','fd740000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','fd740000-0000-4000-8000-000000000001',true);
select ok(
  app_private.can_manage_ltsm('22222222-2222-4222-8222-222222222222'),
  'school-local librarian is authorized by current-user circulation predicate'
);

select set_config('request.jwt.claim.sub','fd740000-0000-4000-8000-000000000003',true);
select ok(
  app_private.can_manage_ltsm('22222222-2222-4222-8222-222222222222'),
  'school-local ltsm role is authorized by current-user circulation predicate'
);

select set_config('request.jwt.claim.sub','fd740000-0000-4000-8000-000000000004',true);
select ok(
  app_private.can_manage_ltsm('22222222-2222-4222-8222-222222222222'),
  'school leadership remains authorized by current-user circulation predicate'
);

select set_config('request.jwt.claim.sub','fd740000-0000-4000-8000-000000000002',true);
select ok(
  not app_private.can_manage_ltsm('22222222-2222-4222-8222-222222222222'),
  'platform admin with no school membership is denied by can_manage_ltsm'
);

select throws_ok(
  $$select public.issue_learning_resource(
    'fd790000-0000-4000-8000-000000000001',
    'fd760000-0000-4000-8000-000000000001',
    null,
    app_private.learning_resource_today()+14,
    'platform-only issue attempt'
  )$$,
  'Permission denied',
  'platform admin with no school membership cannot issue a learning resource'
);

select throws_ok(
  $$select public.return_learning_resource(
    'fd7a0000-0000-4000-8000-000000000001',
    'good',
    'platform-only return attempt'
  )$$,
  'Permission denied',
  'platform admin with no school membership cannot return a learning resource'
);

select set_config('request.jwt.claim.sub','fd740000-0000-4000-8000-000000000005',true);
select ok(
  not app_private.can_manage_ltsm('22222222-2222-4222-8222-222222222222'),
  'librarian at another school is denied circulation authority here'
);

select set_config('request.jwt.claim.sub','fd740000-0000-4000-8000-000000000006',true);
select ok(
  not app_private.can_manage_ltsm('22222222-2222-4222-8222-222222222222'),
  'expired school circulation membership is denied'
);

select is(
  app_private.learning_resource_today(),
  (now() at time zone 'Africa/Windhoek')::date,
  'circulation lifecycle resolves today in Namibia local time'
);

select * from finish();
rollback;
