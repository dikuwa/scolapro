begin;

select plan(5);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fa000000-0000-4000-8000-000000000001','learner-retry-admin@example.test','authenticated','authenticated',now(),now());
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa000000-0000-4000-8000-000000000001','school_admin',current_date);

select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

create temporary table learner_registration_test_calls(call_count integer not null);
insert into learner_registration_test_calls values(0);

create or replace function public.create_learner_enrolment(
  p_school_id uuid,
  p_academic_year integer,
  p_grade_id uuid,
  p_register_class_id uuid,
  p_first_names text,
  p_surname text,
  p_preferred_name text default null,
  p_date_of_birth date default null,
  p_sex text default 'unspecified',
  p_admission_number text default null,
  p_enrolled_from date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  update learner_registration_test_calls set call_count=call_count+1;
  return jsonb_build_object(
    'learner_id','fa100000-0000-4000-8000-000000000001',
    'enrolment_id','fa200000-0000-4000-8000-000000000001',
    'admission_number','TEST-2026-00001'
  );
end;
$$;

select lives_ok(
  $$select public.create_learner_enrolment_idempotent(
    'fa300000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',2026,
    'fa400000-0000-4000-8000-000000000001','fa500000-0000-4000-8000-000000000001',
    'Retry','Learner',null,'2014-01-02','female',null,'2026-01-15'
  )$$,
  'first learner registration operation completes'
);

select is(
  (select call_count from learner_registration_test_calls),
  1,
  'first operation invokes learner creation once'
);

select is(
  (select public.create_learner_enrolment_idempotent(
    'fa300000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',2026,
    'fa400000-0000-4000-8000-000000000001','fa500000-0000-4000-8000-000000000001',
    'Retry','Learner',null,'2014-01-02','female',null,'2026-01-15'
  )->>'learner_id'),
  'fa100000-0000-4000-8000-000000000001',
  'replay returns the original learner identity'
);

select is(
  (select call_count from learner_registration_test_calls),
  1,
  'replay does not create a second learner identity'
);

select throws_ok(
  $$select public.create_learner_enrolment_idempotent(
    'fa300000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',2026,
    'fa400000-0000-4000-8000-000000000001','fa500000-0000-4000-8000-000000000001',
    'Changed','Learner',null,'2014-01-02','female',null,'2026-01-15'
  )$$,
  'Client operation ID was already used with different learner registration data',
  'reusing an operation ID with changed registration data is rejected'
);

select * from finish();
rollback;
