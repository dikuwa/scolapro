begin;

select plan(5);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values(
  'fde00000-0000-4000-8000-000000000001',
  'ltsm-period-librarian@example.test',
  'authenticated','authenticated',now(),now()
);

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fde00000-0000-4000-8000-000000000001',
  'librarian',current_date-30
);

insert into public.learners(id,tenant_id,first_names,surname)
values
  (
    'fde10000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'Current','Borrower'
  ),
  (
    'fde10000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    'Future','Borrower'
  );

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,enrolled_to,status
) values
  (
    'fde20000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'fde10000-0000-4000-8000-000000000001',
    extract(year from current_date)::integer,
    'LTSM-CURRENT-001',current_date-60,null,'current'
  ),
  (
    'fde20000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'fde10000-0000-4000-8000-000000000002',
    extract(year from current_date)::integer+1,
    'LTSM-FUTURE-001',current_date+60,null,'current'
  );

insert into public.learning_resource_titles(
  id,tenant_id,school_id,resource_type,title,status
) values(
  'fde30000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'library_book','Effective Enrolment Test Book','active'
);

insert into public.learning_resource_copies(
  id,tenant_id,school_id,title_id,barcode,condition,availability
) values
  (
    'fde40000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'fde30000-0000-4000-8000-000000000001',
    'LTSM-PERIOD-001','good','available'
  ),
  (
    'fde40000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'fde30000-0000-4000-8000-000000000001',
    'LTSM-PERIOD-002','good','available'
  );

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fde00000-0000-4000-8000-000000000001',true);

select throws_ok(
  $$select public.issue_learning_resource(
    'fde40000-0000-4000-8000-000000000002',
    'fde10000-0000-4000-8000-000000000002',null,current_date+14,null
  )$$,
  'Learner is not currently enrolled at this school',
  'future-start current-status learner cannot borrow school inventory before enrolment begins'
);

select is(
  (select availability from public.learning_resource_copies where id='fde40000-0000-4000-8000-000000000002'),
  'available',
  'rejected future learner issue leaves the copy available'
);

select is(
  (select count(*)::integer from public.learning_resource_loans where learner_id='fde10000-0000-4000-8000-000000000002'),
  0,
  'rejected future learner issue creates no loan history'
);

select lives_ok(
  $$select public.issue_learning_resource(
    'fde40000-0000-4000-8000-000000000001',
    'fde10000-0000-4000-8000-000000000001',null,current_date+14,'Current learner issue'
  )$$,
  'learner whose enrolment is effective today remains eligible to borrow'
);

select is(
  (select availability from public.learning_resource_copies where id='fde40000-0000-4000-8000-000000000001'),
  'on_loan',
  'successful current learner issue still synchronizes copy availability'
);

select * from finish();
rollback;
