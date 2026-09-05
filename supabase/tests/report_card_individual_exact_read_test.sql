begin;

select plan(6);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('ed000000-0000-4000-8000-000000000001','individual-admin@example.test','authenticated','authenticated',now(),now()),
  ('ed000000-0000-4000-8000-000000000002','individual-teacher@example.test','authenticated','authenticated',now(),now()),
  ('ed000000-0000-4000-8000-000000000003','individual-support@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status)
values('ed100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Individual Read School','TST-RPT-IND-001','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','ed100000-0000-4000-8000-000000000001','ed000000-0000-4000-8000-000000000001','school_admin',current_date),
  ('11111111-1111-4111-8111-111111111111','ed100000-0000-4000-8000-000000000001','ed000000-0000-4000-8000-000000000002','teacher',current_date);

insert into public.platform_memberships(user_id,role_key,active_from)
values('ed000000-0000-4000-8000-000000000003','platform_support',current_date);

insert into public.learners(id,tenant_id,first_names,surname) values
  ('ed200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Same','Name'),
  ('ed200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Same','Name');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,status) values
  ('ed300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ed100000-0000-4000-8000-000000000001','ed200000-0000-4000-8000-000000000001',2026,null,'2026-01-01','current'),
  ('ed300000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ed100000-0000-4000-8000-000000000001','ed200000-0000-4000-8000-000000000002',2026,null,'2026-01-01','current');

select ok(
  not has_function_privilege('anon','public.get_report_card_status_for_enrolment(uuid,integer,integer,uuid)','EXECUTE'),
  'anonymous users cannot execute the exact individual report-card read'
);
select ok(
  has_function_privilege('authenticated','public.get_report_card_status_for_enrolment(uuid,integer,integer,uuid)','EXECUTE'),
  'authenticated callers enter through the self-authorizing exact read'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ed000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(
  (select enrolment_id from public.get_report_card_status_for_enrolment('ed100000-0000-4000-8000-000000000001',2026,1,'ed300000-0000-4000-8000-000000000002') limit 1),
  'ed300000-0000-4000-8000-000000000002'::uuid,
  'exact read resolves the requested enrolment even when learner names are identical'
);
select is(
  (select report_status from public.get_report_card_status_for_enrolment('ed100000-0000-4000-8000-000000000001',2026,1,'ed300000-0000-4000-8000-000000000002') limit 1),
  'not_generated'::text,
  'exact read keeps the paged roster report-status semantics'
);
select is(
  (select count(*)::integer from public.get_report_card_status_for_enrolment('ed100000-0000-4000-8000-000000000001',2026,1,'ed300000-0000-4000-8000-000000000099')),
  0,
  'unknown or unrelated enrolment identifiers do not fall back to fuzzy learner matching'
);
reset role;

select set_config('request.jwt.claim.sub','ed000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  $$select * from public.get_report_card_status_for_enrolment('ed100000-0000-4000-8000-000000000001',2026,1,'ed300000-0000-4000-8000-000000000001')$$,
  'Permission denied',
  'platform support cannot enumerate learner report status through the exact read'
);
reset role;

select * from finish();
rollback;
