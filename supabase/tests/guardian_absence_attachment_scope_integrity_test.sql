begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('ab700000-0000-4000-8000-000000000001','absence-attachment-scope@example.test','authenticated','authenticated',now(),now());

insert into public.guardian_profiles(id,tenant_id,first_names,surname)
values('ab710000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Attachment','Guardian');

insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,priority,effective_from)
values('ab720000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','ab710000-0000-4000-8000-000000000001',1,current_date);

insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id)
values('ab730000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ab710000-0000-4000-8000-000000000001','ab700000-0000-4000-8000-000000000001');

insert into public.guardian_absence_notices(
  id,tenant_id,school_id,learner_id,enrolment_id,guardian_id,submitted_by_user_id,absence_from,absence_to
) values(
  'ab740000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','ab710000-0000-4000-8000-000000000001','ab700000-0000-4000-8000-000000000001',current_date,current_date
);

insert into public.tenants(id,name,slug)
values('ab800000-0000-4000-8000-000000000001','Absence Attachment Scope Tenant B','absence-attachment-scope-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('ab810000-0000-4000-8000-000000000001','ab800000-0000-4000-8000-000000000001','Absence Attachment Scope School B','AAS-B','Khomas','Windhoek');

select throws_ok(
  $$insert into public.guardian_absence_notice_attachments(
      tenant_id,school_id,notice_id,storage_path,file_name,mime_type,file_size_bytes,uploaded_by_user_id
    ) values(
      'ab800000-0000-4000-8000-000000000001','ab810000-0000-4000-8000-000000000001','ab740000-0000-4000-8000-000000000001',
      'bad-scope/file.pdf','file.pdf','application/pdf',100,'ab700000-0000-4000-8000-000000000001'
    )$$,
  'Guardian absence attachment scope mismatch: notice does not match attachment tenant and school',
  'absence attachment must inherit tenant and school from notice'
);

select throws_ok(
  $$insert into public.guardian_absence_notice_attachments(
      tenant_id,school_id,notice_id,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,uploaded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ab740000-0000-4000-8000-000000000001',
      'avatars','bad-bucket/file.pdf','file.pdf','application/pdf',100,'ab700000-0000-4000-8000-000000000001'
    )$$,
  'Guardian absence attachment scope mismatch: storage bucket is invalid',
  'absence attachment is restricted to the private evidence bucket'
);

select lives_ok(
  $$insert into public.guardian_absence_notice_attachments(
      id,tenant_id,school_id,notice_id,storage_path,file_name,mime_type,file_size_bytes,uploaded_by_user_id
    ) values(
      'ab750000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ab740000-0000-4000-8000-000000000001',
      '22222222-2222-4222-8222-222222222222/ab700000-0000-4000-8000-000000000001/ab740000-0000-4000-8000-000000000001/file.pdf',
      'file.pdf','application/pdf',100,'ab700000-0000-4000-8000-000000000001'
    )$$,
  'valid absence attachment remains allowed'
);

select lives_ok(
  $$update public.guardian_absence_notice_attachments set file_name='renamed.pdf', mime_type='application/pdf', file_size_bytes=101 where id='ab750000-0000-4000-8000-000000000001'$$,
  'non-scope attachment metadata may be corrected'
);

select throws_ok(
  $$update public.guardian_absence_notice_attachments set storage_path='rewritten/file.pdf' where id='ab750000-0000-4000-8000-000000000001'$$,
  'Guardian absence attachment scope and storage provenance are immutable',
  'attachment storage provenance cannot be rewritten'
);

select throws_ok(
  $$update public.guardian_absence_notice_attachments set notice_id=gen_random_uuid() where id='ab750000-0000-4000-8000-000000000001'$$,
  'Guardian absence attachment scope and storage provenance are immutable',
  'attachment cannot be reassigned to another notice'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_guardian_absence_attachment_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_guardian_absence_attachment_scope_integrity()','EXECUTE'),
  'guardian absence attachment integrity helper is private from client roles'
);

select is(
  (select count(*)::integer from pg_trigger where tgrelid='public.guardian_absence_notice_attachments'::regclass and tgname='guardian_absence_attachment_scope_integrity_trg' and not tgisinternal),
  1,
  'guardian absence attachments have exactly one scope-integrity trigger'
);

select * from finish();
rollback;
