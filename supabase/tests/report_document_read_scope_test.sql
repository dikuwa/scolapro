begin;

select plan(5);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fa200000-0000-4000-8000-000000000001','report-doc-teacher@example.test','authenticated','authenticated',now(),now()),
  ('fa200000-0000-4000-8000-000000000002','report-doc-admin@example.test','authenticated','authenticated',now(),now()),
  ('fa200000-0000-4000-8000-000000000003','report-doc-parent@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values
  ('fa210000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fa200000-0000-4000-8000-000000000001','DOC-TEACH','Doc','Teacher','active'),
  ('fa210000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fa200000-0000-4000-8000-000000000002','DOC-ADMIN','Doc','Admin','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa200000-0000-4000-8000-000000000001','fa210000-0000-4000-8000-000000000001','teacher',current_date-5),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa200000-0000-4000-8000-000000000002','fa210000-0000-4000-8000-000000000002','school_admin',current_date-5);

insert into public.teacher_allocations(id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from)
select
  'fa220000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
  so.id,'40000000-0000-4000-8000-00000000001a','fa210000-0000-4000-8000-000000000001',current_date-5
from public.subject_offerings so
where so.school_id='22222222-2222-4222-8222-222222222222'
limit 1;

-- If the compact seed has no subject offering, create the minimal allocation subject.
insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
select 'fa230000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','DOC-SUB','Document Scope','active'
where not exists(select 1 from public.teacher_allocations where id='fa220000-0000-4000-8000-000000000001');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
select 'fa240000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
       'fa230000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',1,'active'
where not exists(select 1 from public.teacher_allocations where id='fa220000-0000-4000-8000-000000000001');

insert into public.teacher_allocations(id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from)
select 'fa220000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
       'fa240000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','fa210000-0000-4000-8000-000000000001',current_date-5
where not exists(select 1 from public.teacher_allocations where id='fa220000-0000-4000-8000-000000000001');

insert into public.guardian_profiles(id,tenant_id,first_names,surname)
values('fa250000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Doc','Parent');
insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,relationship_type,is_legal_guardian,effective_from)
values('fa260000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','fa250000-0000-4000-8000-000000000001','parent',true,current_date-5);
insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id,linked_by_user_id)
values('fa270000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fa250000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000003','fa200000-0000-4000-8000-000000000003');

insert into public.report_card_snapshots(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,template_version,snapshot_version,data_snapshot,status,generated_by_user_id,published_at
) values
  ('fa280000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',2026,1,'DOC',1,'{}','published','fa200000-0000-4000-8000-000000000002',now()),
  ('fa280000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002',2026,1,'DOC',1,'{}','published','fa200000-0000-4000-8000-000000000002',now());

insert into public.report_card_documents(
  id,tenant_id,school_id,snapshot_id,template_key,template_version,document_format,storage_bucket,storage_path,status,generated_by_user_id
) values
  ('fa290000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa280000-0000-4000-8000-000000000001','DOC','1','pdf','report-cards','doc/learner1.pdf','ready','fa200000-0000-4000-8000-000000000002'),
  ('fa290000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa280000-0000-4000-8000-000000000002','DOC','1','pdf','report-cards','doc/learner2.pdf','ready','fa200000-0000-4000-8000-000000000002');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa200000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select count(*)::integer from public.report_card_documents),1,'teacher sees only report documents for learners in their assigned class');
select is((select id from public.report_card_documents),'fa290000-0000-4000-8000-000000000001'::uuid,'teacher sees the exact in-scope report artifact');
reset role;

select set_config('request.jwt.claim.sub','fa200000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select count(*)::integer from public.report_card_documents),1,'guardian sees only published report documents for actively linked learner');
select is((select id from public.report_card_documents),'fa290000-0000-4000-8000-000000000001'::uuid,'guardian sees the exact linked learner artifact');
reset role;

select set_config('request.jwt.claim.sub','fa200000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*)::integer from public.report_card_documents),2,'school administrator retains school-wide report document oversight');
reset role;

select * from finish();
rollback;
