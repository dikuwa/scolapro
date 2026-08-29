begin;

select plan(54);

select has_table('public', 'learners', 'learners table exists');
select has_table('public', 'enrolments', 'enrolments table exists');
select has_table('public', 'school_memberships', 'school memberships table exists');
select has_table('public', 'school_invitations', 'school invitations table exists');
select has_table('public', 'attendance_evidence', 'attendance evidence table exists');
select has_table('public', 'school_day_overrides', 'school day overrides table exists');
select has_table('public', 'conduct_events', 'conduct events table exists');
select has_table('public', 'achievement_events', 'achievement events table exists');
select has_table('public', 'learner_support_cases', 'restricted learner support cases table exists');
select has_table('public', 'learning_resource_titles', 'learning resource titles table exists');
select has_table('public', 'learning_resource_loans', 'learning resource loans table exists');
select has_table('public', 'communication_messages', 'communication messages table exists');
select has_table('public', 'admission_applications', 'admission applications table exists');
select has_table('public', 'transfer_events', 'transfer events table exists');
select has_table('public', 'year_end_progressions', 'year end progressions table exists');

select ok((select relrowsecurity from pg_class where oid = 'public.learners'::regclass), 'RLS is enabled on learners');
select ok((select relrowsecurity from pg_class where oid = 'public.enrolments'::regclass), 'RLS is enabled on enrolments');
select ok((select relrowsecurity from pg_class where oid = 'public.school_invitations'::regclass), 'RLS is enabled on school invitations');
select ok((select relrowsecurity from pg_class where oid = 'public.attendance_evidence'::regclass), 'RLS is enabled on attendance evidence');
select ok((select relrowsecurity from pg_class where oid = 'public.learner_support_cases'::regclass), 'RLS is enabled on learner support cases');
select ok((select relrowsecurity from pg_class where oid = 'public.learning_resource_loans'::regclass), 'RLS is enabled on learning resource loans');
select ok((select relrowsecurity from pg_class where oid = 'public.communication_messages'::regclass), 'RLS is enabled on communication messages');
select ok((select relrowsecurity from pg_class where oid = 'public.transfer_events'::regclass), 'RLS is enabled on transfer events');

select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='learners' and policyname='scoped staff read learner identities'), 'scoped learner identity read policy exists');
select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='enrolments' and policyname='scoped staff read enrolments'), 'scoped enrolment read policy exists');
select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='school_invitations' and policyname='authorized admins can read school invitations'), 'invitation read policy exists');
select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='attendance_evidence' and policyname='need to know users read attendance evidence'), 'need-to-know attendance evidence read policy exists');
select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='learner_support_cases' and policyname='need to know users read learner support cases'), 'learner support read policy is need-to-know restricted');

select has_index('public','learners','learners_tenant_national_id_uidx','tenant learner national ID uniqueness index exists');
select has_index('public','learners','learners_tenant_birth_certificate_uidx','tenant learner birth certificate uniqueness index exists');
select has_index('public','enrolments','enrolments_school_year_admission_number_uidx','school/year admission number uniqueness index exists');
select has_index('public','enrolments','enrolments_one_current_per_learner_year_uidx','one-current-enrolment uniqueness index exists');
select has_index('public','attendance_evidence','attendance_evidence_submission_idx','attendance evidence submission index exists');
select has_index('public','learning_resource_loans','learning_resource_one_open_loan_per_copy_uidx','one open learning-resource loan per copy index exists');

select has_function('public','create_learner_enrolment',array['uuid','integer','uuid','uuid','text','text','text','date','text','text','date'],'atomic learner registration function exists');
select ok(to_regprocedure('public.create_school_invitation(uuid,text,text,text,text,text)') is not null,'school invitation creation function exists');
select ok(to_regprocedure('public.accept_school_invitation(text)') is not null,'school invitation acceptance function exists');
select ok(not has_function_privilege('anon','public.create_school_invitation(uuid,text,text,text,text,text)','EXECUTE'),'anonymous users cannot create school invitations');
select ok(has_function_privilege('anon','public.get_school_invitation_preview(text)','EXECUTE'),'anonymous users can preview a token they possess');
select ok(to_regprocedure('public.upsert_school_grade(uuid,integer,text,text)') is not null and to_regprocedure('public.upsert_register_class(uuid,integer,uuid,text,text)') is not null,'academic structure functions exist');
select ok(to_regprocedure('public.update_register_class(uuid,uuid,text,text)') is not null,'register class update function exists');
select ok(to_regprocedure('public.delete_register_class(uuid)') is not null,'register class safe-delete function exists');
select ok(not has_function_privilege('anon','public.delete_register_class(uuid)','EXECUTE'),'anonymous users cannot delete register classes');
select ok(to_regprocedure('public.submit_weekly_register(uuid,jsonb,text)') is not null,'atomic weekly attendance function exists');
select ok(not has_function_privilege('anon','public.submit_weekly_register(uuid,jsonb,text)','EXECUTE'),'anonymous users cannot submit weekly attendance');
select ok(exists (select 1 from storage.buckets where id='attendance-evidence' and public=false),'attendance evidence storage bucket is private');
select ok(to_regprocedure('app_private.can_record_register_class(uuid)') is not null,'class-scoped attendance authorization helper exists');
select ok(to_regprocedure('app_private.is_expected_school_day(uuid,date)') is not null,'school-day resolution helper exists');
select ok(to_regprocedure('public.issue_learning_resource(uuid,uuid,uuid,date,text)') is not null,'learning resource issue function exists');
select ok(not has_function_privilege('anon','public.issue_learning_resource(uuid,uuid,uuid,date,text)','EXECUTE'),'anonymous users cannot issue learning resources');
select ok(to_regprocedure('public.queue_communication(uuid)') is not null,'communication queue function exists');
select ok(not has_function_privilege('anon','public.queue_communication(uuid)','EXECUTE'),'anonymous users cannot queue communications');
select ok(to_regprocedure('public.complete_learner_transfer(uuid)') is not null,'learner transfer completion function exists');
select ok(not has_function_privilege('anon','public.complete_learner_transfer(uuid)','EXECUTE'),'anonymous users cannot complete learner transfers');

select * from finish();
rollback;