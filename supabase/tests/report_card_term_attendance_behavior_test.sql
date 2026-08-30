begin;

select plan(14);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fb000000-0000-4000-8000-000000000001','report-attendance-principal@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb000000-0000-4000-8000-000000000001','principal','2026-01-01');

insert into public.academic_years(id,tenant_id,school_id,year,status,starts_on,ends_on)
values('fb100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'active','2026-01-12','2026-12-04')
on conflict (school_id,year) do update
set starts_on=excluded.starts_on,ends_on=excluded.ends_on,status=excluded.status;

insert into public.academic_terms(tenant_id,school_id,academic_year_id,term_number,display_name,starts_on,ends_on,status)
select '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',ay.id,v.term_number,v.display_name,v.starts_on,v.ends_on,'active'
from public.academic_years ay
cross join (values
  (1::smallint,'Term 1'::text,'2026-01-12'::date,'2026-03-27'::date),
  (2::smallint,'Term 2'::text,'2026-05-18'::date,'2026-08-21'::date),
  (3::smallint,'Term 3'::text,'2026-09-07'::date,'2026-11-27'::date)
) v(term_number,display_name,starts_on,ends_on)
where ay.school_id='22222222-2222-4222-8222-222222222222' and ay.year=2026
on conflict (academic_year_id,term_number) do update
set display_name=excluded.display_name,starts_on=excluded.starts_on,ends_on=excluded.ends_on,status=excluded.status;

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values('fb200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','RPT-ATT','Report Attendance Fixture','active');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
values('fb300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'fb200000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',1,'active');

insert into public.official_results(
  id,tenant_id,school_id,academic_year,enrolment_id,learner_id,subject_offering_id,term_number,
  result_value,result_status,symbol,assessment_scheme_key,assessment_scheme_version,
  academic_rule_set_key,academic_rule_set_version,calculation_snapshot,approved_by_user_id,approved_at,locked_at
) values
  ('fb400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','fb300000-0000-4000-8000-000000000001',1,72,null,'B','TEST','v1','TEST_RULES','v1','{}','fb000000-0000-4000-8000-000000000001',now(),now()),
  ('fb400000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','fb300000-0000-4000-8000-000000000001',3,75,null,'B','TEST','v1','TEST_RULES','v1','{}','fb000000-0000-4000-8000-000000000001',now(),now());

insert into public.attendance_register_submissions(
  id,tenant_id,school_id,academic_year,register_class_id,attendance_date,default_status,recorded_by_user_id,recorded_at,source
) values
  ('fb500000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'40000000-0000-4000-8000-00000000001a','2026-01-09','present','fb000000-0000-4000-8000-000000000001',now(),'online'),
  ('fb500000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'40000000-0000-4000-8000-00000000001a','2026-02-02','present','fb000000-0000-4000-8000-000000000001',now(),'online'),
  ('fb500000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'40000000-0000-4000-8000-00000000001a','2026-02-03','present','fb000000-0000-4000-8000-000000000001',now(),'online'),
  ('fb500000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'40000000-0000-4000-8000-00000000001a','2026-07-10','present','fb000000-0000-4000-8000-000000000001',now(),'online'),
  ('fb500000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'40000000-0000-4000-8000-00000000001a','2026-09-10','present','fb000000-0000-4000-8000-000000000001',now(),'online'),
  ('fb500000-0000-4000-8000-000000000006','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'40000000-0000-4000-8000-00000000001a','2026-09-11','present','fb000000-0000-4000-8000-000000000001',now(),'online'),
  ('fb500000-0000-4000-8000-000000000007','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'40000000-0000-4000-8000-00000000001a','2026-12-01','present','fb000000-0000-4000-8000-000000000001',now(),'online');

insert into public.attendance_events(
  id,tenant_id,school_id,academic_year,learner_id,enrolment_id,register_class_id,attendance_date,
  status,recorded_by_user_id,recorded_at,source,register_submission_id
) values
  ('fb600000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','2026-02-03','late','fb000000-0000-4000-8000-000000000001',now(),'online','fb500000-0000-4000-8000-000000000003'),
  ('fb600000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','2026-09-10','excused','fb000000-0000-4000-8000-000000000001',now(),'online','fb500000-0000-4000-8000-000000000005'),
  ('fb600000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001a','2026-09-11','absent','fb000000-0000-4000-8000-000000000001',now(),'online','fb500000-0000-4000-8000-000000000006');

insert into public.year_end_progressions(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,source_grade_id,destination_grade_code,
  outcome,rule_set_key,rule_set_version,rationale,status,decided_by_user_id,decided_at,locked_at
) values(
  'fb700000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',2026,'30000000-0000-4000-8000-000000000010',
  '11','promoted','TEST_RULES','v1','{"reason":"fixture"}','approved','fb000000-0000-4000-8000-000000000001',now(),now()
);

select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

create temporary table report_attendance_snapshot_ids(term_number smallint primary key,snapshot_id uuid) on commit drop;
insert into report_attendance_snapshot_ids values
  (1,public.build_report_card_snapshot('60000000-0000-4000-8000-000000000001',1,'TEST_ATTENDANCE')),
  (3,public.build_report_card_snapshot('60000000-0000-4000-8000-000000000001',3,'TEST_ATTENDANCE'));

select is((select (s.data_snapshot#>>'{attendance,recorded_school_days}')::integer from public.report_card_snapshots s join report_attendance_snapshot_ids x on x.snapshot_id=s.id where x.term_number=1),2,'term 1 report counts only register days inside term 1 dates');
select is((select (s.data_snapshot#>>'{attendance,present}')::integer from public.report_card_snapshots s join report_attendance_snapshot_ids x on x.snapshot_id=s.id where x.term_number=1),1,'term 1 present count excludes a late exception and rows outside the term');
select is((select (s.data_snapshot#>>'{attendance,late}')::integer from public.report_card_snapshots s join report_attendance_snapshot_ids x on x.snapshot_id=s.id where x.term_number=1),1,'term 1 late attendance is represented explicitly');
select ok((select (s.data_snapshot#>>'{attendance,expected_school_days}')::integer > 2 from public.report_card_snapshots s join report_attendance_snapshot_ids x on x.snapshot_id=s.id where x.term_number=1),'expected term school days are derived from the school calendar rather than recorded rows alone');
select is((select (s.data_snapshot#>>'{attendance,register_coverage_complete}')::boolean from public.report_card_snapshots s join report_attendance_snapshot_ids x on x.snapshot_id=s.id where x.term_number=1),false,'partial register coverage remains explicitly incomplete');
select is((select s.data_snapshot->'year_end_progression' from public.report_card_snapshots s join report_attendance_snapshot_ids x on x.snapshot_id=s.id where x.term_number=1),'null'::jsonb,'non-final term report does not expose a year-end progression decision');
select is((select (s.data_snapshot#>>'{term,is_final_term}')::boolean from public.report_card_snapshots s join report_attendance_snapshot_ids x on x.snapshot_id=s.id where x.term_number=1),false,'term 1 snapshot is not marked final when later configured terms exist');
select is((select (s.data_snapshot#>>'{attendance,recorded_school_days}')::integer from public.report_card_snapshots s join report_attendance_snapshot_ids x on x.snapshot_id=s.id where x.term_number=3),2,'final-term report remains term-bounded instead of silently becoming cumulative annual attendance');
select is((select (s.data_snapshot#>>'{attendance,excused}')::integer from public.report_card_snapshots s join report_attendance_snapshot_ids x on x.snapshot_id=s.id where x.term_number=3),1,'final-term report preserves excused attendance semantics');
select is((select (s.data_snapshot#>>'{attendance,absent}')::integer from public.report_card_snapshots s join report_attendance_snapshot_ids x on x.snapshot_id=s.id where x.term_number=3),1,'final-term report preserves absent attendance semantics');
select is((select (s.data_snapshot#>>'{attendance,present}')::integer from public.report_card_snapshots s join report_attendance_snapshot_ids x on x.snapshot_id=s.id where x.term_number=3),0,'attendance exceptions override the register default status in final-term reporting');
select is((select (s.data_snapshot#>>'{term,is_final_term}')::boolean from public.report_card_snapshots s join report_attendance_snapshot_ids x on x.snapshot_id=s.id where x.term_number=3),true,'highest configured term is marked as the final term');
select is((select s.data_snapshot#>>'{year_end_progression,outcome}' from public.report_card_snapshots s join report_attendance_snapshot_ids x on x.snapshot_id=s.id where x.term_number=3),'promoted','final-term snapshot includes the learner year-end progression outcome');
select is((select s.data_snapshot#>>'{year_end_progression,status}' from public.report_card_snapshots s join report_attendance_snapshot_ids x on x.snapshot_id=s.id where x.term_number=3),'approved','final-term snapshot preserves progression approval status for certification governance');

select * from finish();
rollback;
