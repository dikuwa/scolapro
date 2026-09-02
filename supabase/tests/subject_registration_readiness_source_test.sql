begin;

select plan(21);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fa6c0000-0000-4000-8000-000000000001','subject-readiness-admin@example.test','authenticated','authenticated',now(),now());
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa6c0000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status) values
  ('fa6c1000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','READY-A','Readiness Subject A','active'),
  ('fa6c1000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','READY-B','Readiness Subject B','active');
insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status) values
  ('fa6c2000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fa6c1000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active'),
  ('fa6c2000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fa6c1000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000010',5,'active');

insert into public.learners(id,tenant_id,first_names,surname,sex) values
  ('fa6c3000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Ended','Learner','male');
insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,grade_id,register_class_id,admission_number,enrolled_from,enrolled_to,status
) values(
  'fa6c4000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fa6c3000-0000-4000-8000-000000000001',2026,'30000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-00000000001a',
  'READY-ENDED','2026-01-12','2026-03-31','transferred'
);

insert into public.statutory_form_definitions(id,form_key,display_name,authority,description,active) values
  ('fa6c5000-0000-4000-8000-000000000001','subject_readiness_qa','Subject Readiness QA','QA','Test-only statutory source contract',true);
insert into public.statutory_form_versions(
  id,form_definition_id,version_key,effective_from,source_reference,field_schema,mapping_schema,validation_schema,status
) values(
  'fa6c5000-0000-4000-8000-000000000002','fa6c5000-0000-4000-8000-000000000001','qa-v1','2026-01-01','test fixture','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'draft'
);
insert into public.statutory_reporting_cycles(
  id,tenant_id,school_id,form_version_id,academic_year,cycle_key,reference_date,status,created_by_user_id
) values(
  'fa6c5000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fa6c5000-0000-4000-8000-000000000002',2026,'subject-readiness-qa',current_date,'open','fa6c0000-0000-4000-8000-000000000001'
);

select ok(
  to_regprocedure('app_private.build_subject_registration_readiness_source(uuid,integer,date)') is not null,
  'private subject readiness source helper exists'
);
select ok(
  not has_function_privilege('authenticated','app_private.build_subject_registration_readiness_source(uuid,integer,date)','EXECUTE'),
  'subject readiness source helper remains private'
);
select ok(
  not has_function_privilege('anon','public.get_subject_registration_readiness(uuid,integer,date)','EXECUTE'),
  'anonymous users cannot read subject readiness aggregates'
);
select ok(
  has_function_privilege('authenticated','public.get_subject_registration_readiness(uuid,integer,date)','EXECUTE'),
  'authenticated school members can call the self-authorizing readiness RPC'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa6c0000-0000-4000-8000-000000000001',true);
set local role authenticated;

create temporary table readiness_registration_ids on commit drop as
select
  public.register_learner_subject('60000000-0000-4000-8000-000000000001','fa6c2000-0000-4000-8000-000000000001','qa') as reg_a,
  public.register_learner_subject('60000000-0000-4000-8000-000000000001','fa6c2000-0000-4000-8000-000000000002','qa') as reg_b,
  public.register_learner_subject('fa6c4000-0000-4000-8000-000000000001','fa6c2000-0000-4000-8000-000000000001','historical') as ended_reg;

create temporary table readiness_before on commit drop as
select public.get_subject_registration_readiness(
  '22222222-2222-4222-8222-222222222222',2026,current_date
) as data;

select is((select (data->>'eligible_enrolments')::integer from readiness_before),2,'only the two reference-date eligible seed enrolments are counted');
select is((select (data->>'enrolments_with_registered_subjects')::integer from readiness_before),1,'one eligible learner has registered subjects');
select is((select (data->>'enrolments_without_registered_subjects')::integer from readiness_before),1,'one eligible learner remains without registered subjects');
select is((select (data->>'active_registrations')::integer from readiness_before),2,'historical ended-enrolment registration is excluded from active readiness totals');
select is((select (data->>'configured_offerings')::integer from readiness_before),2,'all configured subject offerings are represented');
select is((select data->>'coverage_status' from readiness_before),'incomplete','coverage is explicitly incomplete while one eligible learner has no choices');
select is(
  (select (item->>'registered_learners')::integer from readiness_before cross join lateral jsonb_array_elements(data->'offerings') item where item->>'subject_code'='READY-A'),
  1,
  'ended learner does not inflate Subject A registered learner count'
);
select is(
  (select (item->>'female')::integer from readiness_before cross join lateral jsonb_array_elements(data->'offerings') item where item->>'subject_code'='READY-A'),
  1,
  'Subject A sex count reflects the eligible female learner only'
);
select is(
  (select (item->>'male')::integer from readiness_before cross join lateral jsonb_array_elements(data->'offerings') item where item->>'subject_code'='READY-A'),
  0,
  'ended male learner is excluded from current Subject A sex count'
);

select is(
  public.withdraw_learner_subject_registration((select reg_b from readiness_registration_ids),'Choice reduced'),
  true,
  'one subject can be withdrawn without removing the learner from coverage while another remains'
);
select is(
  (public.get_subject_registration_readiness('22222222-2222-4222-8222-222222222222',2026,current_date)->>'active_registrations')::integer,
  1,
  'withdrawn current choice leaves one active eligible registration'
);
select is(
  public.withdraw_learner_subject_registration((select reg_a from readiness_registration_ids),'All choices temporarily cleared'),
  true,
  'last active subject can also be withdrawn'
);
select is(
  (public.get_subject_registration_readiness('22222222-2222-4222-8222-222222222222',2026,current_date)->>'enrolments_with_registered_subjects')::integer,
  0,
  'coverage drops to zero learners with subjects when the last eligible choice is withdrawn'
);
select is(
  (public.get_subject_registration_readiness('22222222-2222-4222-8222-222222222222',2026,current_date)->>'enrolments_without_registered_subjects')::integer,
  2,
  'both eligible learners are then visible as missing subject choices'
);
select is(
  public.register_learner_subject('60000000-0000-4000-8000-000000000001','fa6c2000-0000-4000-8000-000000000001','reconciliation'),
  (select reg_a from readiness_registration_ids),
  'reactivation restores the same subject-choice identity'
);

create temporary table subject_readiness_snapshot on commit drop as
select public.generate_statutory_snapshot('fa6c5000-0000-4000-8000-000000000003') as snapshot_id;

select ok((select snapshot_id is not null from subject_readiness_snapshot),'statutory snapshot generation includes subject readiness source');
select is(
  (select s.source_summary->>'generator' from public.statutory_snapshots s join subject_readiness_snapshot x on x.snapshot_id=s.id),
  'school-operational-v3',
  'statutory snapshot records source generator v3'
);
select is(
  (select (s.values #>> '{structure,subject_registration_source,active_registrations}')::integer from public.statutory_snapshots s join subject_readiness_snapshot x on x.snapshot_id=s.id),
  1,
  'statutory snapshot freezes the reconciled active registration count'
);
select is(
  (select s.values #>> '{structure,subject_registration_source,coverage_status}' from public.statutory_snapshots s join subject_readiness_snapshot x on x.snapshot_id=s.id),
  'incomplete',
  'statutory snapshot preserves non-blocking incomplete subject-choice coverage'
);
select is(
  (select count(*)::integer from public.statutory_readiness_issues where reporting_cycle_id='fa6c5000-0000-4000-8000-000000000003' and issue_code ilike '%subject%'),
  0,
  'subject-choice readiness remains informative and does not create blocking statutory issues yet'
);

reset role;
select * from finish();
rollback;
