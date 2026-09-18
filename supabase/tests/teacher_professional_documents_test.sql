begin;

select plan(24);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('48700000-0000-4000-8000-000000000001','teacher-owner-487@example.test','authenticated','authenticated',now(),now()),
  ('48700000-0000-4000-8000-000000000002','teacher-other-487@example.test','authenticated','authenticated',now(),now()),
  ('48700000-0000-4000-8000-000000000003','hod-487@example.test','authenticated','authenticated',now(),now()),
  ('48700000-0000-4000-8000-000000000004','support-487@example.test','authenticated','authenticated',now(),now()),
  ('48700000-0000-4000-8000-000000000005','stale-teacher-487@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug,status)
values
  ('48710000-0000-4000-8000-000000000001','Teacher Documents Tenant A','teacher-docs-a','active'),
  ('48710000-0000-4000-8000-000000000002','Teacher Documents Tenant B','teacher-docs-b','active');

insert into public.schools(id,tenant_id,name,status)
values
  ('48720000-0000-4000-8000-000000000001','48710000-0000-4000-8000-000000000001','Teacher Documents School A','active'),
  ('48720000-0000-4000-8000-000000000002','48710000-0000-4000-8000-000000000001','Teacher Documents School A2','active'),
  ('48720000-0000-4000-8000-000000000003','48710000-0000-4000-8000-000000000002','Teacher Documents School B','active');

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values
  ('48730000-0000-4000-8000-000000000001','48710000-0000-4000-8000-000000000001','48700000-0000-4000-8000-000000000001','T487-1','Owner','Teacher','active'),
  ('48730000-0000-4000-8000-000000000002','48710000-0000-4000-8000-000000000001','48700000-0000-4000-8000-000000000002','T487-2','Other','Teacher','active'),
  ('48730000-0000-4000-8000-000000000003','48710000-0000-4000-8000-000000000001','48700000-0000-4000-8000-000000000003','H487-1','Department','Head','active'),
  ('48730000-0000-4000-8000-000000000004','48710000-0000-4000-8000-000000000001','48700000-0000-4000-8000-000000000004','S487-1','Support','Actor','active'),
  ('48730000-0000-4000-8000-000000000005','48710000-0000-4000-8000-000000000001','48700000-0000-4000-8000-000000000005','T487-5','Stale','Teacher','active');

insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values
  ('48740000-0000-4000-8000-000000000001','48710000-0000-4000-8000-000000000001','48720000-0000-4000-8000-000000000001','48700000-0000-4000-8000-000000000001','48730000-0000-4000-8000-000000000001','teacher',current_date-30),
  ('48740000-0000-4000-8000-000000000002','48710000-0000-4000-8000-000000000001','48720000-0000-4000-8000-000000000001','48700000-0000-4000-8000-000000000002','48730000-0000-4000-8000-000000000002','teacher',current_date-30),
  ('48740000-0000-4000-8000-000000000003','48710000-0000-4000-8000-000000000001','48720000-0000-4000-8000-000000000001','48700000-0000-4000-8000-000000000003','48730000-0000-4000-8000-000000000003','hod',current_date-30),
  ('48740000-0000-4000-8000-000000000004','48710000-0000-4000-8000-000000000001','48720000-0000-4000-8000-000000000001','48700000-0000-4000-8000-000000000004','48730000-0000-4000-8000-000000000004','teacher',current_date-30),
  ('48740000-0000-4000-8000-000000000005','48710000-0000-4000-8000-000000000001','48720000-0000-4000-8000-000000000001','48700000-0000-4000-8000-000000000005','48730000-0000-4000-8000-000000000005','teacher',current_date-30);

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,position_title,
  effective_from,effective_to,created_by_user_id
) values
  ('48750000-0000-4000-8000-000000000001','48710000-0000-4000-8000-000000000001','48720000-0000-4000-8000-000000000001','48730000-0000-4000-8000-000000000001','teacher','Teacher',current_date-30,null,'48700000-0000-4000-8000-000000000001'),
  ('48750000-0000-4000-8000-000000000002','48710000-0000-4000-8000-000000000001','48720000-0000-4000-8000-000000000001','48730000-0000-4000-8000-000000000002','teacher','Teacher',current_date-30,null,'48700000-0000-4000-8000-000000000002'),
  ('48750000-0000-4000-8000-000000000003','48710000-0000-4000-8000-000000000001','48720000-0000-4000-8000-000000000001','48730000-0000-4000-8000-000000000003','management','HOD',current_date-30,null,'48700000-0000-4000-8000-000000000003'),
  ('48750000-0000-4000-8000-000000000004','48710000-0000-4000-8000-000000000001','48720000-0000-4000-8000-000000000001','48730000-0000-4000-8000-000000000004','support','Support',current_date-30,null,'48700000-0000-4000-8000-000000000004'),
  ('48750000-0000-4000-8000-000000000005','48710000-0000-4000-8000-000000000001','48720000-0000-4000-8000-000000000001','48730000-0000-4000-8000-000000000005','teacher','Teacher',current_date-60,current_date-1,'48700000-0000-4000-8000-000000000005');

insert into public.platform_memberships(id,user_id,role_key,active_from)
values('48760000-0000-4000-8000-000000000001','48700000-0000-4000-8000-000000000004','platform_support',current_date-1);

insert into storage.objects(bucket_id,name,owner_id,metadata)
values(
  'teacher-professional-documents',
  '48720000-0000-4000-8000-000000000001/48730000-0000-4000-8000-000000000001/48770000-0000-4000-8000-000000000001.pdf',
  '48700000-0000-4000-8000-000000000001',
  jsonb_build_object('mimetype','application/pdf','size',2048)
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','48700000-0000-4000-8000-000000000001',true);

select is(
  public.can_prepare_teacher_professional_document_upload(
    '48720000-0000-4000-8000-000000000001',
    '48730000-0000-4000-8000-000000000001'
  ),
  true,
  'current teacher owner can prepare a professional document upload'
);

select lives_ok(
  $$select public.register_teacher_professional_document(
    '48770000-0000-4000-8000-000000000001',
    '48720000-0000-4000-8000-000000000001',
    '48730000-0000-4000-8000-000000000001',
    '48720000-0000-4000-8000-000000000001/48730000-0000-4000-8000-000000000001/48770000-0000-4000-8000-000000000001.pdf',
    'portfolio.pdf','application/pdf',2048,'Teaching portfolio',null
  )$$,
  'owner can finalize an existing private signed-upload object'
);

select is(
  (select status from public.teacher_professional_documents where id='48770000-0000-4000-8000-000000000001'),
  'active',
  'registered professional document starts active'
);

set local role authenticated;
select is(
  (select count(*)::integer from public.teacher_professional_documents),
  1,
  'teacher can read own professional documents'
);
reset role;

select set_config('request.jwt.claim.sub','48700000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.teacher_professional_documents),
  0,
  'same-school teacher cannot browse another teacher professional documents'
);
reset role;

select set_config('request.jwt.claim.sub','48700000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is(
  (select count(*)::integer from public.teacher_professional_documents),
  0,
  'HOD role alone does not grant cross-teacher professional document browsing'
);
reset role;

select set_config('request.jwt.claim.sub','48700000-0000-4000-8000-000000000004',true);
select is(
  public.can_prepare_teacher_professional_document_upload(
    '48720000-0000-4000-8000-000000000001',
    '48730000-0000-4000-8000-000000000004'
  ),
  false,
  'Platform Support is denied teacher-owned upload authority even with a school role'
);
set local role authenticated;
select is(
  (select count(*)::integer from public.teacher_professional_documents),
  0,
  'Platform Support cannot read school-operational professional documents'
);
reset role;

select set_config('request.jwt.claim.sub','48700000-0000-4000-8000-000000000005',true);
select is(
  public.can_prepare_teacher_professional_document_upload(
    '48720000-0000-4000-8000-000000000001',
    '48730000-0000-4000-8000-000000000005'
  ),
  false,
  'ended effective placement cannot prepare professional document upload'
);

select set_config('request.jwt.claim.sub','48700000-0000-4000-8000-000000000001',true);
select is(
  public.can_prepare_teacher_professional_document_upload(
    '48720000-0000-4000-8000-000000000002',
    '48730000-0000-4000-8000-000000000001'
  ),
  false,
  'teacher cannot cross into another school'
);

select is(
  public.can_prepare_teacher_professional_document_upload(
    '48720000-0000-4000-8000-000000000003',
    '48730000-0000-4000-8000-000000000001'
  ),
  false,
  'teacher cannot cross tenant through a foreign school'
);

select throws_ok(
  $$select public.register_teacher_professional_document(
    '48770000-0000-4000-8000-000000000002',
    '48720000-0000-4000-8000-000000000002',
    '48730000-0000-4000-8000-000000000001',
    '48720000-0000-4000-8000-000000000002/48730000-0000-4000-8000-000000000001/48770000-0000-4000-8000-000000000002.pdf',
    'cross-school.pdf','application/pdf',100,null,null
  )$$,
  'P0001',
  'Teacher document owner authority required',
  'cross-school document finalization is denied'
);

select throws_ok(
  $$select public.register_teacher_professional_document(
    '48770000-0000-4000-8000-000000000003',
    '48720000-0000-4000-8000-000000000003',
    '48730000-0000-4000-8000-000000000001',
    '48720000-0000-4000-8000-000000000003/48730000-0000-4000-8000-000000000001/48770000-0000-4000-8000-000000000003.pdf',
    'cross-tenant.pdf','application/pdf',100,null,null
  )$$,
  'P0001',
  'Teacher document owner authority required',
  'cross-tenant document finalization is denied'
);

select throws_ok(
  $$select public.register_teacher_professional_document(
    '48770000-0000-4000-8000-000000000004',
    '48720000-0000-4000-8000-000000000001',
    '48730000-0000-4000-8000-000000000001',
    '48720000-0000-4000-8000-000000000001/48730000-0000-4000-8000-000000000002/48770000-0000-4000-8000-000000000004.pdf',
    'wrong-owner.pdf','application/pdf',100,null,null
  )$$,
  'P0001',
  'Professional document path does not match owner identity',
  'finalization rejects a storage path outside the exact owner prefix'
);

select throws_ok(
  $$select public.register_teacher_professional_document(
    '48770000-0000-4000-8000-000000000005',
    '48720000-0000-4000-8000-000000000001',
    '48730000-0000-4000-8000-000000000001',
    '48720000-0000-4000-8000-000000000001/48730000-0000-4000-8000-000000000001/48770000-0000-4000-8000-000000000005.exe',
    'unsafe.exe','application/octet-stream',100,null,null
  )$$,
  'P0001',
  'Unsupported professional document type',
  'unsafe executable-like uploads are not accepted into document metadata'
);

select lives_ok(
  $$select public.archive_teacher_professional_document('48770000-0000-4000-8000-000000000001')$$,
  'owner can archive own professional document'
);

select is(
  (select status||'|'||(archived_by_user_id='48700000-0000-4000-8000-000000000001')::text
   from public.teacher_professional_documents
   where id='48770000-0000-4000-8000-000000000001'),
  'archived|true',
  'archive preserves the row and records the actor'
);

select lives_ok(
  $$select public.archive_teacher_professional_document('48770000-0000-4000-8000-000000000001')$$,
  'archive is idempotent for the owner'
);

reset role;
select throws_ok(
  $$update public.teacher_professional_documents
      set owner_staff_member_id='48730000-0000-4000-8000-000000000002'
    where id='48770000-0000-4000-8000-000000000001'$$,
  'Teacher professional document identity and upload provenance are immutable',
  'document ownership/provenance cannot be rewritten'
);

select throws_ok(
  $$delete from public.teacher_professional_documents
    where id='48770000-0000-4000-8000-000000000001'$$,
  'Teacher professional documents are archived, not deleted',
  'professional document history cannot be hard-deleted'
);

select is(
  (select public from storage.buckets where id='teacher-professional-documents'),
  false,
  'teacher professional document bucket is private'
);

select is(
  (select count(*)::integer
   from pg_policies
   where schemaname='storage'
     and tablename='objects'
     and (
       coalesce(qual,'') ilike '%teacher-professional-documents%'
       or coalesce(with_check,'') ilike '%teacher-professional-documents%'
     )),
  0,
  'teacher professional document objects have no broad authenticated storage policies'
);

select is(
  (select count(*)::integer
   from public.audit_events
   where entity_id='48770000-0000-4000-8000-000000000001'
     and event_type='teacher_professional_document.uploaded'
     and actor_user_id='48700000-0000-4000-8000-000000000001'),
  1,
  'upload finalization records immutable actor provenance'
);

select is(
  (select count(*)::integer
   from public.audit_events
   where entity_id='48770000-0000-4000-8000-000000000001'
     and event_type='teacher_professional_document.archived'
     and actor_user_id='48700000-0000-4000-8000-000000000001'),
  1,
  'archive lifecycle records actor provenance'
);

select * from finish();
rollback;
