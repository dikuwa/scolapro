begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fc000000-0000-4000-8000-000000000001','next-term-admin@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status)
values('fc100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Year Boundary School','TST-NEXT-001','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000001','school_admin',current_date-1);

insert into public.learners(id,tenant_id,first_names,surname)
values('fc200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Future','Term');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,status)
values('fc300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000001','fc200000-0000-4000-8000-000000000001',2026,'NEXT-001','2026-01-01','current');

insert into public.academic_years(id,tenant_id,school_id,year,status,starts_on,ends_on) values
  ('fc400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000001',2026,'active','2026-01-12','2026-12-04'),
  ('fc400000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000001',2027,'setup','2027-01-11','2027-12-03'),
  ('fc400000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000001',2028,'setup','2028-01-10','2028-12-01');

insert into public.academic_terms(id,tenant_id,school_id,academic_year_id,term_number,display_name,starts_on,ends_on,status) values
  ('fc500000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000001','fc400000-0000-4000-8000-000000000001',1,'Term 1','2026-01-12','2026-04-24','closed'),
  ('fc500000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000001','fc400000-0000-4000-8000-000000000001',2,'Term 2','2026-05-18','2026-08-21','closed'),
  ('fc500000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000001','fc400000-0000-4000-8000-000000000002',1,'Term 1','2027-01-11','2027-04-23','setup'),
  ('fc500000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000001','fc400000-0000-4000-8000-000000000003',1,'Term 1','2028-01-10','2028-04-21','setup');

select is(
  app_private.resolve_report_card_future_term_start('fc100000-0000-4000-8000-000000000001',2026),
  '2027-01-11'::date,
  'future-term resolver chooses the earliest configured future academic year'
);

select is(
  app_private.resolve_report_card_future_term_start('fc100000-0000-4000-8000-000000000001',2027),
  '2028-01-10'::date,
  'future-term resolver advances correctly from a later academic year'
);

select is(
  app_private.resolve_report_card_future_term_start('fc100000-0000-4000-8000-000000000001',2028),
  null::date,
  'future-term resolver returns null when no later calendar is configured'
);

insert into public.report_card_snapshots(
  id,tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,
  template_version,snapshot_version,data_snapshot,status,generated_by_user_id
) values
  ('fc600000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000001','fc200000-0000-4000-8000-000000000001','fc300000-0000-4000-8000-000000000001',2026,1,'SCOLAPRO_TERM_REPORT_V1',2001,'{}'::jsonb,'draft','fc000000-0000-4000-8000-000000000001'),
  ('fc600000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000001','fc200000-0000-4000-8000-000000000001','fc300000-0000-4000-8000-000000000001',2026,2,'SCOLAPRO_TERM_REPORT_V1',2002,'{}'::jsonb,'draft','fc000000-0000-4000-8000-000000000001');

select is(
  (select data_snapshot ->> 'next_term_starts_on' from public.report_card_snapshots where id='fc600000-0000-4000-8000-000000000001'),
  '2026-05-18',
  'same-year template enrichment wins when a later term exists'
);

select is(
  (select data_snapshot ->> 'next_term_starts_on' from public.report_card_snapshots where id='fc600000-0000-4000-8000-000000000002'),
  '2027-01-11',
  'final-term snapshot freezes next academic year Term 1 start date'
);

select ok(
  exists(
    select 1 from pg_trigger
    where tgrelid='public.report_card_snapshots'::regclass
      and tgname='report_card_snapshot_year_boundary_next_term_enrichment_trg'
      and not tgisinternal
  ),
  'year-boundary next-term snapshot trigger is installed'
);

select ok(
  position('report_card_snapshot_template_profile_enrichment_trg' in string_agg(tgname,',' order by tgname))
    < position('report_card_snapshot_year_boundary_next_term_enrichment_trg' in string_agg(tgname,',' order by tgname))
  from pg_trigger
  where tgrelid='public.report_card_snapshots'::regclass and not tgisinternal,
  'year-boundary trigger sorts after template-profile enrichment so same-year dates are preserved'
);

select * from finish();
rollback;
