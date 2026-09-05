begin;

select plan(8);

select has_function(
  'app_private',
  'enforce_learning_resource_loan_scope_integrity',
  array[]::text[],
  'LTSM loan scope helper exists'
);

select trigger_is(
  'public',
  'learning_resource_loans',
  'learning_resource_loan_scope_integrity_trg',
  'app_private',
  'enforce_learning_resource_loan_scope_integrity',
  'LTSM loan scope trigger installed'
);

select is(
  has_function_privilege('anon','app_private.enforce_learning_resource_loan_scope_integrity()','EXECUTE'),
  false,
  'anon cannot execute LTSM loan scope helper'
);

select is(
  has_function_privilege('authenticated','app_private.enforce_learning_resource_loan_scope_integrity()','EXECUTE'),
  false,
  'authenticated cannot execute LTSM loan scope helper'
);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fa000000-0000-4000-8000-000000000001','ltsm-scope@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fa000000-0000-4000-8000-000000000001',
  'librarian',
  current_date
);

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('fa100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','LTSM Scope School B','LTSM-SCOPE-B','Khomas','Windhoek');

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values
  ('fa200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','LTSM-SCOPE-PLACED','Placed','Borrower','active'),
  ('fa200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','LTSM-SCOPE-UNPLACED','Unplaced','Borrower','active');

insert into public.staff_school_assignments(
  tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id
) values(
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fa200000-0000-4000-8000-000000000001','staff',current_date,'fa000000-0000-4000-8000-000000000001'
);

insert into public.learning_resource_titles(id,tenant_id,school_id,resource_type,title,status)
values
  ('fa300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','library_book','LTSM Scope A','active'),
  ('fa300000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fa100000-0000-4000-8000-000000000001','library_book','LTSM Scope B','active');

insert into public.learning_resource_copies(id,tenant_id,school_id,title_id,barcode,condition,availability)
values
  ('fa400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa300000-0000-4000-8000-000000000001','LTSM-SCOPE-A-1','good','available'),
  ('fa400000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa300000-0000-4000-8000-000000000001','LTSM-SCOPE-A-2','good','available'),
  ('fa400000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fa100000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000002','LTSM-SCOPE-B-1','good','available');

select lives_ok(
  $$insert into public.learning_resource_loans(
      id,tenant_id,school_id,copy_id,staff_member_id,issued_on,issued_condition,issued_by_user_id
    ) values(
      'fa500000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'fa400000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001',current_date,'good','fa000000-0000-4000-8000-000000000001'
    )$$,
  'direct service-level insert remains valid for staff placed at the copy school on issue date'
);

select throws_ok(
  $$insert into public.learning_resource_loans(
      tenant_id,school_id,copy_id,staff_member_id,issued_on,issued_condition,issued_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'fa400000-0000-4000-8000-000000000002','fa200000-0000-4000-8000-000000000002',current_date,'good','fa000000-0000-4000-8000-000000000001'
    )$$,
  'Learning resource loan scope mismatch: staff member has no school placement at issue date',
  'direct loan insert cannot bind same-tenant staff with no placement at the copy school'
);

select throws_ok(
  $$insert into public.learning_resource_loans(
      tenant_id,school_id,copy_id,learner_id,issued_on,issued_condition,issued_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','fa100000-0000-4000-8000-000000000001',
      'fa400000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000001',current_date,'good','fa000000-0000-4000-8000-000000000001'
    )$$,
  'Learning resource loan scope mismatch: learner has no school enrolment at issue date',
  'direct loan insert cannot bind a learner enrolled at another school in the same tenant'
);

select throws_ok(
  $$update public.learning_resource_loans
      set staff_member_id='fa200000-0000-4000-8000-000000000002'
    where id='fa500000-0000-4000-8000-000000000001'$$,
  'Learning resource loan scope and issue provenance are immutable',
  'borrower identity cannot be rebound after a loan is issued'
);

select * from finish();
rollback;
