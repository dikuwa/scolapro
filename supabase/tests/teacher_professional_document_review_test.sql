begin;

select plan(22);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
 ('49500000-0000-4000-8000-000000000001','owner-495@example.test','authenticated','authenticated',now(),now()),
 ('49500000-0000-4000-8000-000000000002','hod-495@example.test','authenticated','authenticated',now(),now()),
 ('49500000-0000-4000-8000-000000000003','wrong-hod-495@example.test','authenticated','authenticated',now(),now()),
 ('49500000-0000-4000-8000-000000000004','support-495@example.test','authenticated','authenticated',now(),now()),
 ('49500000-0000-4000-8000-000000000005','other-teacher-495@example.test','authenticated','authenticated',now(),now()),
 ('49500000-0000-4000-8000-000000000006','cross-tenant-hod-495@example.test','authenticated','authenticated',now(),now());

set local session_replication_role=replica;

insert into public.tenants(id,name,slug,status)
values('49590000-0000-4000-8000-000000000001','Review Foreign Tenant','review-foreign-495','active');
insert into public.schools(id,tenant_id,name,status) values
 ('49591000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Review Other School','active'),
 ('49591000-0000-4000-8000-000000000002','49590000-0000-4000-8000-000000000001','Review Foreign School','active');

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
 ('49510000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','49500000-0000-4000-8000-000000000001','T495','File','Owner','active'),
 ('49510000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','49500000-0000-4000-8000-000000000002','H495','Subject','Head','active'),
 ('49510000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','49500000-0000-4000-8000-000000000003','H495X','Wrong','Head','active'),
 ('49510000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','49500000-0000-4000-8000-000000000004','S495','Platform','Support','active'),
 ('49510000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','49500000-0000-4000-8000-000000000005','T495X','Other','Teacher','active'),
 ('49510000-0000-4000-8000-000000000006','49590000-0000-4000-8000-000000000001','49500000-0000-4000-8000-000000000006','H495F','Foreign','Head','active');

insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
 ('49520000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','49500000-0000-4000-8000-000000000001','49510000-0000-4000-8000-000000000001','teacher',current_date-30),
 ('49520000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','49500000-0000-4000-8000-000000000002','49510000-0000-4000-8000-000000000002','hod',current_date-30),
 ('49520000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','49500000-0000-4000-8000-000000000003','49510000-0000-4000-8000-000000000003','hod',current_date-30),
 ('49520000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','49500000-0000-4000-8000-000000000004','49510000-0000-4000-8000-000000000004','teacher',current_date-30),
 ('49520000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','49500000-0000-4000-8000-000000000005','49510000-0000-4000-8000-000000000005','teacher',current_date-30),
 ('49520000-0000-4000-8000-000000000006','49590000-0000-4000-8000-000000000001','49591000-0000-4000-8000-000000000002','49500000-0000-4000-8000-000000000006','49510000-0000-4000-8000-000000000006','hod',current_date-30);

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id) values
 ('49530000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','49510000-0000-4000-8000-000000000001','teacher',current_date-30,'49500000-0000-4000-8000-000000000001'),
 ('49530000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','49510000-0000-4000-8000-000000000002','management',current_date-30,'49500000-0000-4000-8000-000000000002'),
 ('49530000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','49510000-0000-4000-8000-000000000003','management',current_date-30,'49500000-0000-4000-8000-000000000003'),
 ('49530000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','49510000-0000-4000-8000-000000000004','support',current_date-30,'49500000-0000-4000-8000-000000000004'),
 ('49530000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','49510000-0000-4000-8000-000000000005','teacher',current_date-30,'49500000-0000-4000-8000-000000000005'),
 ('49530000-0000-4000-8000-000000000006','49590000-0000-4000-8000-000000000001','49591000-0000-4000-8000-000000000002','49510000-0000-4000-8000-000000000006','management',current_date-30,'49500000-0000-4000-8000-000000000006');

insert into public.platform_memberships(id,user_id,role_key,active_from)
values('49540000-0000-4000-8000-000000000001','49500000-0000-4000-8000-000000000004','platform_support',current_date-1);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name) values
 ('49550000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','PF-A','Professional File A'),
 ('49550000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','PF-B','Professional File B');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id) values
 ('49560000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'49550000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010'),
 ('49560000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'49550000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000010');

insert into public.teacher_allocations(id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from) values
 ('49570000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'49560000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','49510000-0000-4000-8000-000000000001',current_date-30),
 ('49570000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'49560000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','49510000-0000-4000-8000-000000000002',current_date-30);

insert into public.teacher_professional_documents(
 id,tenant_id,school_id,owner_staff_member_id,storage_path,original_filename,mime_type,file_size,title,status,uploaded_by_user_id
) values
 ('49580000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','49510000-0000-4000-8000-000000000001','school/owner/review.pdf','review.pdf','application/pdf',1200,'Review file','active','49500000-0000-4000-8000-000000000001'),
 ('49580000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','49510000-0000-4000-8000-000000000001','school/owner/private.pdf','private.pdf','application/pdf',900,'Private file','active','49500000-0000-4000-8000-000000000001'),
 ('49580000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','49510000-0000-4000-8000-000000000002','school/hod/self.pdf','self.pdf','application/pdf',800,'HOD own file','active','49500000-0000-4000-8000-000000000002');

set local session_replication_role=origin;

insert into public.subject_department_responsibilities(
 tenant_id,school_id,subject_id,department_head_staff_assignment_id,effective_from,created_by_user_id
) values
 ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','49550000-0000-4000-8000-000000000001','49530000-0000-4000-8000-000000000002',current_date-30,'49500000-0000-4000-8000-000000000002'),
 ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','49550000-0000-4000-8000-000000000002','49530000-0000-4000-8000-000000000003',current_date-30,'49500000-0000-4000-8000-000000000003');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','49500000-0000-4000-8000-000000000001',true);

select lives_ok(
 $$select set_config('test.pf_review',public.submit_teacher_professional_document_for_review(
   '49580000-0000-4000-8000-000000000001','49550000-0000-4000-8000-000000000001'
 )::text,true)$$,
 'teacher can explicitly submit an owned active document for a current allocated subject'
);

select ok(
 (select status='submitted' from public.teacher_professional_document_review_submissions where id=current_setting('test.pf_review')::uuid)
 and (select count(*)=1 from public.teacher_professional_document_review_events where submission_id=current_setting('test.pf_review')::uuid and event_kind='submitted'),
 'submission lifecycle starts with an immutable submitted event'
);

select throws_ok(
 $$select public.submit_teacher_professional_document_for_review(
   '49580000-0000-4000-8000-000000000002','49550000-0000-4000-8000-000000000002'
 )$$,
 'P0001','Review subject must be one of the teacher current allocations',
 'teacher cannot route a document to a subject outside current allocation'
);

select set_config('request.jwt.claim.sub','49500000-0000-4000-8000-000000000005',true);
select throws_ok(
 $$select public.submit_teacher_professional_document_for_review(
   '49580000-0000-4000-8000-000000000001','49550000-0000-4000-8000-000000000001'
 )$$,
 'P0001','Teacher document owner authority required',
 'another teacher cannot submit a document they do not own'
);

select set_config('request.jwt.claim.sub','49500000-0000-4000-8000-000000000002',true);
select lives_ok(
 'select public.submit_teacher_professional_document_for_review(''49580000-0000-4000-8000-000000000003''::uuid,''49550000-0000-4000-8000-000000000001''::uuid)',
 'HOD who also teaches can submit their own professional file as teacher owner'
);
select set_config(
 'test.pf_self',
 (select id::text from public.teacher_professional_document_review_submissions
   where document_id='49580000-0000-4000-8000-000000000003'),
 true
);
select throws_ok(
 'select public.review_teacher_professional_document_submission(current_setting(''test.pf_self'')::uuid,''reviewed''::text,''self review''::text)',
 'P0001','Permission denied: current responsible HOD authority required',
 'reviewer separation prevents HOD self-review'
);

select set_config('request.jwt.claim.sub','49500000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is(
 (select count(*)::integer from public.teacher_professional_document_review_submissions),
 0,
 'wrong-subject HOD cannot browse professional review submissions'
);
select is(
 (select count(*)::integer from public.teacher_professional_documents where id in (
   '49580000-0000-4000-8000-000000000001','49580000-0000-4000-8000-000000000002'
 )),
 0,
 'wrong-subject HOD cannot browse teacher professional files'
);
reset role;

select throws_ok(
 $$select public.review_teacher_professional_document_submission(
   current_setting('test.pf_review')::uuid,'reviewed','wrong subject'
 )$$,
 'P0001','Permission denied: current responsible HOD authority required',
 'wrong-subject HOD cannot review a known submission id'
);

select set_config('request.jwt.claim.sub','49500000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(
 (select count(*)::integer from public.teacher_professional_document_review_submissions where id=current_setting('test.pf_review')::uuid),
 1,
 'responsible HOD can read the explicitly submitted review row'
);
select is(
 (select count(*)::integer from public.teacher_professional_documents where id='49580000-0000-4000-8000-000000000001'),
 1,
 'responsible HOD can read the exact explicitly submitted document'
);
select is(
 (select count(*)::integer from public.teacher_professional_documents where id='49580000-0000-4000-8000-000000000002'),
 0,
 'responsible HOD still cannot browse another unsubmitted teacher file'
);
reset role;

select lives_ok(
 $$select public.review_teacher_professional_document_submission(
   current_setting('test.pf_review')::uuid,'returned','Please add evidence.'
 )$$,
 'responsible HOD can return the submitted document with feedback'
);

select ok(
 (select status='returned' and review_note='Please add evidence.' from public.teacher_professional_document_review_submissions where id=current_setting('test.pf_review')::uuid)
 and (select title='Review file' and storage_path='school/owner/review.pdf' from public.teacher_professional_documents where id='49580000-0000-4000-8000-000000000001'),
 'return changes only review metadata and preserves canonical file identity'
);

select set_config('request.jwt.claim.sub','49500000-0000-4000-8000-000000000001',true);
select lives_ok(
 $$select public.submit_teacher_professional_document_for_review(
   '49580000-0000-4000-8000-000000000001','49550000-0000-4000-8000-000000000001'
 )$$,
 'teacher can resubmit the same returned document'
);

select is(
 (select array_agg(event_kind order by occurred_at,id) from public.teacher_professional_document_review_events where submission_id=current_setting('test.pf_review')::uuid),
 array['submitted','returned','resubmitted']::text[],
 'submit return and resubmit transitions remain append-only history'
);

-- A newer active membership at another school makes the target school non-current.
set local session_replication_role=replica;
insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values('49520000-0000-4000-8000-000000000007','11111111-1111-4111-8111-111111111111','49591000-0000-4000-8000-000000000001','49500000-0000-4000-8000-000000000002',null,'hod',current_date-1);
set local session_replication_role=origin;
select set_config('request.jwt.claim.sub','49500000-0000-4000-8000-000000000002',true);
select throws_ok(
 $q$select public.review_teacher_professional_document_submission(
   current_setting('test.pf_review')::uuid,'reviewed','non-current'
 )$q$,
 'P0001','Permission denied: current responsible HOD authority required',
 'active responsibility at a non-current school does not retain review authority'
);
update public.school_memberships set active_to=current_date-1 where id='49520000-0000-4000-8000-000000000007';

select set_config('request.jwt.claim.sub','49500000-0000-4000-8000-000000000006',true);
select throws_ok(
 $q$select public.review_teacher_professional_document_submission(
   current_setting('test.pf_review')::uuid,'reviewed','foreign tenant'
 )$q$,
 'P0001','Permission denied: current responsible HOD authority required',
 'cross-tenant HOD cannot review a known professional submission id'
);

select set_config('request.jwt.claim.sub','49500000-0000-4000-8000-000000000004',true);
select throws_ok(
 $$select public.review_teacher_professional_document_submission(
   current_setting('test.pf_review')::uuid,'reviewed','support'
 )$$,
 'P0001','Permission denied: current responsible HOD authority required',
 'Platform Support cannot review professional documents'
);

select set_config('request.jwt.claim.sub','49500000-0000-4000-8000-000000000002',true);
update public.staff_school_assignments set effective_to=current_date-1 where id='49530000-0000-4000-8000-000000000002';
select throws_ok(
 $$select public.review_teacher_professional_document_submission(
   current_setting('test.pf_review')::uuid,'reviewed','stale'
 )$$,
 'P0001','Permission denied: current responsible HOD authority required',
 'stale HOD placement loses professional-file review authority'
);
update public.staff_school_assignments set effective_to=null where id='49530000-0000-4000-8000-000000000002';

select lives_ok(
 $$select public.review_teacher_professional_document_submission(
   current_setting('test.pf_review')::uuid,'reviewed','Complete.'
 )$$,
 'current responsible HOD can complete review after resubmission'
);

set local role authenticated;
select ok(
 not has_table_privilege('authenticated','public.teacher_professional_document_review_submissions','INSERT')
 and not has_table_privilege('authenticated','public.teacher_professional_document_review_submissions','UPDATE')
 and not has_table_privilege('authenticated','public.teacher_professional_document_review_events','INSERT')
 and not has_table_privilege('authenticated','public.teacher_professional_document_review_events','UPDATE')
 and not has_table_privilege('authenticated','public.teacher_professional_document_review_events','DELETE'),
 'clients cannot bypass governed RPCs or mutate review history directly'
);
reset role;

select * from finish();
rollback;
