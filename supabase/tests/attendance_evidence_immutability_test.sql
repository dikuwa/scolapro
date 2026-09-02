begin;

select plan(7);

select ok(
  not has_table_privilege('authenticated','public.attendance_evidence','DELETE'),
  'authenticated clients cannot delete registered attendance-evidence metadata'
);

select is(
  (select count(*)::integer
   from pg_policies
   where schemaname='public'
     and tablename='attendance_evidence'
     and cmd='DELETE'),
  0,
  'attendance-evidence metadata has no client DELETE policy'
);

select ok(
  has_function_privilege(
    'authenticated',
    'app_private.can_delete_unlinked_attendance_evidence_object(text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'app_private.can_delete_unlinked_attendance_evidence_object(text)',
    'EXECUTE'
  ),
  'storage-policy helper is exposed only to authenticated callers'
);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values(
  'fcf00000-0000-4000-8000-000000000001',
  'attendance-evidence-owner@example.test',
  'authenticated',
  'authenticated',
  now(),
  now()
);

select set_config(
  'qa.attendance_evidence_enrolment_id',
  (
    select e.id::text
    from public.enrolments e
    where e.register_class_id is not null
    order by case when e.status='current' then 0 else 1 end,e.created_at
    limit 1
  ),
  true
);
select set_config(
  'qa.attendance_evidence_school_id',
  (
    select e.school_id::text
    from public.enrolments e
    where e.id=current_setting('qa.attendance_evidence_enrolment_id')::uuid
  ),
  true
);
select set_config(
  'qa.attendance_evidence_tenant_id',
  (
    select e.tenant_id::text
    from public.enrolments e
    where e.id=current_setting('qa.attendance_evidence_enrolment_id')::uuid
  ),
  true
);
select set_config(
  'qa.attendance_evidence_class_id',
  (
    select e.register_class_id::text
    from public.enrolments e
    where e.id=current_setting('qa.attendance_evidence_enrolment_id')::uuid
  ),
  true
);
select set_config(
  'qa.attendance_evidence_year',
  (
    select e.academic_year::text
    from public.enrolments e
    where e.id=current_setting('qa.attendance_evidence_enrolment_id')::uuid
  ),
  true
);

insert into public.attendance_register_submissions(
  id,tenant_id,school_id,academic_year,register_class_id,attendance_date,
  default_status,recorded_by_user_id,source
) values(
  'fcf10000-0000-4000-8000-000000000001',
  current_setting('qa.attendance_evidence_tenant_id')::uuid,
  current_setting('qa.attendance_evidence_school_id')::uuid,
  current_setting('qa.attendance_evidence_year')::integer,
  current_setting('qa.attendance_evidence_class_id')::uuid,
  current_date,
  'present',
  'fcf00000-0000-4000-8000-000000000001',
  'online'
);

select set_config(
  'qa.attendance_evidence_linked_path',
  current_setting('qa.attendance_evidence_school_id') ||
    '/fcf00000-0000-4000-8000-000000000001/linked-proof.jpg',
  true
);
select set_config(
  'qa.attendance_evidence_unlinked_path',
  current_setting('qa.attendance_evidence_school_id') ||
    '/fcf00000-0000-4000-8000-000000000001/orphan-proof.jpg',
  true
);

insert into public.attendance_evidence(
  id,tenant_id,school_id,register_submission_id,enrolment_id,attendance_date,
  storage_path,original_filename,mime_type,file_size,uploaded_by_user_id
) values(
  'fcf20000-0000-4000-8000-000000000001',
  current_setting('qa.attendance_evidence_tenant_id')::uuid,
  current_setting('qa.attendance_evidence_school_id')::uuid,
  'fcf10000-0000-4000-8000-000000000001',
  current_setting('qa.attendance_evidence_enrolment_id')::uuid,
  current_date,
  current_setting('qa.attendance_evidence_linked_path'),
  'linked-proof.jpg',
  'image/jpeg',
  1024,
  'fcf00000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fcf00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  app_private.can_delete_unlinked_attendance_evidence_object(
    current_setting('qa.attendance_evidence_unlinked_path')
  ),
  true,
  'uploader may clean up an unlinked object in their own attendance-evidence folder'
);

select is(
  app_private.can_delete_unlinked_attendance_evidence_object(
    current_setting('qa.attendance_evidence_school_id') ||
      '/fcf00000-0000-4000-8000-000000000099/foreign-proof.jpg'
  ),
  false,
  'uploader cannot delete an object from another user folder'
);

select is(
  app_private.can_delete_unlinked_attendance_evidence_object(
    current_setting('qa.attendance_evidence_linked_path')
  ),
  false,
  'registered historical attendance evidence can no longer be deleted from storage'
);

reset role;

select ok(
  exists(
    select 1
    from pg_policies
    where schemaname='storage'
      and tablename='objects'
      and policyname='attendance uploader can delete unlinked evidence'
      and cmd='DELETE'
      and qual like '%can_delete_unlinked_attendance_evidence_object%'
  ),
  'storage DELETE policy is limited by the unlinked-evidence helper'
);

select * from finish();
rollback;
