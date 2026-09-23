-- Issue #676: governed permanent deletion of teacher-owned professional documents.
-- Companion migration:
--   supabase/migrations/20260923143000_teacher_professional_document_permanent_delete.sql
--
-- Verifies Option B (Issue #676): archive is required before purge; purge is
-- owner-scoped, audited, refused while the private binary still exists,
-- refused once the document entered HOD review, refused for active documents,
-- blocked by governed FK references, and ungoverned hard deletion stays
-- impossible.

begin;

select plan(19);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
 ('67600000-0000-4000-8000-000000000001','owner-676@example.test','authenticated','authenticated',now(),now()),
 ('67600000-0000-4000-8000-000000000002','other-676@example.test','authenticated','authenticated',now(),now()),
 ('67600000-0000-4000-8000-000000000003','support-676@example.test','authenticated','authenticated',now(),now());

set local session_replication_role=replica;

insert into public.tenants(id,name,slug,status)
values('67610000-0000-4000-8000-000000000001','Permanent Delete Tenant','permanent-delete-676','active');

insert into public.schools(id,tenant_id,name,status)
values('67620000-0000-4000-8000-000000000001','67610000-0000-4000-8000-000000000001','Permanent Delete School','active');

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
 ('67630000-0000-4000-8000-000000000001','67610000-0000-4000-8000-000000000001','67600000-0000-4000-8000-000000000001','T676-1','File','Owner','active'),
 ('67630000-0000-4000-8000-000000000002','67610000-0000-4000-8000-000000000001','67600000-0000-4000-8000-000000000002','T676-2','Other','Teacher','active'),
 ('67630000-0000-4000-8000-000000000003','67610000-0000-4000-8000-000000000001','67600000-0000-4000-8000-000000000003','T676-3','Platform','Support','active');

insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
 ('67640000-0000-4000-8000-000000000001','67610000-0000-4000-8000-000000000001','67620000-0000-4000-8000-000000000001','67600000-0000-4000-8000-000000000001','67630000-0000-4000-8000-000000000001','teacher',current_date-30),
 ('67640000-0000-4000-8000-000000000002','67610000-0000-4000-8000-000000000001','67620000-0000-4000-8000-000000000001','67600000-0000-4000-8000-000000000002','67630000-0000-4000-8000-000000000002','teacher',current_date-30),
 ('67640000-0000-4000-8000-000000000003','67610000-0000-4000-8000-000000000001','67620000-0000-4000-8000-000000000001','67600000-0000-4000-8000-000000000003','67630000-0000-4000-8000-000000000003','teacher',current_date-30);

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,position_title,
  effective_from,effective_to,created_by_user_id
) values
 ('67650000-0000-4000-8000-000000000001','67610000-0000-4000-8000-000000000001','67620000-0000-4000-8000-000000000001','67630000-0000-4000-8000-000000000001','teacher','Teacher',current_date-30,null,'67600000-0000-4000-8000-000000000001'),
 ('67650000-0000-4000-8000-000000000002','67610000-0000-4000-8000-000000000001','67620000-0000-4000-8000-000000000001','67630000-0000-4000-8000-000000000002','teacher','Teacher',current_date-30,null,'67600000-0000-4000-8000-000000000002'),
 ('67650000-0000-4000-8000-000000000003','67610000-0000-4000-8000-000000000001','67620000-0000-4000-8000-000000000001','67630000-0000-4000-8000-000000000003','teacher','Teacher',current_date-30,null,'67600000-0000-4000-8000-000000000003');

insert into public.teacher_professional_documents(
  id,tenant_id,school_id,owner_staff_member_id,storage_path,original_filename,mime_type,
  file_size,title,category_label,status,uploaded_by_user_id,archived_by_user_id,archived_at
) values
 ('67670000-0000-4000-8000-000000000001','67610000-0000-4000-8000-000000000001','67620000-0000-4000-8000-000000000001','67630000-0000-4000-8000-000000000001','67620000-0000-4000-8000-000000000001/67630000-0000-4000-8000-000000000001/67670000-0000-4000-8000-000000000001.pdf','portfolio.pdf','application/pdf',2048,'Teaching portfolio','Evidence','active','67600000-0000-4000-8000-000000000001',null,null),
 ('67670000-0000-4000-8000-000000000002','67610000-0000-4000-8000-000000000001','67620000-0000-4000-8000-000000000001','67630000-0000-4000-8000-000000000001','67620000-0000-4000-8000-000000000001/67630000-0000-4000-8000-000000000001/67670000-0000-4000-8000-000000000002.pdf','archived-practice.pdf','application/pdf',1024,'Archived practice',null,'archived','67600000-0000-4000-8000-000000000001','67600000-0000-4000-8000-000000000001',now()),
 ('67670000-0000-4000-8000-000000000003','67610000-0000-4000-8000-000000000001','67620000-0000-4000-8000-000000000001','67630000-0000-4000-8000-000000000001','67620000-0000-4000-8000-000000000001/67630000-0000-4000-8000-000000000001/67670000-0000-4000-8000-000000000003.pdf','reviewed.pdf','application/pdf',900,'Reviewed file',null,'active','67600000-0000-4000-8000-000000000001',null,null),
 ('67670000-0000-4000-8000-000000000004','67610000-0000-4000-8000-000000000001','67620000-0000-4000-8000-000000000001','67630000-0000-4000-8000-000000000001','67620000-0000-4000-8000-000000000001/67630000-0000-4000-8000-000000000001/67670000-0000-4000-8000-000000000004.pdf','foreign-attempt.pdf','application/pdf',800,'Non-owner attempt',null,'active','67600000-0000-4000-8000-000000000001',null,null);

insert into storage.objects(bucket_id,name,owner_id,metadata) values
 ('teacher-professional-documents','67620000-0000-4000-8000-000000000001/67630000-0000-4000-8000-000000000001/67670000-0000-4000-8000-000000000001.pdf','67600000-0000-4000-8000-000000000001',jsonb_build_object('mimetype','application/pdf','size',2048)),
 ('teacher-professional-documents','67620000-0000-4000-8000-000000000001/67630000-0000-4000-8000-000000000001/67670000-0000-4000-8000-000000000002.pdf','67600000-0000-4000-8000-000000000001',jsonb_build_object('mimetype','application/pdf','size',1024)),
 ('teacher-professional-documents','67620000-0000-4000-8000-000000000001/67630000-0000-4000-8000-000000000001/67670000-0000-4000-8000-000000000003.pdf','67600000-0000-4000-8000-000000000001',jsonb_build_object('mimetype','application/pdf','size',900)),
 ('teacher-professional-documents','67620000-0000-4000-8000-000000000001/67630000-0000-4000-8000-000000000001/67670000-0000-4000-8000-000000000004.pdf','67600000-0000-4000-8000-000000000001',jsonb_build_object('mimetype','application/pdf','size',800));

-- Fixture only: the retained review-evidence relationship is created directly here
-- because the governed submit/review lifecycle itself is covered by
-- supabase/tests/teacher_professional_document_review_test.sql.
insert into public.teacher_professional_document_review_submissions(
  id,tenant_id,school_id,document_id,owner_staff_member_id,subject_id,
  submitted_by_user_id,status
) values
 ('67680000-0000-4000-8000-000000000001','67610000-0000-4000-8000-000000000001','67620000-0000-4000-8000-000000000001','67670000-0000-4000-8000-000000000003','67630000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','67600000-0000-4000-8000-000000000001','submitted');

set local session_replication_role=origin;

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','67600000-0000-4000-8000-000000000001',true);

select is(
  has_function_privilege('authenticated','public.permanently_delete_teacher_professional_document(uuid)','EXECUTE'),
  true,
  'authenticated clients can invoke the governed permanent-delete RPC'
);

select is(
  has_function_privilege('anon','public.permanently_delete_teacher_professional_document(uuid)','EXECUTE'),
  false,
  'anonymous clients cannot invoke governed permanent deletion'
);

select throws_ok(
 $$select public.permanently_delete_teacher_professional_document('67670000-0000-4000-8000-000000000001')$$,
 'P0001','The private file must be removed from private storage before its record can be permanently deleted',
 'metadata cannot be permanently deleted while the private binary still exists'
);

-- Option B: active documents cannot be purged even when the binary is gone;
-- they must be archived first.
delete from storage.objects
where bucket_id='teacher-professional-documents'
  and name='67620000-0000-4000-8000-000000000001/67630000-0000-4000-8000-000000000001/67670000-0000-4000-8000-000000000004.pdf';

select throws_ok(
  $$select public.permanently_delete_teacher_professional_document('67670000-0000-4000-8000-000000000004')$$,
  'P0001','Archive this document before deleting it permanently',
  'active professional documents cannot be permanently deleted before archive'
);

select ok(
  exists(select 1 from public.teacher_professional_documents where id='67670000-0000-4000-8000-000000000004'),
  'active document refused purge is retained for the archive-first lifecycle'
);

insert into public.platform_memberships(id,user_id,role_key,active_from)
values('67660000-0000-4000-8000-000000000001','67600000-0000-4000-8000-000000000003','platform_support',current_date-1);

-- Option B lifecycle: archive first, then remove the binary, then purge.
select lives_ok(
  $$select public.archive_teacher_professional_document('67670000-0000-4000-8000-000000000001')$$,
  'owner archives their own professional document before permanent deletion'
);

delete from storage.objects
where bucket_id='teacher-professional-documents'
  and name='67620000-0000-4000-8000-000000000001/67630000-0000-4000-8000-000000000001/67670000-0000-4000-8000-000000000001.pdf';

select lives_ok(
 $$select public.permanently_delete_teacher_professional_document('67670000-0000-4000-8000-000000000001')$$,
  'owner can permanently delete their own archived professional document once the private file is gone'
);

select ok(
  not exists(select 1 from public.teacher_professional_documents where id='67670000-0000-4000-8000-000000000001'),
  'permanently deleted professional document row is removed'
);

select ok(
  exists(
    select 1 from public.audit_events
    where entity_id='67670000-0000-4000-8000-000000000001'
      and event_type='teacher_professional_document.deleted'
      and actor_user_id='67600000-0000-4000-8000-000000000001'
      and metadata->>'storage_path'='67620000-0000-4000-8000-000000000001/67630000-0000-4000-8000-000000000001/67670000-0000-4000-8000-000000000001.pdf'
      and metadata->>'original_filename'='portfolio.pdf'
      and metadata->>'private_object_removed'='true'
  ),
  'permanent deletion writes immutable identity and provenance audit metadata'
);

delete from storage.objects
where bucket_id='teacher-professional-documents'
  and name='67620000-0000-4000-8000-000000000001/67630000-0000-4000-8000-000000000001/67670000-0000-4000-8000-000000000002.pdf';

select lives_ok(
 $$select public.permanently_delete_teacher_professional_document('67670000-0000-4000-8000-000000000002')$$,
 'owner can permanently delete an archived professional document'
);

delete from storage.objects
where bucket_id='teacher-professional-documents'
  and name='67620000-0000-4000-8000-000000000001/67630000-0000-4000-8000-000000000001/67670000-0000-4000-8000-000000000003.pdf';

select throws_ok(
 $$select public.permanently_delete_teacher_professional_document('67670000-0000-4000-8000-000000000003')$$,
 'P0001','This professional document entered HOD review and cannot be permanently deleted',
 'professional document that entered HOD review cannot be permanently deleted'
);

select ok(
  exists(select 1 from public.teacher_professional_documents where id='67670000-0000-4000-8000-000000000003'),
  'review evidence document is retained for governance history'
);

select set_config('request.jwt.claim.sub','67600000-0000-4000-8000-000000000002',true);
select throws_ok(
 $$select public.permanently_delete_teacher_professional_document('67670000-0000-4000-8000-000000000004')$$,
 'P0001','Teacher document owner authority required',
 'another teacher cannot permanently delete a document they do not own'
);

select set_config('request.jwt.claim.sub','67600000-0000-4000-8000-000000000003',true);
select throws_ok(
 $$select public.permanently_delete_teacher_professional_document('67670000-0000-4000-8000-000000000004')$$,
 'P0001','Teacher document owner authority required',
 'platform support cannot permanently delete teacher-owned professional documents'
);

select set_config('request.jwt.claim.sub','67600000-0000-4000-8000-000000000001',true);
select throws_ok(
 $$select public.permanently_delete_teacher_professional_document('67670000-0000-4000-8000-0000000000ff')$$,
 'P0001','Teacher professional document not found',
 'deleting an unknown professional document is refused'
);

select throws_ok(
 $$delete from public.teacher_professional_documents where id='67670000-0000-4000-8000-000000000004'$$,
 'P0001','Teacher professional documents are archived, not deleted',
 'ungoverned hard deletion stays blocked by the integrity trigger'
);

select set_config('request.jwt.claim.sub','',true);
select throws_ok(
 $$select public.permanently_delete_teacher_professional_document('67670000-0000-4000-8000-000000000004')$$,
 'P0001','Authentication required',
 'permanent deletion requires an authenticated owner session'
);

select set_config('request.jwt.claim.sub','67600000-0000-4000-8000-000000000001',true);
select ok(
  not has_table_privilege('authenticated','public.teacher_professional_documents','DELETE'),
  'clients cannot bypass the governed RPC with direct table deletes'
);

select ok(
  has_function_privilege('authenticated','public.archive_teacher_professional_document(uuid)','EXECUTE'),
  'archiving remains the available default non-destructive lifecycle'
);

select * from finish();
rollback;

