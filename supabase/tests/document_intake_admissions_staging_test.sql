begin;
select plan(30);

select has_table('public','document_intake_jobs','shared document intake jobs exist');
select has_table('public','document_intake_artifacts','shared document intake source artifacts exist');
select has_function('public','create_admission_intake_job',array['uuid','integer','text','text'],'admission intake job creator exists');
select has_function('public','save_admission_intake_candidate',array['uuid','jsonb','jsonb'],'candidate staging boundary exists');
select has_function('public','review_admission_intake_candidate',array['uuid','text','uuid'],'human review boundary exists');
select has_function('public','commit_admission_intake_job',array['uuid'],'governed admission commit boundary exists');

select is((select public from storage.buckets where id='document-intake-private'),false,'intake storage bucket is private');
select is((select file_size_limit from storage.buckets where id='document-intake-private'),10485760::bigint,'intake storage is capped at 10MB');

select is(has_function_privilege('anon','public.create_admission_intake_job(uuid,integer,text,text)','EXECUTE'),false,'anon cannot create admissions intake');
select is(has_function_privilege('authenticated','public.create_admission_intake_job(uuid,integer,text,text)','EXECUTE'),true,'authenticated managers can invoke guarded intake creation');

insert into public.tenants(id,name,slug)
values('fd000000-0000-4000-8000-000000000001','Admission Intake Tenant','admission-intake-tenant');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('fd010000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','Admission Intake School','AI-001','Erongo','Swakopmund');

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fd020000-0000-4000-8000-000000000001','admission-admin@example.test','authenticated','authenticated',now(),now()),
  ('fd020000-0000-4000-8000-000000000002','admission-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(id,tenant_id,school_id,user_id,role_key,active_from)
values
  ('fd030000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','fd010000-0000-4000-8000-000000000001','fd020000-0000-4000-8000-000000000001','school_admin',current_date-10),
  ('fd030000-0000-4000-8000-000000000002','fd000000-0000-4000-8000-000000000001','fd010000-0000-4000-8000-000000000001','fd020000-0000-4000-8000-000000000002','teacher',current_date-10);

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name)
values('fd040000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','fd010000-0000-4000-8000-000000000001',2027,'G8','Grade 8');

insert into public.register_classes(id,tenant_id,school_id,grade_id,academic_year,class_code,display_name)
values('fd050000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','fd010000-0000-4000-8000-000000000001','fd040000-0000-4000-8000-000000000001',2027,'8A','8A');

insert into public.learners(id,tenant_id,first_names,surname,date_of_birth,sex)
values('fd060000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','Existing','Learner','2013-01-05','F');

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,grade_id,register_class_id,
  admission_number,enrolled_from,enrolled_to,status
) values(
  'fd070000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001',
  'fd010000-0000-4000-8000-000000000001','fd060000-0000-4000-8000-000000000001',
  2026,null,null,'OLD-1','2026-01-01','2026-12-31','completed'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd020000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.create_admission_intake_job(
    'fd010000-0000-4000-8000-000000000001',2027,'online_form','application_form'
  )$$,
  'admission manager can create a staged online intake'
);

select is(
  (
    select extraction_status
    from public.document_intake_jobs
    where school_id='fd010000-0000-4000-8000-000000000001'
    order by created_at desc limit 1
  ),
  'not_required',
  'online equivalent does not pretend OCR/extraction occurred'
);

select lives_ok(
  $$
  select public.save_admission_intake_candidate(
    (
      select id from public.document_intake_jobs
      where school_id='fd010000-0000-4000-8000-000000000001'
      order by created_at desc limit 1
    ),
    jsonb_build_object(
      'first_names','Existing',
      'surname','Learner',
      'date_of_birth','2013-01-05',
      'requested_grade_id','fd040000-0000-4000-8000-000000000001',
      'guardian_1_name','Guardian One',
      'guardian_1_contact','0812345678',
      'previous_school','Previous School'
    ),
    '{"first_names":1,"surname":1,"date_of_birth":1}'::jsonb
  )
  $$,
  'candidate fields are staged for human review'
);

select is(
  (
    select match_status from public.document_intake_jobs
    where school_id='fd010000-0000-4000-8000-000000000001'
    order by created_at desc limit 1
  ),
  'possible_match',
  'existing learner match is surfaced before authoritative creation'
);

select is(
  (
    select match_candidates->'learners'->0->>'learner_id'
    from public.document_intake_jobs
    where school_id='fd010000-0000-4000-8000-000000000001'
    order by created_at desc limit 1
  ),
  'fd060000-0000-4000-8000-000000000001',
  'possible existing learner identity is retained as review evidence'
);

select lives_ok(
  $$
  select public.review_admission_intake_candidate(
    (
      select id from public.document_intake_jobs
      where school_id='fd010000-0000-4000-8000-000000000001'
      order by created_at desc limit 1
    ),
    'use_existing_learner',
    'fd060000-0000-4000-8000-000000000001'
  )
  $$,
  'human reviewer can explicitly select a reviewed existing learner match'
);

select lives_ok(
  $$
  select public.commit_admission_intake_job(
    (
      select id from public.document_intake_jobs
      where school_id='fd010000-0000-4000-8000-000000000001'
      order by created_at desc limit 1
    )
  )
  $$,
  'reviewed intake commits only to the existing admission application workflow'
);

select is(
  (
    select status from public.admission_applications
    where intake_job_id=(
      select id from public.document_intake_jobs
      where school_id='fd010000-0000-4000-8000-000000000001'
      order by created_at desc limit 1
    )
  ),
  'received',
  'intake commit creates a pre-enrolment received application'
);

select is(
  (
    select learner_id::text from public.admission_applications
    where intake_job_id=(
      select id from public.document_intake_jobs
      where school_id='fd010000-0000-4000-8000-000000000001'
      order by created_at desc limit 1
    )
  ),
  'fd060000-0000-4000-8000-000000000001',
  'reviewed existing learner match is carried to the admission workflow without creating another identity'
);

select is(
  (select count(*)::integer from public.learners where tenant_id='fd000000-0000-4000-8000-000000000001'),
  1,
  'document intake commit never creates learner identities directly'
);

select is(
  (select count(*)::integer from public.enrolments where tenant_id='fd000000-0000-4000-8000-000000000001'),
  1,
  'document intake commit never creates enrolments directly'
);

select is(
  (
    select committed_entity_id::text from public.document_intake_jobs
    where school_id='fd010000-0000-4000-8000-000000000001'
    order by created_at desc limit 1
  ),
  (
    select id::text from public.admission_applications
    where intake_job_id=(
      select id from public.document_intake_jobs
      where school_id='fd010000-0000-4000-8000-000000000001'
      order by created_at desc limit 1
    )
  ),
  'committed target reference is retained as provenance'
);

select is(
  (
    select public.commit_admission_intake_job(
      (
        select id from public.document_intake_jobs
        where school_id='fd010000-0000-4000-8000-000000000001'
        order by created_at desc limit 1
      )
    )::text
  ),
  (
    select id::text from public.admission_applications
    where intake_job_id=(
      select id from public.document_intake_jobs
      where school_id='fd010000-0000-4000-8000-000000000001'
      order by created_at desc limit 1
    )
  ),
  'intake commit is idempotent'
);

reset role;
select set_config('request.jwt.claim.sub','fd020000-0000-4000-8000-000000000002',true);
set local role authenticated;

select throws_ok(
  $$select public.create_admission_intake_job(
    'fd010000-0000-4000-8000-000000000001',2027,'scan','application_form'
  )$$,
  'Permission denied',
  'teacher cannot create school admissions intake'
);

reset role;
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;

select throws_ok(
  $$select public.create_admission_intake_job(
    'fd010000-0000-4000-8000-000000000001',2027,'scan','application_form'
  )$$,
  'Authentication required',
  'unauthenticated intake creation fails closed'
);

select ok(
  pg_get_functiondef('public.commit_admission_intake_job(uuid)'::regprocedure)
    not ilike '%insert into public.learners%',
  'intake commit contains no direct learner write'
);

select ok(
  pg_get_functiondef('public.commit_admission_intake_job(uuid)'::regprocedure)
    not ilike '%insert into public.enrolments%',
  'intake commit contains no direct enrolment write'
);

select ok(
  pg_get_functiondef('public.save_admission_intake_candidate(uuid,jsonb,jsonb)'::regprocedure)
    ilike '%match_candidates%',
  'candidate staging retains explicit match-review evidence'
);

select ok(
  exists(
    select 1 from pg_policies
    where schemaname='storage'
      and tablename='objects'
      and policyname='authorized managers read document intake artifacts'
  ),
  'source artifacts inherit private admissions intake scope'
);

select ok(
  exists(
    select 1 from pg_indexes
    where schemaname='public'
      and indexname='admission_applications_intake_job_uidx'
  ),
  'one intake job can commit to at most one admission application'
);

select * from finish();
rollback;
