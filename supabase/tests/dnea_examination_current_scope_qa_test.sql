begin;

select plan(10);

insert into public.tenants(id,name,slug) values
('d5200000-0000-4000-8000-000000000001','DNEA Live QA','dnea-live-qa');

insert into public.schools(id,tenant_id,name,status) values
('d5210000-0000-4000-8000-000000000001','d5200000-0000-4000-8000-000000000001','DNEA Old School','active'),
('d5210000-0000-4000-8000-000000000002','d5200000-0000-4000-8000-000000000001','DNEA Current School','active');

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('d5220000-0000-4000-8000-000000000001','dnea-multi@example.test','authenticated','authenticated',now(),now()),
('d5220000-0000-4000-8000-000000000002','dnea-support@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('d5200000-0000-4000-8000-000000000001','d5210000-0000-4000-8000-000000000001','d5220000-0000-4000-8000-000000000001','exam_officer',current_date-30),
('d5200000-0000-4000-8000-000000000001','d5210000-0000-4000-8000-000000000002','d5220000-0000-4000-8000-000000000001','exam_officer',current_date-1);

insert into public.platform_memberships(user_id,role_key,active_from)
values('d5220000-0000-4000-8000-000000000002','platform_support',current_date);

insert into public.learners(id,tenant_id,first_names,surname) values
('d5230000-0000-4000-8000-000000000001','d5200000-0000-4000-8000-000000000001','Current','Candidate'),
('d5230000-0000-4000-8000-000000000002','d5200000-0000-4000-8000-000000000001','Historical','Candidate');

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,enrolled_from,enrolled_to,status
) values
('d5240000-0000-4000-8000-000000000001','d5200000-0000-4000-8000-000000000001','d5210000-0000-4000-8000-000000000002','d5230000-0000-4000-8000-000000000001',2026,current_date-60,null,'current'),
('d5240000-0000-4000-8000-000000000002','d5200000-0000-4000-8000-000000000001','d5210000-0000-4000-8000-000000000002','d5230000-0000-4000-8000-000000000002',2026,current_date-60,current_date-1,'transferred');

insert into public.examination_cycles(
  id,tenant_id,school_id,academic_year,cycle_key,display_name,status
) values
('d5250000-0000-4000-8000-000000000001','d5200000-0000-4000-8000-000000000001','d5210000-0000-4000-8000-000000000002',2026,'LIVE-QA','Live QA cycle','open');

insert into public.examination_candidates(
  id,tenant_id,school_id,examination_cycle_id,learner_id,enrolment_id,created_by_user_id
) values
('d5260000-0000-4000-8000-000000000001','d5200000-0000-4000-8000-000000000001','d5210000-0000-4000-8000-000000000002','d5250000-0000-4000-8000-000000000001','d5230000-0000-4000-8000-000000000001','d5240000-0000-4000-8000-000000000001','d5220000-0000-4000-8000-000000000001'),
('d5260000-0000-4000-8000-000000000002','d5200000-0000-4000-8000-000000000001','d5210000-0000-4000-8000-000000000002','d5250000-0000-4000-8000-000000000001','d5230000-0000-4000-8000-000000000002','d5240000-0000-4000-8000-000000000002','d5220000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d5220000-0000-4000-8000-000000000001',true);

select is(app_private.can_manage_examinations('d5210000-0000-4000-8000-000000000001'),false,'older active school membership is not current examination authority');
select is(app_private.can_manage_examinations('d5210000-0000-4000-8000-000000000002'),true,'newest active school membership is current examination authority');
select is(app_private.can_manage_n12_examinations('d5210000-0000-4000-8000-000000000001'),false,'N12 cannot target an older non-current school');
select is(app_private.can_manage_n12_examinations('d5210000-0000-4000-8000-000000000002'),true,'N12 remains available in the current school');
select is(app_private.can_manage_examination_access_n10('d5210000-0000-4000-8000-000000000001'),false,'restricted N10 access cannot target an older non-current school');
select is(app_private.can_manage_examination_access_n10('d5210000-0000-4000-8000-000000000002'),true,'restricted N10 access remains available in the current school');

select lives_ok(
  $$select public.assign_examination_candidate_number('d5260000-0000-4000-8000-000000000001','QA-CUR-001',null,'dnea_official','fixture only')$$,
  'candidate-number authority works for a current effective enrolment'
);

select throws_ok(
  $$select public.assign_examination_candidate_number('d5260000-0000-4000-8000-000000000002','QA-HIST-001',null,'dnea_official','fixture only')$$,
  'Candidate operation requires a current effective enrolment',
  'candidate-number mutation is denied after the candidate enrolment has ended'
);

select set_config('request.jwt.claim.sub','d5220000-0000-4000-8000-000000000002',true);
select is(app_private.can_manage_n12_examinations('d5210000-0000-4000-8000-000000000002'),false,'Platform Support has no N12 school examination authority');
select is(app_private.can_manage_examination_access_n10('d5210000-0000-4000-8000-000000000002'),false,'Platform Support has no restricted N10 examination-access authority');

select * from finish();
rollback;
