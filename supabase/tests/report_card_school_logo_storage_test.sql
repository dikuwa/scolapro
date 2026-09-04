begin;

select plan(10);

select ok(
  exists (
    select 1 from storage.buckets
    where id = 'school-document-assets'
      and public = false
      and file_size_limit = 5242880
  ),
  'school document assets use a private 5 MB bucket'
);

select is(
  (select allowed_mime_types::text[] from storage.buckets where id = 'school-document-assets'),
  array['image/jpeg','image/png']::text[],
  'school document assets accept only PDF-compatible JPEG and PNG logos'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in ('School document assets update','School document assets delete')
  ),
  0,
  'school logo objects have no authenticated update or delete policy'
);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fdc00000-0000-4000-8000-000000000001','report-logo-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fdc00000-0000-4000-8000-000000000001','school_admin','2026-01-01');

select set_config('request.jwt.claim.sub','fdc00000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select throws_ok(
  $$select public.set_report_card_logo_asset('22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222/logos/missing.png')$$,
  'Uploaded school logo object was not found',
  'document profile cannot link a nonexistent school logo object'
);

select throws_ok(
  $$select public.set_report_card_logo_asset('22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222/logos/logo.webp')$$,
  'Unsupported logo asset type',
  'document profile rejects logo types the PDF renderer cannot embed'
);

select throws_ok(
  $$select public.set_report_card_logo_asset('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333/logos/logo.png')$$,
  'Logo asset path does not belong to this school',
  'document profile rejects another school logo namespace'
);

insert into storage.objects(bucket_id,name,owner_id,metadata)
values(
  'school-document-assets',
  '22222222-2222-4222-8222-222222222222/logos/logo-test.png',
  'fdc00000-0000-4000-8000-000000000001',
  jsonb_build_object('mimetype','image/png','size',1234)
);

select lives_ok(
  $$select public.set_report_card_logo_asset('22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222/logos/logo-test.png')$$,
  'school admin can attach an existing logo from the school namespace'
);

select is(
  (
    select setting_value ->> 'logo_storage_path'
    from public.school_settings
    where school_id='22222222-2222-4222-8222-222222222222'
      and setting_key='document_profile'
  ),
  '22222222-2222-4222-8222-222222222222/logos/logo-test.png',
  'validated immutable logo path is stored in the document profile'
);

select lives_ok(
  $$select public.set_report_card_logo_asset('22222222-2222-4222-8222-222222222222',null)$$,
  'school admin can clear the current logo pointer without deleting the immutable object'
);

update public.school_memberships
set role_key='teacher'
where user_id='fdc00000-0000-4000-8000-000000000001'
  and school_id='22222222-2222-4222-8222-222222222222';

select throws_ok(
  $$select public.set_report_card_logo_asset('22222222-2222-4222-8222-222222222222',null)$$,
  'Not authorised to manage report-card settings',
  'teacher cannot change the official school document logo pointer'
);

select * from finish();
rollback;
