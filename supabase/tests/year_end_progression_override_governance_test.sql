begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fc000000-0000-4000-8000-000000000001','progression-override-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.promotion_rule_sets(
  id,tenant_id,school_id,academic_year,grade_id,rule_set_key,version,result_term_number,
  pass_outcome,fail_outcome,source_reference,effective_from,status,created_by_user_id
)
values(
  'fc100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  2026,'30000000-0000-4000-8000-000000000010','TEST-OVERRIDE','1',3,'promoted','not_promoted',
  'Behavioral test only — not Namibia policy',current_date-30,'active','fc000000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$select public.generate_year_end_progression('60000000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001')$$,
  'promotion engine creates a reviewed recommendation'
);

select is(
  (select recommended_outcome from public.year_end_progressions where enrolment_id='60000000-0000-4000-8000-000000000001'),
  (select outcome from public.year_end_progressions where enrolment_id='60000000-0000-4000-8000-000000000001'),
  'engine recommendation is stored separately from the working outcome'
);

select throws_ok(
  $$update public.year_end_progressions set outcome='promoted' where enrolment_id='60000000-0000-4000-8000-000000000001'$$,
  'A reason is required when overriding the promotion recommendation',
  'manual outcome change without a reason is rejected'
);

select lives_ok(
  $$select public.override_year_end_progression((select id from public.year_end_progressions where enrolment_id='60000000-0000-4000-8000-000000000001'),'promoted','Authorized exception after review','G11')$$,
  'authorized reviewer can record an explicit override with reason'
);

select is(
  (select override_reason from public.year_end_progressions where enrolment_id='60000000-0000-4000-8000-000000000001'),
  'Authorized exception after review',
  'override reason is preserved'
);

select is(
  (select overridden_by_user_id::text from public.year_end_progressions where enrolment_id='60000000-0000-4000-8000-000000000001'),
  'fc000000-0000-4000-8000-000000000001',
  'override actor is recorded from the authenticated user'
);

select ok(
  (select overridden_at is not null from public.year_end_progressions where enrolment_id='60000000-0000-4000-8000-000000000001'),
  'override timestamp is recorded'
);

select lives_ok(
  $$select public.approve_year_end_progression((select id from public.year_end_progressions where enrolment_id='60000000-0000-4000-8000-000000000001'))$$,
  'principal-level approval accepts a fully-provenanced override'
);

select throws_ok(
  $$update public.year_end_progressions set override_reason='rewritten' where enrolment_id='60000000-0000-4000-8000-000000000001'$$,
  'Approved progression decisions may only transition to locked',
  'approved override provenance remains immutable'
);

select * from finish();
rollback;
