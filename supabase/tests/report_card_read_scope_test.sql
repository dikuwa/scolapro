begin;

select plan(5);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fe000000-0000-4000-8000-000000000001','report-teacher@example.test','authenticated','authenticated',now(),now()),
('fe000000-0000-4000-8000-000000000002','report-admin@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values('fe100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fe000000-0000-4000-8000-000000000001','REPORT-T1','Report','Teacher','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe000000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000001','class_teacher',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe000000-0000-4000-8000-000000000002',null,'school_admin',current_date);

update public.register_classes set register_teacher_staff_id='fe100000-0000-4000-8000-000000000001'
where id='40000000-0000-4000-8000-00000000001a';

insert into public.report_card_snapshots(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,
  template_version,snapshot_version,data_snapshot,status,generated_by_user_id
) values
('fe200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',2026,2,'TEST',1,'{"learner":"assigned"}'::jsonb,'draft','fe000000-0000-4000-8000-000000000002'),
('fe200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002',2026,2,'TEST',1,'{"learner":"other"}'::jsonb,'draft','fe000000-0000-4000-8000-000000000002');

select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select is((select count(*)::integer from public.report_card_snapshots where id in ('fe200000-0000-4000-8000-000000000001','fe200000-0000-4000-8000-000000000002')),1,'assigned class teacher sees only assigned learner report snapshots');
select is((select learner_id from public.report_card_snapshots where id in ('fe200000-0000-4000-8000-000000000001','fe200000-0000-4000-8000-000000000002')),'50000000-0000-4000-8000-000000000001'::uuid,'teacher report access resolves to the assigned learner');

reset role;
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is((select count(*)::integer from public.report_card_snapshots where id in ('fe200000-0000-4000-8000-000000000001','fe200000-0000-4000-8000-000000000002')),2,'school admin retains school-wide report snapshot visibility');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='report_card_snapshots' and policyname='scoped users read report card snapshots'),'scoped report-card read policy is installed');
select ok(not exists(select 1 from pg_policies where schemaname='public' and tablename='report_card_snapshots' and policyname='authorized users read report card snapshots'),'old broad report-card policy is removed');

reset role;
select * from finish();
rollback;