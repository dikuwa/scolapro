begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fd900000-0000-4000-8000-000000000001','subject-maintenance-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd900000-0000-4000-8000-000000000001','school_admin','2026-01-01');

select set_config('request.jwt.claim.sub','fd900000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

create temporary table subject_fixture(label text primary key,id uuid) on commit drop;
insert into subject_fixture values
  ('alpha',public.upsert_school_subject('22222222-2222-4222-8222-222222222222',' tst-a ','Test Alpha')),
  ('beta',public.upsert_school_subject('22222222-2222-4222-8222-222222222222','TST-B','Test Beta')),
  ('used',public.upsert_school_subject('22222222-2222-4222-8222-222222222222','TST-U','Used Subject'));

select is(
  (select subject_code from public.subjects where id=(select id from subject_fixture where label='alpha')),
  'TST-A',
  'subject creation normalizes codes to uppercase'
);

select is(
  public.update_school_subject((select id from subject_fixture where label='alpha'),' TST-A2 ','Test Alpha Corrected'),
  (select id from subject_fixture where label='alpha'),
  'school admin can correct a subject code and name in place'
);

select is(
  (select subject_code || '|' || display_name from public.subjects where id=(select id from subject_fixture where label='alpha')),
  'TST-A2|Test Alpha Corrected',
  'subject correction persists without replacing the subject identity'
);

select throws_ok(
  $$select public.update_school_subject((select id from subject_fixture where label='alpha'),'TST-B','Another Name')$$,
  'Subject code is already in use',
  'subject correction rejects a code already owned by another school subject'
);

select throws_ok(
  $$select public.update_school_subject((select id from subject_fixture where label='alpha'),'TST-A2','test beta')$$,
  'An active subject with this name already exists',
  'subject correction rejects case-insensitive active-name conflicts'
);

select throws_ok(
  $$select public.upsert_school_subject('22222222-2222-4222-8222-222222222222','TST-C',' TEST BETA ')$$,
  'An active subject with this name already exists',
  'new subjects cannot introduce another active duplicate display name'
);

insert into public.subject_offerings(
  id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status
) values(
  'fd910000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
  (select id from subject_fixture where label='used'),'30000000-0000-4000-8000-000000000010',5,'active'
);

select is(
  public.retire_school_subject((select id from subject_fixture where label='used')),
  'archived',
  'a subject already used by an offering is archived instead of hard deleted'
);
select is(
  (select status from public.subjects where id=(select id from subject_fixture where label='used')),
  'archived',
  'referenced subject history remains present after retirement'
);
select ok(
  exists(select 1 from public.subject_offerings where id='fd910000-0000-4000-8000-000000000001'),
  'archiving a used subject preserves its existing offering history'
);

select is(
  public.retire_school_subject((select id from subject_fixture where label='beta')),
  'deleted',
  'an unused mistaken subject can be physically deleted'
);

select * from finish();
rollback;
