begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fd800000-0000-4000-8000-000000000001','guardian-directory-hod@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fd800000-0000-4000-8000-000000000001',
  'hod',current_date-30
);

insert into public.guardian_profiles(id,tenant_id,first_names,surname,identity_number,status)
values
  ('fd810000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Future Boundary','Guardian','GDIR-PERIOD-001','active'),
  ('fd810000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Current Boundary','Guardian','GDIR-PERIOD-002','active');

insert into public.learner_guardians(
  id,tenant_id,learner_id,guardian_id,relationship_type,priority,effective_from
) values
  ('fd820000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','fd810000-0000-4000-8000-000000000001','guardian',1,current_date-30),
  ('fd820000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000002','fd810000-0000-4000-8000-000000000002','guardian',1,current_date-30);

insert into public.guardian_contacts(
  id,tenant_id,guardian_id,contact_type,contact_value,is_primary,effective_from
) values
  ('fd830000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd810000-0000-4000-8000-000000000001','mobile','0818000001',true,current_date-30),
  ('fd830000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fd810000-0000-4000-8000-000000000002','mobile','0818000002',true,current_date-30);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd800000-0000-4000-8000-000000000001',true);

select is(
  (select count(*)::integer from public.search_guardian_directory(
    '22222222-2222-4222-8222-222222222222',null,100
  ) where guardian_id in ('fd810000-0000-4000-8000-000000000001','fd810000-0000-4000-8000-000000000002')),
  2,
  'HOD can see both linked guardians while both learner enrolments are effective today'
);

select is(
  (select count(*)::integer from public.search_guardian_directory_page(
    '22222222-2222-4222-8222-222222222222',null,1,100
  ) where guardian_id in ('fd810000-0000-4000-8000-000000000001','fd810000-0000-4000-8000-000000000002')),
  2,
  'paged guardian directory includes both guardians while both enrolments are effective today'
);

update public.enrolments
set enrolled_from=current_date+7,
    enrolled_to=null,
    status='current'
where learner_id='50000000-0000-4000-8000-000000000001'
  and school_id='22222222-2222-4222-8222-222222222222'
  and academic_year=2026;

select is(
  (select count(*)::integer from public.search_guardian_directory(
    '22222222-2222-4222-8222-222222222222',null,100
  ) where guardian_id='fd810000-0000-4000-8000-000000000001'),
  0,
  'future-start current-status learner does not expose guardian through legacy directory'
);

select is(
  (select count(*)::integer from public.search_guardian_directory_page(
    '22222222-2222-4222-8222-222222222222',null,1,100
  ) where guardian_id='fd810000-0000-4000-8000-000000000001'),
  0,
  'future-start current-status learner does not expose guardian through paged directory'
);

select is(
  (select count(*)::integer from public.search_guardian_directory(
    '22222222-2222-4222-8222-222222222222','0818000001',100
  )),
  0,
  'future-start guardian contact cannot be discovered by contact search'
);

select is(
  (select count(*)::integer from public.search_guardian_directory_page(
    '22222222-2222-4222-8222-222222222222','0818000001',1,100
  )),
  0,
  'future-start guardian contact cannot be discovered by paged contact search'
);

select is(
  (select count(*)::integer from public.search_guardian_directory(
    '22222222-2222-4222-8222-222222222222',null,100
  ) where guardian_id='fd810000-0000-4000-8000-000000000002'),
  1,
  'another effective learner guardian remains visible in legacy directory'
);

select is(
  (select count(*)::integer from public.search_guardian_directory_page(
    '22222222-2222-4222-8222-222222222222',null,1,100
  ) where guardian_id='fd810000-0000-4000-8000-000000000002'),
  1,
  'another effective learner guardian remains visible in paged directory'
);

update public.enrolments
set enrolled_from=current_date-30,
    enrolled_to=current_date-1,
    status='current'
where learner_id='50000000-0000-4000-8000-000000000001'
  and school_id='22222222-2222-4222-8222-222222222222'
  and academic_year=2026;

select is(
  (select count(*)::integer from public.search_guardian_directory(
    '22222222-2222-4222-8222-222222222222',null,100
  ) where guardian_id='fd810000-0000-4000-8000-000000000001'),
  0,
  'ended current-status learner does not retain guardian visibility in legacy directory'
);

select is(
  (select count(*)::integer from public.search_guardian_directory_page(
    '22222222-2222-4222-8222-222222222222',null,1,100
  ) where guardian_id='fd810000-0000-4000-8000-000000000001'),
  0,
  'ended current-status learner does not retain guardian visibility in paged directory'
);

select * from finish();
rollback;
