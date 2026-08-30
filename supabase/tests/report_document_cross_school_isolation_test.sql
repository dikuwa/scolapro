begin;

select plan(9);

-- Build a second school inside the same tenant so this test proves school isolation,
-- not merely tenant isolation.
insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('fb000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Cross School','CROSS002','Erongo','Walvis Bay');

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name)
values('fb010000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb000000-0000-4000-8000-000000000001',2026,'10','Grade 10');
insert into public.register_classes(id,tenant_id,school_id,grade_id,academic_year,class_code,display_name)
values('fb020000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb000000-0000-4000-8000-000000000001','fb010000-0000-4000-8000-000000000001',2026,'10X','Grade 10/X');
insert into public.learners(id,tenant_id,first_names,surname,date_of_birth,sex)
values('fb030000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Cross','Learner','2010-03-03','female');
insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,grade_id,register_class_id,admission_number,enrolled_from)
values('fb040000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb000000-0000-4000-8000-000000000001','fb030000-0000-4000-8000-000000000001',2026,'fb010000-0000-4000-8000-000000000001','fb020000-0000-4000-8000-000000000001','CROSS-001','2026-01-12');

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
 ('fb100000-0000-4000-8000-000000000001','cross-doc-admin@example.test','authenticated','authenticated',now(),now()),
 ('fb100000-0000-4000-8000-000000000002','cross-doc-teacher@example.test','authenticated','authenticated',now(),now()),
 ('fb100000-0000-4000-8000-000000000003','cross-doc-parent@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values
 ('fb110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000001','CROSS-ADMIN','Cross','Admin','active'),
 ('fb110000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fb100000-0000-4000-8000-000000000002','CROSS-TEACH','Cross','Teacher','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values
 ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb100000-0000-4000-8000-000000000001','fb110000-0000-4000-8000-000000000001','school_admin',current_date-5),
 ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb100000-0000-4000-8000-000000000002','fb110000-0000-4000-8000-000000000002','teacher',current_date-5);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values('fb120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','CROSS-DOC','Cross document scope','active');
insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
values('fb130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fb120000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',1,'active');
insert into public.teacher_allocations(id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from)
values('fb140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fb130000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','fb110000-0000-4000-8000-000000000002',current_date-5);

insert into public.guardian_profiles(id,tenant_id,first_names,surname)
values('fb150000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Cross','Parent');
insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,relationship_type,is_legal_guardian,effective_from)
values('fb160000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','fb150000-0000-4000-8000-000000000001','parent',true,current_date-5);
insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id,linked_by_user_id)
values('fb170000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fb150000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000003','fb100000-0000-4000-8000-000000000003');

insert into public.report_card_snapshots(
 id,tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,template_version,snapshot_version,data_snapshot,status,generated_by_user_id,published_at
) values
 ('fb180000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',2026,1,'CROSS',1,'{}','published','fb100000-0000-4000-8000-000000000001',now()),
 ('fb180000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fb000000-0000-4000-8000-000000000001','fb030000-0000-4000-8000-000000000001','fb040000-0000-4000-8000-000000000001',2026,1,'CROSS',1,'{}','published','fb100000-0000-4000-8000-000000000001',now());

insert into public.report_card_documents(
 id,tenant_id,school_id,snapshot_id,template_key,template_version,document_format,storage_bucket,storage_path,status,generated_by_user_id
) values
 ('fb190000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb180000-0000-4000-8000-000000000001','CROSS','1','pdf','report-card-artifacts','school-a/report.pdf','ready','fb100000-0000-4000-8000-000000000001'),
 ('fb190000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fb000000-0000-4000-8000-000000000001','fb180000-0000-4000-8000-000000000002','CROSS','1','pdf','report-card-artifacts','school-b/report.pdf','ready','fb100000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.role','authenticated',true);

-- School A administrator must not gain School B document access from tenant membership.
select set_config('request.jwt.claim.sub','fb100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select count(*)::integer from public.report_card_documents),1,'school administrator sees only own-school report artifacts');
select is((select count(*)::integer from public.report_card_documents where id='fb190000-0000-4000-8000-000000000002'),0,'school administrator cannot fetch another school artifact by guessed id');
select is((select id from public.report_card_documents),'fb190000-0000-4000-8000-000000000001'::uuid,'school administrator sees the expected own-school artifact');
reset role;

-- Teacher scope follows the assigned class and does not bleed across schools.
select set_config('request.jwt.claim.sub','fb100000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*)::integer from public.report_card_documents),1,'teacher sees only report artifacts for assigned learners in own school');
select is((select count(*)::integer from public.report_card_documents where id='fb190000-0000-4000-8000-000000000002'),0,'teacher cannot fetch another school artifact by guessed id');
select is((select id from public.report_card_documents),'fb190000-0000-4000-8000-000000000001'::uuid,'teacher sees the expected assigned learner artifact');
reset role;

-- Parent scope follows an active learner relationship, not school or storage-path knowledge.
select set_config('request.jwt.claim.sub','fb100000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select count(*)::integer from public.report_card_documents),1,'guardian sees only published artifacts for actively linked learner');
select is((select count(*)::integer from public.report_card_documents where id='fb190000-0000-4000-8000-000000000002'),0,'guardian cannot fetch an unrelated school artifact by guessed id');
select is((select id from public.report_card_documents),'fb190000-0000-4000-8000-000000000001'::uuid,'guardian sees the expected linked learner artifact');
reset role;

select * from finish();
rollback;
