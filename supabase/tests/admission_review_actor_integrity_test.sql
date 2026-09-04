begin;

select plan(10);

select ok(
  not has_function_privilege('authenticated','app_private.guard_admission_decision_provenance()','EXECUTE')
  and not has_function_privilege('anon','app_private.guard_admission_decision_provenance()','EXECUTE'),
  'admission review provenance helper remains private from clients'
);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('f6b00000-0000-4000-8000-000000000001','admission-review-admin-a@example.test','authenticated','authenticated',now(),now()),
('f6b00000-0000-4000-8000-000000000002','admission-review-admin-b@example.test','authenticated','authenticated',now(),now()),
('f6b00000-0000-4000-8000-000000000003','admission-review-unrelated@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6b00000-0000-4000-8000-000000000001','school_admin',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6b00000-0000-4000-8000-000000000002','principal',current_date);

select throws_ok(
  $$insert into public.admission_applications(
      tenant_id,school_id,academic_year,requested_grade_id,applicant_first_names,applicant_surname,status,source,
      reviewed_by_user_id,reviewed_at
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'30000000-0000-4000-8000-000000000010',
      'Forged','Reviewer','accepted','school','f6b00000-0000-4000-8000-000000000003',now()
    )$$,
  'Admission reviewer is not authorized for school',
  'trusted path cannot forge an unrelated admission reviewer'
);

select throws_ok(
  $$insert into public.admission_applications(
      tenant_id,school_id,academic_year,requested_grade_id,applicant_first_names,applicant_surname,status,source
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'30000000-0000-4000-8000-000000000010',
      'Missing','Reviewer','accepted','school'
    )$$,
  'Admission decision requires review provenance',
  'trusted decision cannot omit reviewer provenance'
);

select lives_ok(
  $$insert into public.admission_applications(
      id,tenant_id,school_id,academic_year,requested_grade_id,applicant_first_names,applicant_surname,status,source,
      reviewed_by_user_id,reviewed_at
    ) values(
      'f6b10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
      '30000000-0000-4000-8000-000000000010','Valid','Decision','accepted','school','f6b00000-0000-4000-8000-000000000001',now()
    )$$,
  'trusted decision remains possible with an authorized reviewer'
);

select throws_ok(
  $$update public.admission_applications
       set reviewed_by_user_id='f6b00000-0000-4000-8000-000000000002'
     where id='f6b10000-0000-4000-8000-000000000001'$$,
  'Admission review provenance is immutable outside a decision transition',
  'trusted path cannot rewrite reviewer independently of a decision transition'
);

select lives_ok(
  $$update public.admission_applications
       set status='waitlisted', reviewed_by_user_id='f6b00000-0000-4000-8000-000000000002', reviewed_at=now()+interval '1 second'
     where id='f6b10000-0000-4000-8000-000000000001'$$,
  'a later authorized reviewer may own a genuine revised decision transition'
);

select is(
  (select reviewed_by_user_id from public.admission_applications where id='f6b10000-0000-4000-8000-000000000001'),
  'f6b00000-0000-4000-8000-000000000002'::uuid,
  'revised decision records the newly authorized reviewer'
);

select lives_ok(
  $$insert into public.admission_applications(
      id,tenant_id,school_id,academic_year,requested_grade_id,applicant_first_names,applicant_surname,status,source
    ) values(
      'f6b10000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
      '30000000-0000-4000-8000-000000000010','Received','Normally','received','school'
    )$$,
  'ordinary undecided admission intake remains unchanged'
);

select set_config('request.jwt.claim.sub','f6b00000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select lives_ok(
  $$update public.admission_applications
       set status='accepted', reviewed_by_user_id='f6b00000-0000-4000-8000-000000000003', reviewed_at='2000-01-01'::timestamptz
     where id='f6b10000-0000-4000-8000-000000000002'$$,
  'authenticated decision path still derives provenance instead of trusting supplied values'
);

select is(
  (select reviewed_by_user_id from public.admission_applications where id='f6b10000-0000-4000-8000-000000000002'),
  'f6b00000-0000-4000-8000-000000000001'::uuid,
  'authenticated admission decision records auth actor'
);

reset role;

select * from finish();
rollback;
