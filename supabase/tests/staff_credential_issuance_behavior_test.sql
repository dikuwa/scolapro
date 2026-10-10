begin;

select plan(13);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000','a3000000-0000-4000-8000-000000000001','authenticated','authenticated','credential-actor@scolapro.invalid','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','a3000000-0000-4000-8000-000000000002','authenticated','authenticated','credential-target@scolapro.invalid','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','a3000000-0000-4000-8000-000000000003','authenticated','authenticated','credential-protected@scolapro.invalid','',now(),now(),now());

insert into public.tenants (id,name,slug)
values ('a1000000-0000-4000-8000-000000000001','Credential Test Tenant','credential-test-tenant');

insert into public.schools (id,tenant_id,name,emis_number,region,town)
values
  ('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Credential Test School A','CRED-A','Erongo','Swakopmund'),
  ('a2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','Credential Test School B','CRED-B','Erongo','Walvis Bay');

insert into public.staff_members (id,tenant_id,user_id,first_name,last_name,status)
values
  ('a4000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','Admin','Actor','active'),
  ('a4000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000002','Target','Teacher','active'),
  ('a4000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000003','Protected','Admin','active'),
  ('a4000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000001',null,'Unlinked','Teacher','active');

insert into public.staff_school_assignments (
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id
) values
  ('a5000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','management','2026-01-01','a3000000-0000-4000-8000-000000000001'),
  ('a5000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002','teacher','2026-01-01','a3000000-0000-4000-8000-000000000001'),
  ('a5000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000003','management','2026-01-01','a3000000-0000-4000-8000-000000000001'),
  ('a5000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000004','teacher','2026-01-01','a3000000-0000-4000-8000-000000000001');

insert into public.school_memberships (
  tenant_id,school_id,user_id,staff_member_id,role_key,active_from
) values
  ('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','school_admin','2026-01-01'),
  ('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000003','a4000000-0000-4000-8000-000000000003','school_admin','2026-01-01');

select set_config('request.jwt.claim.role','service_role',true);

create temporary table _credential_attempt as
select public.reserve_staff_credential_issuance(
  'a2000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000002',
  'a3000000-0000-4000-8000-000000000001'
) as id;

select ok(
  (select id is not null from _credential_attempt),
  'authorized school admin reserves a linked active staff credential issuance'
);

select throws_ok(
  $$select public.reserve_staff_credential_issuance(
    'a2000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000002',
    'a3000000-0000-4000-8000-000000000001'
  )$$,
  '55000',
  'Credential issuance is already in progress for this staff account',
  'concurrent live issuance is blocked'
);

select is(
  public.finalize_staff_credential_issuance(
    (select id from _credential_attempt),
    'completed',
    repeat('a',64),
    now()+interval '1 hour'
  ),
  true,
  'reserved issuance can finalize with bounded non-secret metadata'
);

select throws_ok(
  $$select public.reserve_staff_credential_issuance(
    'a2000000-0000-4000-8000-000000000002',
    'a4000000-0000-4000-8000-000000000002',
    'a3000000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  'Staff is not actively placed at this school',
  'cross-school issuance is denied'
);

select throws_ok(
  $$select public.reserve_staff_credential_issuance(
    'a2000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  'Administrators cannot issue temporary credentials to themselves',
  'self issuance is denied'
);

select throws_ok(
  $$select public.reserve_staff_credential_issuance(
    'a2000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000003',
    'a3000000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  'Protected administrator credentials cannot be issued here',
  'school-admin targets are protected even when their admin authority belongs to another school'
);

select throws_ok(
  $$select public.reserve_staff_credential_issuance(
    'a2000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000004',
    'a3000000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  'Staff account must be linked before credential issuance',
  'unlinked staff identities cannot enter the password path'
);

create temporary table _credential_attempt_2 as
select public.reserve_staff_credential_issuance(
  'a2000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000002',
  'a3000000-0000-4000-8000-000000000001'
) as id;

select ok(
  (select id is not null from _credential_attempt_2),
  'a completed issuance may be safely reissued and replace the provider password'
);

select is(
  public.finalize_staff_credential_issuance(
    (select id from _credential_attempt_2),
    'failed',
    null,
    null
  ),
  true,
  'failed reissue finalizes without retaining credential metadata'
);

select throws_ok(
  $select public.finalize_staff_credential_issuance(
    gen_random_uuid(),
    'completed',
    repeat('b',64),
    now()+interval '3 hours'
  )$,
  '22023',
  'Completed credential issuance requires bounded non-secret metadata',
  'credential expiry cannot exceed the bounded issuance window'
);

create temporary table _credential_attempt_3 as
select public.reserve_staff_credential_issuance(
  'a2000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000002',
  'a3000000-0000-4000-8000-000000000001'
) as id;

select ok(
  (select id is not null from _credential_attempt_3),
  'third issuance within 24 hours reaches the configured limit'
);

select is(
  public.finalize_staff_credential_issuance(
    (select id from _credential_attempt_3),
    'failed',
    null,
    null
  ),
  true,
  'third issuance finalizes before rate-limit verification'
);

select throws_ok(
  $select public.reserve_staff_credential_issuance(
    'a2000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000002',
    'a3000000-0000-4000-8000-000000000001'
  )$,
  '42900',
  'Credential issuance rate limit exceeded',
  'fourth staff issuance within 24 hours is rate limited'
);

select * from finish();
rollback;
