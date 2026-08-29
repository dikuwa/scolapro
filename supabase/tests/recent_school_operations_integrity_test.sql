begin;

select plan(42);

-- DNEA candidate-number governance.
select has_table('public','examination_candidate_number_history','candidate-number history exists');
select ok((select relrowsecurity from pg_class where oid='public.examination_candidate_number_history'::regclass),'candidate-number history uses RLS');
select ok(to_regprocedure('public.assign_examination_candidate_number(uuid,text,text,text,text)') is not null,'candidate-number assignment RPC exists');
select ok(not has_function_privilege('anon','public.assign_examination_candidate_number(uuid,text,text,text,text)','EXECUTE'),'anonymous users cannot assign candidate numbers');
select ok(has_function_privilege('authenticated','public.assign_examination_candidate_number(uuid,text,text,text,text)','EXECUTE'),'authenticated users can reach governed candidate-number RPC');
select ok(not has_table_privilege('authenticated','public.examination_candidate_number_history','INSERT'),'authenticated users cannot forge candidate-number history');
select ok(not has_table_privilege('authenticated','public.examination_candidate_number_history','UPDATE'),'authenticated users cannot rewrite candidate-number history');
select ok(not has_table_privilege('authenticated','public.examination_candidate_number_history','DELETE'),'authenticated users cannot delete candidate-number history');
select ok(not has_column_privilege('authenticated','public.examination_candidates','candidate_number','UPDATE'),'authenticated users cannot bypass candidate-number assignment history');
select ok(not has_column_privilege('authenticated','public.examination_candidates','centre_number','UPDATE'),'authenticated users cannot bypass centre-number assignment history');
select ok(has_column_privilege('authenticated','public.examination_candidates','registration_status','UPDATE'),'ordinary examination registration status remains editable through RLS');
select ok(has_column_privilege('authenticated','public.examination_candidates','identity_verified','UPDATE'),'ordinary examination identity review remains editable through RLS');

-- Voluntary contributions remain separate from compulsory finance and are RPC-governed.
select has_table('public','voluntary_contribution_campaigns','voluntary contribution campaigns exist');
select has_table('public','voluntary_contribution_items','voluntary contribution items exist');
select has_table('public','learner_voluntary_contributions','learner contribution records exist');
select ok((select relrowsecurity from pg_class where oid='public.voluntary_contribution_campaigns'::regclass),'contribution campaigns use RLS');
select ok((select relrowsecurity from pg_class where oid='public.learner_voluntary_contributions'::regclass),'learner contributions use RLS');
select ok(to_regprocedure('public.create_voluntary_contribution_campaign(uuid,integer,text,text,date,date,boolean)') is not null,'contribution campaign creation RPC exists');
select ok(to_regprocedure('public.record_learner_voluntary_contribution(uuid,uuid,date,numeric,numeric,text,uuid)') is not null,'learner contribution recording RPC exists');
select ok(to_regprocedure('public.get_my_children_voluntary_contributions()') is not null,'guardian contribution overview RPC exists');
select ok(not has_function_privilege('anon','public.record_learner_voluntary_contribution(uuid,uuid,date,numeric,numeric,text,uuid)','EXECUTE'),'anonymous users cannot record learner contributions');
select ok(not has_function_privilege('anon','public.get_my_children_voluntary_contributions()','EXECUTE'),'anonymous users cannot read guardian contribution overview');
select ok(not has_table_privilege('authenticated','public.learner_voluntary_contributions','INSERT'),'authenticated clients cannot bypass contribution recording RPC');
select ok(not has_table_privilege('authenticated','public.learner_voluntary_contributions','UPDATE'),'authenticated clients cannot rewrite contribution records directly');

-- Guardian absence notices are evidence/review workflow, not direct attendance mutation.
select has_table('public','guardian_absence_notices','guardian absence notices exist');
select has_table('public','guardian_absence_notice_attachments','guardian absence attachments exist');
select ok((select relrowsecurity from pg_class where oid='public.guardian_absence_notices'::regclass),'guardian absence notices use RLS');
select ok((select relrowsecurity from pg_class where oid='public.guardian_absence_notice_attachments'::regclass),'guardian absence attachments use RLS');
select ok(to_regprocedure('public.submit_guardian_absence_notice(uuid,date,date,text,text)') is not null,'guardian absence submission RPC exists');
select ok(to_regprocedure('public.register_guardian_absence_attachment(uuid,text,text,text,bigint)') is not null,'guardian absence attachment RPC exists');
select ok(to_regprocedure('public.review_guardian_absence_notice(uuid,text,text)') is not null,'guardian absence review RPC exists');
select ok(not has_function_privilege('anon','public.submit_guardian_absence_notice(uuid,date,date,text,text)','EXECUTE'),'anonymous users cannot submit guardian absence notices');
select ok(not has_function_privilege('anon','public.review_guardian_absence_notice(uuid,text,text)','EXECUTE'),'anonymous users cannot review guardian absence notices');
select ok(not has_table_privilege('authenticated','public.guardian_absence_notices','INSERT'),'authenticated clients cannot forge absence notices directly');
select ok(not has_table_privilege('authenticated','public.guardian_absence_notices','UPDATE'),'authenticated clients cannot bypass absence review RPC');
select ok(exists(select 1 from storage.buckets where id='guardian-absence-evidence' and public=false),'guardian absence evidence bucket is private');

-- Detention operational queue and history remain distinct.
select has_view('public','late_detention_open_queue','open detention queue view exists');
select has_view('public','late_detention_history','detention history view exists');
select ok(has_table_privilege('authenticated','public.late_detention_open_queue','SELECT'),'authenticated users can read governed open detention queue');
select ok(has_table_privilege('authenticated','public.late_detention_history','SELECT'),'authenticated users can read governed detention history');
select ok(position('pending' in pg_get_viewdef('public.late_detention_open_queue'::regclass,true)) > 0 and position('carried_forward' in pg_get_viewdef('public.late_detention_open_queue'::regclass,true)) > 0,'open queue is restricted to unresolved detention states');
select ok(position('detention_session_items' in pg_get_viewdef('public.late_detention_history'::regclass,true)) > 0,'detention history preserves linked session outcomes');

select * from finish();
rollback;
