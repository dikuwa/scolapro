begin;

select plan(9);

insert into public.schools(id,tenant_id,name)
values(
  'fe810000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Library Borrower Placement School'
);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fe820000-0000-4000-8000-000000000001','library-borrower-actor@example.test','authenticated','authenticated',now(),now()),
  ('fe820000-0000-4000-8000-000000000002','library-stale-borrower@example.test','authenticated','authenticated',now(),now()),
  ('fe820000-0000-4000-8000-000000000003','library-legacy-borrower@example.test','authenticated','authenticated',now(),now()),
  ('fe820000-0000-4000-8000-000000000004','library-borrower-support@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('fe830000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fe820000-0000-4000-8000-000000000002','LIB-BORROW-STALE','Stale','Borrower','active'),
  ('fe830000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fe820000-0000-4000-8000-000000000003','LIB-BORROW-LEGACY','Legacy','Borrower','active');

insert into public.staff_school_assignments(
  tenant_id,school_id,staff_member_id,assignment_type,position_title,effective_from,effective_to,created_by_user_id
) values(
  '11111111-1111-4111-8111-111111111111','fe810000-0000-4000-8000-000000000001','fe830000-0000-4000-8000-000000000001','teacher','Teacher',app_private.learning_resource_today()-60,app_private.learning_resource_today()-1,'fe820000-0000-4000-8000-000000000001'
);

insert into public.school_memberships(
  tenant_id,school_id,user_id,staff_member_id,role_key,active_from
) values
  ('11111111-1111-4111-8111-111111111111','fe810000-0000-4000-8000-000000000001','fe820000-0000-4000-8000-000000000001',null,'librarian',app_private.learning_resource_today()-30),
  ('11111111-1111-4111-8111-111111111111','fe810000-0000-4000-8000-000000000001','fe820000-0000-4000-8000-000000000002','fe830000-0000-4000-8000-000000000001','teacher',app_private.learning_resource_today()-60),
  ('11111111-1111-4111-8111-111111111111','fe810000-0000-4000-8000-000000000001','fe820000-0000-4000-8000-000000000003','fe830000-0000-4000-8000-000000000002','teacher',app_private.learning_resource_today()-60),
  ('11111111-1111-4111-8111-111111111111','fe810000-0000-4000-8000-000000000001','fe820000-0000-4000-8000-000000000004',null,'librarian',app_private.learning_resource_today()-30);

insert into public.platform_memberships(user_id,role_key,active_from)
values('fe820000-0000-4000-8000-000000000004','platform_support',app_private.learning_resource_today()-30);

insert into public.learning_resource_titles(id,tenant_id,school_id,resource_type,title,status)
values(
  'fe840000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fe810000-0000-4000-8000-000000000001','library_book','Borrower Placement Book','active'
);

insert into public.learning_resource_copies(id,tenant_id,school_id,title_id,barcode,condition,availability) values
  ('fe850000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fe810000-0000-4000-8000-000000000001','fe840000-0000-4000-8000-000000000001','LIB-BORROW-001','good','available'),
  ('fe850000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fe810000-0000-4000-8000-000000000001','fe840000-0000-4000-8000-000000000001','LIB-BORROW-002','good','available');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fe820000-0000-4000-8000-000000000001',true);

select is(
  app_private.can_manage_ltsm('fe810000-0000-4000-8000-000000000001'),
  true,
  'current librarian retains Library management authority'
);

select is(
  (select count(*)::integer from public.list_learning_resource_staff_borrowers('fe810000-0000-4000-8000-000000000001') where staff_member_id='fe830000-0000-4000-8000-000000000001'),
  0,
  'ended authoritative staff placement is not resurrected by stale membership in borrower visibility'
);

select is(
  (select count(*)::integer from public.list_learning_resource_staff_borrowers('fe810000-0000-4000-8000-000000000001') where staff_member_id='fe830000-0000-4000-8000-000000000002'),
  1,
  'legacy membership remains a borrower fallback when no authoritative assignment history exists'
);

select throws_ok(
  $$select public.issue_learning_resource('fe850000-0000-4000-8000-000000000001',null,'fe830000-0000-4000-8000-000000000001',current_date+14,'stale borrower')$$,
  'Staff member is not active at this school',
  'stale membership cannot issue a Library loan after authoritative placement ended'
);

select is(
  (select count(*)::integer from public.learning_resource_loans where copy_id='fe850000-0000-4000-8000-000000000001'),
  0,
  'denied stale-borrower issue leaves no historical loan row'
);

select lives_ok(
  $$select public.issue_learning_resource('fe850000-0000-4000-8000-000000000002',null,'fe830000-0000-4000-8000-000000000002',current_date+14,'legacy borrower')$$,
  'eligible legacy borrower can still receive a Library loan'
);

select is(
  (select issued_by_user_id from public.learning_resource_loans where copy_id='fe850000-0000-4000-8000-000000000002'),
  'fe820000-0000-4000-8000-000000000001'::uuid,
  'successful issue preserves authenticated issuer provenance'
);

select is(
  (select staff_member_id from public.learning_resource_loans where copy_id='fe850000-0000-4000-8000-000000000002'),
  'fe830000-0000-4000-8000-000000000002'::uuid,
  'successful issue preserves borrower provenance'
);

select set_config('request.jwt.claim.sub','fe820000-0000-4000-8000-000000000004',true);
select is(
  (select count(*)::integer from public.list_learning_resource_staff_borrowers('fe810000-0000-4000-8000-000000000001')),
  0,
  'Platform Support cannot enumerate school Library staff borrowers through a school-local role'
);

select * from finish();
rollback;
