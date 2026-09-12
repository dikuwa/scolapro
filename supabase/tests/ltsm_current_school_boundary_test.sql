begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fb000000-0000-4000-8000-000000000001','ltsm-current-school@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values('fb100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','LTSM Deterministic Current School','LTSM-CURRENT-2','Erongo','Swakopmund','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb000000-0000-4000-8000-000000000001','librarian','2026-01-01'),
('11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001','librarian','2026-02-01');

insert into public.learners(id,tenant_id,first_names,surname) values
('fb200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Current','LTSM Borrower'),
('fb200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Ended','LTSM Borrower');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,enrolled_to,status) values
('fb300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb200000-0000-4000-8000-000000000001',2026,'LTSM-CUR-001','2026-01-15',null,'current'),
('fb300000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb200000-0000-4000-8000-000000000002',2026,'LTSM-END-001','2026-01-15','2026-06-30','withdrawn');

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values('fb600000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','LTSM-END-STAFF','Ended','Staff Borrower','active');

insert into public.staff_school_assignments(
  tenant_id,school_id,staff_member_id,assignment_type,position_title,effective_from,effective_to,created_by_user_id
) values(
  '11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb600000-0000-4000-8000-000000000001','teacher','Teacher','2026-01-01','2026-06-30','fb000000-0000-4000-8000-000000000001'
);

insert into public.learning_resource_titles(id,tenant_id,school_id,resource_type,title,status) values
('fb400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','textbook','Non-current School Textbook','active'),
('fb400000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','textbook','Current School Textbook','active');

insert into public.learning_resource_copies(id,tenant_id,school_id,title_id,barcode,condition,availability) values
('fb500000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb400000-0000-4000-8000-000000000001','LTSM-NONCURRENT-001','good','available'),
('fb500000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb400000-0000-4000-8000-000000000002','LTSM-CURRENT-001','good','available'),
('fb500000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb400000-0000-4000-8000-000000000002','LTSM-CURRENT-002','good','available'),
('fb500000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','fb400000-0000-4000-8000-000000000002','LTSM-CURRENT-003','good','available');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000001',true);

select is(app_private.can_manage_ltsm('22222222-2222-4222-8222-222222222222'),false,'older still-active school cannot be managed as LTSM non-current school');
select is(app_private.can_manage_ltsm('fb100000-0000-4000-8000-000000000001'),true,'later active membership is the deterministic current-school LTSM authority');
select is((select count(*)::integer from public.learning_resource_titles where id='fb400000-0000-4000-8000-000000000001'),0,'non-current school catalogue row is hidden from the LTSM actor');

select throws_ok(
  $$select public.issue_learning_resource('fb500000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',null,current_date+14,null)$$,
  'Permission denied',
  'security-definer issue RPC cannot target another active non-current school directly'
);

select lives_ok(
  $$select public.issue_learning_resource('fb500000-0000-4000-8000-000000000002','fb200000-0000-4000-8000-000000000001',null,current_date+14,'current-school issue')$$,
  'current-school librarian can issue to an effective current learner'
);

select throws_ok(
  $$select public.issue_learning_resource('fb500000-0000-4000-8000-000000000003','fb200000-0000-4000-8000-000000000002',null,current_date+14,null)$$,
  'Learner is not currently enrolled at this school',
  'ended enrolment cannot create a new learning-resource loan'
);

select throws_ok(
  $$select public.issue_learning_resource('fb500000-0000-4000-8000-000000000004',null,'fb600000-0000-4000-8000-000000000001',current_date+14,null)$$,
  'Staff member is not active at this school',
  'ended staff placement cannot create a new learning-resource loan'
);

select is(
  (select issued_by_user_id from public.learning_resource_loans where copy_id='fb500000-0000-4000-8000-000000000002'),
  'fb000000-0000-4000-8000-000000000001'::uuid,
  'successful issue preserves authenticated issuer provenance'
);

select lives_ok(
  $$select public.return_learning_resource((select id from public.learning_resource_loans where copy_id='fb500000-0000-4000-8000-000000000002'),'good','current-school return')$$,
  'current-school governed return remains available'
);

select * from finish();
rollback;
