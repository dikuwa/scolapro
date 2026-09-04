begin;

select plan(11);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fa800000-0000-4000-8000-000000000001','submission-hod@example.test','authenticated','authenticated',now(),now()),
  ('fa800000-0000-4000-8000-000000000002','submission-other@example.test','authenticated','authenticated',now(),now()),
  ('fa800000-0000-4000-8000-000000000003','submission-principal@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(id,tenant_id,school_id,user_id,role_key,active_from)
values
  ('fa810000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa800000-0000-4000-8000-000000000001','hod',current_date-10),
  ('fa810000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa800000-0000-4000-8000-000000000003','principal',current_date-10);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values('fa820000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','SUB-AUTH','Submission Authority','active');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
values('fa830000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fa820000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',5,'active');

insert into public.assessment_schemes(id,tenant_id,school_id,subject_offering_id,scheme_key,version,capture_mode,effective_from,status,created_by_user_id)
values('fa840000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa830000-0000-4000-8000-000000000001','SUB-AUTH','1','detailed','2026-01-01','active','fa800000-0000-4000-8000-000000000001');

insert into public.assessment_instances(id,tenant_id,school_id,academic_year,assessment_scheme_id,subject_offering_id,register_class_id,term_number,display_name,status,created_by_user_id)
values('fa850000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fa840000-0000-4000-8000-000000000001','fa830000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a',1,'Submission authority instance','review','fa800000-0000-4000-8000-000000000001');

select ok(
  not has_function_privilege('authenticated','app_private.enforce_mark_submission_actor_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_mark_submission_actor_integrity()','EXECUTE'),
  'mark-submission actor helper is private'
);

select trigger_is('public','mark_submissions','mark_submission_actor_integrity_trg','app_private','enforce_mark_submission_actor_integrity','mark-submission actor trigger is installed');

select ok(
  not has_table_privilege('authenticated','public.mark_submissions','INSERT')
  and not has_table_privilege('authenticated','public.mark_submissions','UPDATE'),
  'mark submissions remain RPC-only for authenticated clients'
);

select throws_ok(
  $$insert into public.mark_submissions(tenant_id,school_id,assessment_instance_id,submitted_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa850000-0000-4000-8000-000000000001','fa800000-0000-4000-8000-000000000002')$$,
  'Mark submission submitter is not authorized for assessment instance',
  'trusted write cannot credit an unrelated submitter'
);

select lives_ok(
  $$insert into public.mark_submissions(id,tenant_id,school_id,assessment_instance_id,submitted_by_user_id)
    values('fa860000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa850000-0000-4000-8000-000000000001','fa800000-0000-4000-8000-000000000001')$$,
  'authorized assessment actor remains a valid trusted submitter'
);

select throws_ok(
  $$insert into public.mark_submissions(tenant_id,school_id,assessment_instance_id,submitted_by_user_id,status,reviewed_by_user_id,reviewed_at)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa850000-0000-4000-8000-000000000001','fa800000-0000-4000-8000-000000000001','verified','fa800000-0000-4000-8000-000000000003',now())$$,
  'Mark submission must begin in submitted state without review provenance',
  'trusted insert cannot originate a pre-reviewed submission'
);

select throws_ok(
  $$update public.mark_submissions set status='verified',reviewed_by_user_id='fa800000-0000-4000-8000-000000000002',reviewed_at=now() where id='fa860000-0000-4000-8000-000000000001'$$,
  'Mark submission reviewer is not authorized for school',
  'review transition rejects unrelated reviewer provenance'
);

select lives_ok(
  $$update public.mark_submissions set status='verified',reviewed_by_user_id='fa800000-0000-4000-8000-000000000003',reviewed_at=now() where id='fa860000-0000-4000-8000-000000000001'$$,
  'authorized academic leader can review a submitted mark set'
);

select throws_ok(
  $$update public.mark_submissions set status='returned' where id='fa860000-0000-4000-8000-000000000001'$$,
  'Reviewed mark submission status is immutable',
  'reviewed submission cannot move to another terminal state'
);

select throws_ok(
  $$update public.mark_submissions set reviewed_by_user_id='fa800000-0000-4000-8000-000000000001' where id='fa860000-0000-4000-8000-000000000001'$$,
  'Mark submission reviewer provenance is immutable',
  'reviewer provenance cannot be rewritten after review'
);

select throws_ok(
  $$update public.mark_submissions set submitted_by_user_id='fa800000-0000-4000-8000-000000000003' where id='fa860000-0000-4000-8000-000000000001'$$,
  'Mark submission root scope and submitter provenance are immutable',
  'submitter provenance cannot be rewritten after creation'
);

select * from finish();
rollback;
