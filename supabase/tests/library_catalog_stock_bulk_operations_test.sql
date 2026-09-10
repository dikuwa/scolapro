begin;

select plan(23);

insert into public.schools(id,tenant_id,name) values
  ('fb100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Library Bulk School A'),
  ('fb100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Library Bulk School B');

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fb110000-0000-4000-8000-000000000001','library-bulk-a@example.test','authenticated','authenticated',now(),now()),
  ('fb110000-0000-4000-8000-000000000002','library-bulk-b@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb110000-0000-4000-8000-000000000001','librarian',app_private.learning_resource_today()-30),
  ('11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000002','fb110000-0000-4000-8000-000000000002','librarian',app_private.learning_resource_today()-30);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status) values
  ('fb120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','MATH','Mathematics','active'),
  ('fb120000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000002','MATH-B','Mathematics B','active');

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name) values
  ('fb130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001',extract(year from app_private.learning_resource_today())::integer,'9','Grade 9'),
  ('fb130000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000002',extract(year from app_private.learning_resource_today())::integer,'9','Grade 9');

insert into public.register_classes(id,tenant_id,school_id,grade_id,academic_year,class_code,display_name) values
  ('fb140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb130000-0000-4000-8000-000000000001',extract(year from app_private.learning_resource_today())::integer,'9A','Grade 9A'),
  ('fb140000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000002','fb130000-0000-4000-8000-000000000002',extract(year from app_private.learning_resource_today())::integer,'9B','Grade 9B');

insert into public.learners(id,tenant_id,first_names,surname) values
  ('fb150000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Bulk','Learner One'),
  ('fb150000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Bulk','Learner Two'),
  ('fb150000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Other','School Learner');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,grade_id,register_class_id,admission_number,enrolled_from,status) values
  ('fb160000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb150000-0000-4000-8000-000000000001',extract(year from app_private.learning_resource_today())::integer,'fb130000-0000-4000-8000-000000000001','fb140000-0000-4000-8000-000000000001','BULK-001',app_private.learning_resource_today()-30,'current'),
  ('fb160000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb150000-0000-4000-8000-000000000002',extract(year from app_private.learning_resource_today())::integer,'fb130000-0000-4000-8000-000000000001','fb140000-0000-4000-8000-000000000001','BULK-002',app_private.learning_resource_today()-30,'current'),
  ('fb160000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000002','fb150000-0000-4000-8000-000000000003',extract(year from app_private.learning_resource_today())::integer,'fb130000-0000-4000-8000-000000000002','fb140000-0000-4000-8000-000000000002','OTHER-001',app_private.learning_resource_today()-30,'current');

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status) values
  ('fb170000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','STAFF-A','Active','Assignment Only','active'),
  ('fb170000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','STAFF-X','Expired','Assignment','active'),
  ('fb170000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','STAFF-B','Other','School Staff','active'),
  ('fb170000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','STAFF-I','Inactive','Staff','inactive');

insert into public.staff_school_assignments(tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id) values
  ('11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb170000-0000-4000-8000-000000000001','staff',app_private.learning_resource_today()-30,null,'fb110000-0000-4000-8000-000000000001'),
  ('11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb170000-0000-4000-8000-000000000002','staff',app_private.learning_resource_today()-60,app_private.learning_resource_today()-1,'fb110000-0000-4000-8000-000000000001'),
  ('11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000002','fb170000-0000-4000-8000-000000000003','staff',app_private.learning_resource_today()-30,null,'fb110000-0000-4000-8000-000000000002'),
  ('11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb170000-0000-4000-8000-000000000004','staff',app_private.learning_resource_today()-30,null,'fb110000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb110000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.save_learning_resource_title(
    'fb100000-0000-4000-8000-000000000001','textbook','Grade 9 Mathematics',null,
    'Author','Publisher','978-TEST-001','fb120000-0000-4000-8000-000000000001','fb130000-0000-4000-8000-000000000001','1st','Textbook','active'
  )$$,
  'authorized librarian can create a canonical resource title'
);

select is(
  (select subject_code from public.learning_resource_titles where isbn='978-TEST-001'),
  'MATH',
  'title subject code is derived from canonical school subject'
);

select is(
  (select grade_code from public.learning_resource_titles where isbn='978-TEST-001'),
  '9',
  'title grade code is derived from canonical school grade'
);

select throws_ok(
  $$select public.save_learning_resource_title(
    'fb100000-0000-4000-8000-000000000001','textbook','Bad subject',null,null,null,null,
    'fb120000-0000-4000-8000-000000000002',null,null,null,'active'
  )$$,
  'Subject is not configured for this school',
  'another-school subject cannot be mapped into this school catalog'
);

select set_config('request.jwt.claim.sub','fb110000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select public.save_learning_resource_title('fb100000-0000-4000-8000-000000000001','textbook','Cross school')$$,
  'Permission denied',
  'another-school librarian cannot create a title here'
);
select set_config('request.jwt.claim.sub','fb110000-0000-4000-8000-000000000001',true);

select is(
  cardinality(public.add_learning_resource_copies(
    (select id from public.learning_resource_titles where isbn='978-TEST-001'),
    '[{"barcode":"BULK-COPY-001","asset_number":"BULK-ASSET-001","condition":"good","availability":"available","location_label":"Shelf A"},{"barcode":"BULK-COPY-002","asset_number":"BULK-ASSET-002","condition":"good","availability":"available","location_label":"Shelf A"}]'::jsonb
  )),
  2,
  'authorized batch creates multiple physical copies under one title'
);

select throws_ok(
  $$select public.add_learning_resource_copies(
    (select id from public.learning_resource_titles where isbn='978-TEST-001'),
    '[{"barcode":"BULK-COPY-001","condition":"good","availability":"available"}]'::jsonb
  )$$,
  'duplicate key value violates unique constraint "learning_resource_copies_school_id_barcode_key"',
  'school-local duplicate barcode is rejected'
);

select is(
  (select count(*)::integer from public.list_learning_resource_staff_borrowers('fb100000-0000-4000-8000-000000000001')),
  1,
  'staff borrower read model includes only current active staff for the school'
);

select is(
  (select staff_member_id from public.list_learning_resource_staff_borrowers('fb100000-0000-4000-8000-000000000001')),
  'fb170000-0000-4000-8000-000000000001'::uuid,
  'assignment-only active staff is discoverable as a legitimate borrower'
);

select is(
  cardinality(public.bulk_issue_learning_resources(
    jsonb_build_array(
      jsonb_build_object('copy_id',(select id from public.learning_resource_copies where barcode='BULK-COPY-001'),'learner_id','fb150000-0000-4000-8000-000000000001'),
      jsonb_build_object('copy_id',(select id from public.learning_resource_copies where barcode='BULK-COPY-002'),'learner_id','fb150000-0000-4000-8000-000000000002')
    ),
    app_private.learning_resource_today()+14,
    'Grade 9A bulk issue'
  )),
  2,
  'class-scale bulk issue delegates two learner/copy pairs to canonical lifecycle'
);

select is(
  (select count(*)::integer from public.learning_resource_loans where school_id='fb100000-0000-4000-8000-000000000001' and issued_on=app_private.learning_resource_today()),
  2,
  'bulk-issued loans use Namibia-local issue date semantics'
);

select throws_ok(
  $$select public.issue_learning_resource(
    (select id from public.learning_resource_copies where barcode='BULK-COPY-001'),
    'fb150000-0000-4000-8000-000000000001',null,app_private.learning_resource_today()+14,null
  )$$,
  'Resource copy is not available',
  'one active loan per copy remains enforced by canonical issue lifecycle'
);

select throws_ok(
  $$select public.bulk_issue_learning_resources(
    jsonb_build_array(
      jsonb_build_object('copy_id',(select id from public.learning_resource_copies where barcode='BULK-COPY-001'),'learner_id','fb150000-0000-4000-8000-000000000001'),
      jsonb_build_object('copy_id',(select id from public.learning_resource_copies where barcode='BULK-COPY-001'),'learner_id','fb150000-0000-4000-8000-000000000002')
    ),null,null
  )$$,
  'A copy cannot be paired more than once',
  'short stock cannot be over-allocated by pairing one copy to multiple learners'
);

select throws_ok(
  $$select public.save_learning_resource_title(
    'fb100000-0000-4000-8000-000000000001','textbook','Grade 9 Mathematics',
    (select id from public.learning_resource_titles where isbn='978-TEST-001'),
    'Author','Publisher','978-TEST-001','fb120000-0000-4000-8000-000000000001','fb130000-0000-4000-8000-000000000001','1st','Textbook','archived'
  )$$,
  'Resource title has active loans',
  'title cannot be archived while copies have active loans'
);

select is(
  public.bulk_return_learning_resources(
    jsonb_build_array(
      jsonb_build_object('loan_id',(select id from public.learning_resource_loans where copy_id=(select id from public.learning_resource_copies where barcode='BULK-COPY-001')),'condition','damaged'),
      jsonb_build_object('loan_id',(select id from public.learning_resource_loans where copy_id=(select id from public.learning_resource_copies where barcode='BULK-COPY-002')),'condition','lost')
    )
  ),
  2,
  'bulk return delegates class exceptions to canonical return lifecycle'
);

select is(
  (select availability from public.learning_resource_copies where barcode='BULK-COPY-001'),
  'repair',
  'damaged bulk return sends copy to repair state'
);

select is(
  (select availability from public.learning_resource_copies where barcode='BULK-COPY-002'),
  'lost',
  'lost bulk return preserves terminal lost copy state'
);

select lives_ok(
  $$select public.bulk_return_learning_resources(
    jsonb_build_array(
      jsonb_build_object('loan_id',(select id from public.learning_resource_loans where copy_id=(select id from public.learning_resource_copies where barcode='BULK-COPY-001')),'condition','damaged'),
      jsonb_build_object('loan_id',(select id from public.learning_resource_loans where copy_id=(select id from public.learning_resource_copies where barcode='BULK-COPY-002')),'condition','lost')
    )
  )$$,
  'same bulk return can be safely retried through #379 idempotent finality'
);

select is(
  cardinality(public.add_learning_resource_copies(
    (select id from public.learning_resource_titles where isbn='978-TEST-001'),
    '[{"barcode":"BULK-COPY-003","condition":"good","availability":"available"},{"barcode":"BULK-COPY-004","condition":"good","availability":"available"}]'::jsonb
  )),
  2,
  'additional available stock can be added for boundary tests'
);

select throws_ok(
  $$select public.issue_learning_resource(
    (select id from public.learning_resource_copies where barcode='BULK-COPY-003'),
    'fb150000-0000-4000-8000-000000000003',null,app_private.learning_resource_today()+14,null
  )$$,
  'Learner is not currently enrolled at this school',
  'another-school learner cannot receive this school copy'
);

select throws_ok(
  $$select public.issue_learning_resource(
    (select id from public.learning_resource_copies where barcode='BULK-COPY-004'),
    null,'fb170000-0000-4000-8000-000000000003',app_private.learning_resource_today()+14,null
  )$$,
  'Staff member is not active at this school',
  'another-school staff member cannot receive this school copy'
);

select set_config('request.jwt.claim.sub','fb110000-0000-4000-8000-000000000002',true);
select is(
  (select count(*)::integer from public.list_learning_resource_staff_borrowers('fb100000-0000-4000-8000-000000000001')),
  0,
  'another-school librarian receives no borrower rows from governed read model'
);

select ok(
  has_function_privilege('authenticated','public.bulk_issue_learning_resources(jsonb,date,text)','EXECUTE')
  and not has_function_privilege('anon','public.bulk_issue_learning_resources(jsonb,date,text)','EXECUTE')
  and not has_function_privilege('public','public.bulk_issue_learning_resources(jsonb,date,text)','EXECUTE'),
  'bulk issue RPC is executable only by authenticated role before internal school authorization'
);

select * from finish();
rollback;