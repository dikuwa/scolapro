begin;

select plan(32);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('e7030000-0000-4000-8000-000000000001','subject-bulk-admin@example.test','authenticated','authenticated',now(),now()),
('e7030000-0000-4000-8000-000000000002','subject-bulk-teacher@example.test','authenticated','authenticated',now(),now());
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e7030000-0000-4000-8000-000000000001','school_admin',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','e7030000-0000-4000-8000-000000000002','teacher',current_date);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status) values
('e7031000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','703-A','Subject 703 A','active'),
('e7031000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','703-B','Subject 703 B','active'),
('e7031000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','703-W','Subject 703 Wrong Grade','active'),
('e7031000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','703-I','Subject 703 Inactive','active');
insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status) values
('e7032000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e7031000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active'),
('e7032000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e7031000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000010',5,'active'),
('e7032000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e7031000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000011',5,'active'),
('e7032000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e7031000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000010',5,'inactive');

insert into public.schools(id,tenant_id,name,emis_number,status)
values('e7033000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Other 703 School','703-OTHER','active');
insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name)
values('e7034000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','e7033000-0000-4000-8000-000000000001',2026,'10','Grade 10');
insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values('e7035000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','e7033000-0000-4000-8000-000000000001','CROSS','Cross-school subject','active');
insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
values('e7036000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','e7033000-0000-4000-8000-000000000001',2026,'e7035000-0000-4000-8000-000000000001','e7034000-0000-4000-8000-000000000001',5,'active');

insert into public.tenants(id,name,slug) values('e7037000-0000-4000-8000-000000000001','Other 703 Tenant','other-703-tenant');
insert into public.schools(id,tenant_id,name,emis_number,status)
values('e7038000-0000-4000-8000-000000000001','e7037000-0000-4000-8000-000000000001','Other Tenant School','703-TENANT','active');
insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name)
values('e7039000-0000-4000-8000-000000000001','e7037000-0000-4000-8000-000000000001','e7038000-0000-4000-8000-000000000001',2026,'10','Grade 10');
insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values('e703a000-0000-4000-8000-000000000001','e7037000-0000-4000-8000-000000000001','e7038000-0000-4000-8000-000000000001','TENANT','Cross-tenant subject','active');
insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
values('e703b000-0000-4000-8000-000000000001','e7037000-0000-4000-8000-000000000001','e7038000-0000-4000-8000-000000000001',2026,'e703a000-0000-4000-8000-000000000001','e7039000-0000-4000-8000-000000000001',5,'active');

select ok(to_regprocedure('public.preview_learner_subject_bulk_assignment(uuid,integer,text,uuid,uuid[])') is not null,'bulk preview RPC exists');
select ok(to_regprocedure('public.apply_learner_subject_bulk_assignment(uuid,integer,text,uuid,uuid[],text,text)') is not null,'bulk apply RPC exists');
select ok(not has_function_privilege('anon','public.preview_learner_subject_bulk_assignment(uuid,integer,text,uuid,uuid[])','EXECUTE'),'anonymous cannot preview learner subjects');
select ok(not has_function_privilege('anon','public.apply_learner_subject_bulk_assignment(uuid,integer,text,uuid,uuid[],text,text)','EXECUTE'),'anonymous cannot apply learner subjects');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e7030000-0000-4000-8000-000000000001',true);
set local role authenticated;

create temporary table first_preview on commit drop as
select public.preview_learner_subject_bulk_assignment(
  '22222222-2222-4222-8222-222222222222',2026,'grade','30000000-0000-4000-8000-000000000010',
  array['e7032000-0000-4000-8000-000000000001'::uuid,'e7032000-0000-4000-8000-000000000002'::uuid,'e7032000-0000-4000-8000-000000000001'::uuid]
) data;
select is((select (data->>'affected_learner_count')::integer from first_preview),2,'grade preview resolves exactly the two current learners');
select is((select jsonb_array_length(data->'subject_offering_ids') from first_preview),2,'preview normalizes duplicate subject IDs');
select is((select (data->>'addition_count')::integer from first_preview),4,'preview reports four additions across learners and subjects');
select is((select (data->>'conflict_count')::integer from first_preview),0,'valid preview has no conflicts');

create temporary table first_apply on commit drop as
select public.apply_learner_subject_bulk_assignment(
  '22222222-2222-4222-8222-222222222222',2026,'grade','30000000-0000-4000-8000-000000000010',
  array['e7032000-0000-4000-8000-000000000001'::uuid,'e7032000-0000-4000-8000-000000000002'::uuid],
  (select data->>'preview_fingerprint' from first_preview),'Initial assignment'
) data;
select is((select (data->>'registered_count')::integer from first_apply),4,'one bulk apply registers all four choices server-side');
select is((select count(*)::integer from public.learner_subject_registrations where subject_offering_id in ('e7032000-0000-4000-8000-000000000001','e7032000-0000-4000-8000-000000000002') and status='active'),4,'authoritative registration table contains four active rows');

create temporary table repeat_preview on commit drop as
select public.preview_learner_subject_bulk_assignment('22222222-2222-4222-8222-222222222222',2026,'grade','30000000-0000-4000-8000-000000000010',array['e7032000-0000-4000-8000-000000000002'::uuid,'e7032000-0000-4000-8000-000000000001'::uuid]) data;
select is((select (data->>'unchanged_count')::integer from repeat_preview),4,'repeat preview reports all registrations unchanged');
select is((select (data->>'addition_count')::integer from repeat_preview),0,'repeat preview reports no additions');
select is((select (public.apply_learner_subject_bulk_assignment('22222222-2222-4222-8222-222222222222',2026,'grade','30000000-0000-4000-8000-000000000010',array['e7032000-0000-4000-8000-000000000001'::uuid,'e7032000-0000-4000-8000-000000000002'::uuid],data->>'preview_fingerprint','Idempotent retry')->>'changed_count')::integer from repeat_preview),0,'repeat apply is idempotent');

create temporary table reduced_preview on commit drop as
select public.preview_learner_subject_bulk_assignment('22222222-2222-4222-8222-222222222222',2026,'grade','30000000-0000-4000-8000-000000000010',array['e7032000-0000-4000-8000-000000000001'::uuid]) data;
select is((select (data->>'withdrawal_count')::integer from reduced_preview),2,'reduced selection previews two withdrawals');
create temporary table withdrawn_ids on commit drop as select id,enrolment_id from public.learner_subject_registrations where subject_offering_id='e7032000-0000-4000-8000-000000000002';
select lives_ok(format($$select public.apply_learner_subject_bulk_assignment('22222222-2222-4222-8222-222222222222',2026,'grade','30000000-0000-4000-8000-000000000010',array['e7032000-0000-4000-8000-000000000001'::uuid],%L,'Reduced selection')$$,(select data->>'preview_fingerprint' from reduced_preview)),'withdrawal preview applies');
select is((select count(*)::integer from public.learner_subject_registrations where subject_offering_id='e7032000-0000-4000-8000-000000000002' and status='withdrawn'),2,'withdrawal preserves two historical rows');
select is((select count(*)::integer from public.learner_subject_registrations where subject_offering_id='e7032000-0000-4000-8000-000000000002'),2,'withdrawal never deletes registration history');

create temporary table restore_preview on commit drop as
select public.preview_learner_subject_bulk_assignment('22222222-2222-4222-8222-222222222222',2026,'grade','30000000-0000-4000-8000-000000000010',array['e7032000-0000-4000-8000-000000000001'::uuid,'e7032000-0000-4000-8000-000000000002'::uuid]) data;
select is((select (data->>'reactivation_count')::integer from restore_preview),2,'restore preview reports two reactivations');
select lives_ok(format($$select public.apply_learner_subject_bulk_assignment('22222222-2222-4222-8222-222222222222',2026,'grade','30000000-0000-4000-8000-000000000010',array['e7032000-0000-4000-8000-000000000001'::uuid,'e7032000-0000-4000-8000-000000000002'::uuid],%L,'Restore selection')$$,(select data->>'preview_fingerprint' from restore_preview)),'reactivation preview applies');
select is((select count(*)::integer from public.learner_subject_registrations r join withdrawn_ids w on w.id=r.id where r.status='active'),2,'reactivation preserves original registration identities');

select is((public.preview_learner_subject_bulk_assignment('22222222-2222-4222-8222-222222222222',2026,'grade','30000000-0000-4000-8000-000000000010',array['e7032000-0000-4000-8000-000000000003'::uuid])->>'conflict_count')::integer,1,'wrong-grade selection is returned as a preview conflict');
select is((public.preview_learner_subject_bulk_assignment('22222222-2222-4222-8222-222222222222',2026,'grade','30000000-0000-4000-8000-000000000010',array['e7032000-0000-4000-8000-000000000004'::uuid])->>'conflict_count')::integer,1,'inactive offering is returned as a preview conflict');
select throws_ok($$select public.preview_learner_subject_bulk_assignment('22222222-2222-4222-8222-222222222222',2026,'grade','30000000-0000-4000-8000-000000000010',array['e7036000-0000-4000-8000-000000000001'::uuid])$$,'P0001','One or more selected subjects are outside the current school and academic year','cross-school offering is denied without leaking it into preview');
select throws_ok($$select public.preview_learner_subject_bulk_assignment('22222222-2222-4222-8222-222222222222',2026,'grade','30000000-0000-4000-8000-000000000010',array['e703b000-0000-4000-8000-000000000001'::uuid])$$,'P0001','One or more selected subjects are outside the current school and academic year','cross-tenant offering is denied');
select is((public.preview_learner_subject_bulk_assignment('22222222-2222-4222-8222-222222222222',2026,'register_class','40000000-0000-4000-8000-00000000001a',array['e7032000-0000-4000-8000-000000000001'::uuid])->>'affected_learner_count')::integer,1,'register-class scope cannot update learners outside the selected class');
select is((public.preview_learner_subject_bulk_assignment('22222222-2222-4222-8222-222222222222',2026,'field_group','e7032000-0000-4000-8000-000000000001',array['e7032000-0000-4000-8000-000000000001'::uuid])->>'affected_learner_count')::integer,2,'field / academic group resolves only current registrations in that group');

create temporary table stale_preview on commit drop as
select public.preview_learner_subject_bulk_assignment('22222222-2222-4222-8222-222222222222',2026,'grade','30000000-0000-4000-8000-000000000010',array['e7032000-0000-4000-8000-000000000001'::uuid,'e7032000-0000-4000-8000-000000000002'::uuid]) data;
select lives_ok($$select public.sync_learner_subject_registrations('60000000-0000-4000-8000-000000000001',array['e7032000-0000-4000-8000-000000000001'::uuid],'qa-race','Changed after preview')$$,'authoritative state can change after preview');
select throws_ok(format($$select public.apply_learner_subject_bulk_assignment('22222222-2222-4222-8222-222222222222',2026,'grade','30000000-0000-4000-8000-000000000010',array['e7032000-0000-4000-8000-000000000001'::uuid,'e7032000-0000-4000-8000-000000000002'::uuid],%L,'Stale preview')$$,(select data->>'preview_fingerprint' from stale_preview)),'P0001','Assignment scope changed after preview; review the updated preview before applying','stale preview cannot be applied');
select is((select status from public.learner_subject_registrations where enrolment_id='60000000-0000-4000-8000-000000000001' and subject_offering_id='e7032000-0000-4000-8000-000000000002'),'withdrawn','stale apply leaves the newer authoritative state unchanged');

reset role;
select set_config('request.jwt.claim.sub','e7030000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($$select public.preview_learner_subject_bulk_assignment('22222222-2222-4222-8222-222222222222',2026,'grade','30000000-0000-4000-8000-000000000010',array['e7032000-0000-4000-8000-000000000001'::uuid])$$,'P0001','Permission denied','ordinary teacher cannot preview bulk subject mutation');
select throws_ok($$select public.apply_learner_subject_bulk_assignment('22222222-2222-4222-8222-222222222222',2026,'grade','30000000-0000-4000-8000-000000000010',array['e7032000-0000-4000-8000-000000000001'::uuid],'not-a-preview','Denied')$$,'P0001','Permission denied','ordinary teacher cannot apply bulk subject mutation');

reset role;
select is((select count(*)::integer from public.audit_events where event_type='learner_subject_registration.bulk_applied'),3,'only three meaningful bulk applies emit bulk audit evidence');

select * from finish();
rollback;
