begin;

select plan(13);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fa000000-0000-4000-8000-000000000001','scope-boundary-admin@example.test','authenticated','authenticated',now(),now()),
  ('fa000000-0000-4000-8000-000000000002','scope-boundary-teacher@example.test','authenticated','authenticated',now(),now()),
  ('fa000000-0000-4000-8000-000000000003','scope-boundary-parent@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa000000-0000-4000-8000-000000000001','school_admin',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa000000-0000-4000-8000-000000000002','teacher',current_date);

create temporary table qa_scope_learners(id uuid primary key) on commit drop;
insert into qa_scope_learners(id)
select gen_random_uuid() from generate_series(1,101);

insert into public.learners(id,tenant_id,first_names,surname)
select id,'11111111-1111-4111-8111-111111111111','Ceiling','Learner'
from qa_scope_learners;

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,status
)
select
  gen_random_uuid(),
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  id,
  2026,
  'CEILING-' || row_number() over(order by id),
  '2026-01-01',
  'current'
from qa_scope_learners;

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok(
  $$select public.create_report_card_batch_for_scope('22222222-2222-4222-8222-222222222222',2026,1,'school',null,'generate')$$,
  'Permission denied',
  'teacher cannot create a server-resolved management report-card batch'
);
reset role;

select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  $$select public.create_report_card_batch_for_scope('22222222-2222-4222-8222-222222222222',2026,1,'school',null,'generate')$$,
  'Permission denied',
  'parent cannot create a server-resolved management report-card batch'
);
select throws_ok(
  $$select * from public.list_report_card_status_page('22222222-2222-4222-8222-222222222222',2026,1,null,null,null,'all',1,50)$$,
  'Permission denied',
  'unrelated parent cannot enumerate a school report-card roster through the paged read model'
);
reset role;

select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
set local role authenticated;

select throws_ok(
  $$select public.create_report_card_batch_for_scope('22222222-2222-4222-8222-222222222222',1999,1,'school',null,'generate')$$,
  'Academic year is invalid',
  'server-resolved batch rejects an invalid academic year'
);
select throws_ok(
  $$select public.create_report_card_batch_for_scope('22222222-2222-4222-8222-222222222222',2026,7,'school',null,'generate')$$,
  'Term number is invalid',
  'server-resolved batch rejects an invalid term number'
);
select throws_ok(
  $$select public.create_report_card_batch_for_scope('22222222-2222-4222-8222-222222222222',2026,1,'school',null,'delete')$$,
  'Unsupported report-card batch operation',
  'server-resolved batch rejects unsupported operations'
);
select throws_ok(
  $$select public.create_report_card_batch_for_scope('22222222-2222-4222-8222-222222222222',2026,1,'school','fa100000-0000-4000-8000-000000000001','generate')$$,
  'Whole-school scope does not accept a scope identifier',
  'whole-school batch rejects a supplied scope identifier'
);
select throws_ok(
  $$select public.create_report_card_batch_for_scope('22222222-2222-4222-8222-222222222222',2026,1,'grade',null,'generate')$$,
  'Grade scope requires a grade identifier',
  'grade batch requires an explicit grade identifier'
);
select throws_ok(
  $$select public.create_report_card_batch_for_scope('22222222-2222-4222-8222-222222222222',2026,1,'class',null,'generate')$$,
  'Class scope requires a register-class identifier',
  'class batch requires an explicit register-class identifier'
);
select throws_ok(
  $$select * from public.get_report_card_scope_summary('22222222-2222-4222-8222-222222222222',2026,1,'custom',null)$$,
  'Report-card summaries support school, grade or class scope only',
  'management summary rejects unsupported custom scope'
);
select throws_ok(
  $$select * from public.list_report_card_status_page('22222222-2222-4222-8222-222222222222',2026,1,null,null,null,'invalid-status',1,50)$$,
  'Unsupported report-card status filter',
  'paged status read rejects an unsupported report status'
);
select is(
  (select count(*)::integer
   from public.list_report_card_status_page(
     '22222222-2222-4222-8222-222222222222',2026,1,'Ceiling',null,null,'all',1,500
   )),
  100,
  'paged report-card status caps oversized client page requests at 100 rows'
);
select is(
  (select total_count::integer
   from public.list_report_card_status_page(
     '22222222-2222-4222-8222-222222222222',2026,1,'Ceiling',null,null,'all',1,500
   ) limit 1),
  101,
  'paged report-card status still returns the complete filtered total while capping rows'
);

reset role;

select * from finish();
rollback;
