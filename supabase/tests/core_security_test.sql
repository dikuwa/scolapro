begin;

select plan(30);

select has_table('public', 'learners', 'learners table exists');
select has_table('public', 'enrolments', 'enrolments table exists');
select has_table('public', 'school_memberships', 'school memberships table exists');
select has_table('public', 'school_invitations', 'school invitations table exists');
select has_table('public', 'attendance_evidence', 'attendance evidence table exists');

select ok((select relrowsecurity from pg_class where oid = 'public.learners'::regclass), 'RLS is enabled on learners');
select ok((select relrowsecurity from pg_class where oid = 'public.enrolments'::regclass), 'RLS is enabled on enrolments');
select ok((select relrowsecurity from pg_class where oid = 'public.school_invitations'::regclass), 'RLS is enabled on school invitations');
select ok((select relrowsecurity from pg_class where oid = 'public.attendance_evidence'::regclass), 'RLS is enabled on attendance evidence');

select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='learners' and policyname='authorized staff can read enrolled learners'), 'hardened learner read policy exists');
select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='enrolments' and policyname='authorized staff can read school enrolments'), 'hardened enrolment read policy exists');
select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='school_invitations' and policyname='authorized admins can read school invitations'), 'invitation read policy exists');
select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='attendance_evidence' and policyname='attendance recorders can read attendance evidence'), 'attendance evidence read policy exists');

select has_index('public','learners','learners_tenant_national_id_uidx','tenant learner national ID uniqueness index exists');
select has_index('public','learners','learners_tenant_birth_certificate_uidx','tenant learner birth certificate uniqueness index exists');
select has_index('public','enrolments','enrolments_school_year_admission_number_uidx','school/year admission number uniqueness index exists');
select has_index('public','enrolments','enrolments_one_current_per_learner_year_uidx','one-current-enrolment uniqueness index exists');
select has_index('public','attendance_evidence','attendance_evidence_submission_idx','attendance evidence submission index exists');

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

select * from finish();
rollback;