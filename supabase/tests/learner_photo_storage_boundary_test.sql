begin;

select plan(6);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fdb00000-0000-4000-8000-000000000001','learner-photo-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fdb00000-0000-4000-8000-000000000001','school_admin','2026-01-01');

insert into public.learners(id,tenant_id,first_names,surname,sex)
values('fdb10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Photo','Learner','unspecified');

insert into public.school_learner_identifiers(id,tenant_id,school_id,learner_id,admission_number,source)
values('fdb20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fdb10000-0000-4000-8000-000000000001','PHOTO-BOUNDARY-001','manual');

select set_config('request.jwt.claim.sub','fdb00000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select throws_ok(
  $$select public.set_learner_photo('fdb10000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222/ffffffff-0000-4000-8000-000000000001/wrong.jpg')$$,
  'Learner photo path does not match this learner',
  'learner profile cannot link another learner path'
);

select throws_ok(
  $$select public.set_learner_photo('fdb10000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222/fdb10000-0000-4000-8000-000000000001/missing.jpg')$$,
  'Uploaded learner photo object was not found',
  'learner profile cannot link a nonexistent storage object'
);

insert into storage.objects(bucket_id,name,owner_id,metadata)
values(
  'learner-photos',
  '22222222-2222-4222-8222-222222222222/fdb10000-0000-4000-8000-000000000001/valid.jpg',
  'fdb00000-0000-4000-8000-000000000001',
  jsonb_build_object('mimetype','image/jpeg','size',1234)
);

select is(
  public.set_learner_photo('fdb10000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222/fdb10000-0000-4000-8000-000000000001/valid.jpg'),
  true,
  'school admin can link the learner exact existing photo object'
);
select is(
  (select photo_path from public.learners where id='fdb10000-0000-4000-8000-000000000001'),
  '22222222-2222-4222-8222-222222222222/fdb10000-0000-4000-8000-000000000001/valid.jpg',
  'validated learner photo path is stored'
);
select is(
  public.set_learner_photo('fdb10000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',null),
  true,
  'clearing a learner photo remains allowed'
);
select ok(
  (select photo_path is null from public.learners where id='fdb10000-0000-4000-8000-000000000001'),
  'clearing removes the photo path from learner metadata'
);

select * from finish();
rollback;
