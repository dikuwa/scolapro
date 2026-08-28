begin;

select plan(5);

insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '74000000-0000-4000-8000-000000000001',
  'authenticated','authenticated','integrity-fixture@scolapro.invalid','',now(),now(),now()
);

insert into public.tenants(id,name,slug)
values('84111111-1111-4111-8111-111111111111','Integrity Fixture Tenant','integrity-fixture-tenant');

insert into public.schools(id,tenant_id,name,emis_number,region,town) values
('84222222-2222-4222-8222-222222222221','84111111-1111-4111-8111-111111111111','Integrity School A','INTA001','Khomas','Windhoek'),
('84222222-2222-4222-8222-222222222222','84111111-1111-4111-8111-111111111111','Integrity School B','INTB001','Khomas','Windhoek');

insert into public.learners(id,tenant_id,first_names,surname,date_of_birth,sex) values
('84333333-3333-4333-8333-333333333331','84111111-1111-4111-8111-111111111111','Alpha','Learner','2010-01-01','unspecified'),
('84333333-3333-4333-8333-333333333332','84111111-1111-4111-8111-111111111111','Beta','Learner','2010-01-02','unspecified');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status) values
('84444444-4444-4444-8444-444444444441','84111111-1111-4111-8111-111111111111','84222222-2222-4222-8222-222222222221','84333333-3333-4333-8333-333333333331',2026,'2026-01-12','current'),
('84444444-4444-4444-8444-444444444442','84111111-1111-4111-8111-111111111111','84222222-2222-4222-8222-222222222222','84333333-3333-4333-8333-333333333332',2026,'2026-01-12','current');

insert into public.late_detention_obligations(
  id,tenant_id,school_id,learner_id,qualifying_week_start,qualifying_late_count,due_on,status
) values
('84555555-5555-4555-8555-555555555551','84111111-1111-4111-8111-111111111111','84222222-2222-4222-8222-222222222221','84333333-3333-4333-8333-333333333331','2026-08-24',3,'2026-08-28','pending'),
('84555555-5555-4555-8555-555555555552','84111111-1111-4111-8111-111111111111','84222222-2222-4222-8222-222222222222','84333333-3333-4333-8333-333333333332','2026-08-24',3,'2026-08-28','pending');

insert into public.detention_sessions(
  id,tenant_id,school_id,session_date,status,created_by_user_id
) values(
  '84666666-6666-4666-8666-666666666661','84111111-1111-4111-8111-111111111111','84222222-2222-4222-8222-222222222221','2026-08-28','planned','74000000-0000-4000-8000-000000000001'
);

select lives_ok(
  $$insert into public.detention_session_items(id,tenant_id,school_id,detention_session_id,obligation_id,learner_id)
    values('84777777-7777-4777-8777-777777777771','84111111-1111-4111-8111-111111111111','84222222-2222-4222-8222-222222222221','84666666-6666-4666-8666-666666666661','84555555-5555-4555-8555-555555555551','84333333-3333-4333-8333-333333333331')$$,
  'detention session item accepts matching session, obligation, school and learner scope'
);

select throws_ok(
  $$insert into public.detention_session_items(id,tenant_id,school_id,detention_session_id,obligation_id,learner_id)
    values('84777777-7777-4777-8777-777777777772','84111111-1111-4111-8111-111111111111','84222222-2222-4222-8222-222222222221','84666666-6666-4666-8666-666666666661','84555555-5555-4555-8555-555555555552','84333333-3333-4333-8333-333333333332')$$,
  'P0001','Detention item scope must match obligation',
  'detention session item rejects a cross-school obligation'
);

insert into public.report_card_snapshots(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,template_version,snapshot_version,data_snapshot,status,generated_by_user_id
) values
('84888888-8888-4888-8888-888888888881','84111111-1111-4111-8111-111111111111','84222222-2222-4222-8222-222222222221','84333333-3333-4333-8333-333333333331','84444444-4444-4444-8444-444444444441',2026,2,'TEST_V1',1,'{}'::jsonb,'draft','74000000-0000-4000-8000-000000000001'),
('84888888-8888-4888-8888-888888888882','84111111-1111-4111-8111-111111111111','84222222-2222-4222-8222-222222222221','84333333-3333-4333-8333-333333333331','84444444-4444-4444-8444-444444444441',2026,2,'TEST_V1',2,'{}'::jsonb,'certified','74000000-0000-4000-8000-000000000001');

select throws_ok(
  $$insert into public.report_card_documents(tenant_id,school_id,snapshot_id,template_key,template_version,document_format,storage_bucket,storage_path)
    values('84111111-1111-4111-8111-111111111111','84222222-2222-4222-8222-222222222221','84888888-8888-4888-8888-888888888881','TERM_REPORT','1','pdf','private-reports','draft.pdf')$$,
  'P0001','Report documents may only be registered for certified historical snapshots',
  'report-card document rejects a draft snapshot'
);

select throws_ok(
  $$insert into public.report_card_documents(tenant_id,school_id,snapshot_id,template_key,template_version,document_format,storage_bucket,storage_path)
    values('84111111-1111-4111-8111-111111111111','84222222-2222-4222-8222-222222222222','84888888-8888-4888-8888-888888888882','TERM_REPORT','1','pdf','private-reports','wrong-school.pdf')$$,
  'P0001','Report document scope must match snapshot',
  'report-card document rejects cross-school scope'
);

select lives_ok(
  $$insert into public.report_card_documents(tenant_id,school_id,snapshot_id,template_key,template_version,document_format,storage_bucket,storage_path,content_sha256,page_count)
    values('84111111-1111-4111-8111-111111111111','84222222-2222-4222-8222-222222222221','84888888-8888-4888-8888-888888888882','TERM_REPORT','1','pdf','private-reports','certified.pdf',repeat('a',64),1)$$,
  'report-card document accepts matching certified snapshot scope'
);

select * from finish();
rollback;
