begin;

select plan(23);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fd000000-0000-4000-8000-000000000001','n20-admin@example.test','authenticated','authenticated',now(),now()),
('fd000000-0000-4000-8000-000000000002','n20-hod@example.test','authenticated','authenticated',now(),now()),
('fd000000-0000-4000-8000-000000000003','n20-other@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values('fd100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','N20 Other School','N20-OTHER','Erongo','Walvis Bay','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd000000-0000-4000-8000-000000000001','school_admin','2026-01-01'),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd000000-0000-4000-8000-000000000002','hod','2026-01-01'),
('11111111-1111-4111-8111-111111111111','fd100000-0000-4000-8000-000000000002','fd000000-0000-4000-8000-000000000003','school_admin','2026-01-01');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.create_control_template_version('22222222-2222-4222-8222-222222222222','department-monthly','Monthly Departmental Report Preparation Control Form','2026-01-01',null)$$,
  'school leadership can create version 1 of a configurable control template'
);

select lives_ok(
  $$select public.add_control_template_item((select id from public.control_template where template_key='department-monthly' and version_no=1),'written-work','Control of learners written work',1,'Attach governed evidence',true,true)$$,
  'draft version accepts configurable checklist items rather than hard-coded form columns'
);

select lives_ok(
  $$select public.publish_control_template((select id from public.control_template where template_key='department-monthly' and version_no=1),'2026-06-30')$$,
  'version 1 can be published with an effective period'
);

select throws_ok(
  $$select public.add_control_template_item((select id from public.control_template where template_key='department-monthly' and version_no=1),'late-edit','Late edit',2)$$,
  'Published control template versions are immutable',
  'published template items cannot be changed by app workflow'
);

select lives_ok(
  $$select public.create_control_cycle((select id from public.control_template where template_key='department-monthly' and version_no=1),'2026-T1-DEPT','2026-01-01','2026-03-31',null)$$,
  'cycle can be created from a published template version'
);

select is(
  (select count(*)::integer from public.control_teacher_item cti join public.control_cycle cc on cc.id=cti.control_cycle_id where cc.cycle_key='2026-T1-DEPT'),
  1,
  'cycle materializes the exact frozen version item set'
);

select throws_ok(
  $$select public.record_control_item((select cti.id from public.control_teacher_item cti join public.control_cycle cc on cc.id=cti.control_cycle_id where cc.cycle_key='2026-T1-DEPT'),'complete','checked',null,null)$$,
  'Evidence is required for this control item',
  'item evidence requirement is enforced'
);

select lives_ok(
  $$select public.record_control_item((select cti.id from public.control_teacher_item cti join public.control_cycle cc on cc.id=cti.control_cycle_id where cc.cycle_key='2026-T1-DEPT'),'complete','checked','record','school-register:2026-t1')$$,
  'item completion accepts governed evidence reference'
);

select is(
  (select count(*)::integer from public.evidence_reference where reference_value='school-register:2026-t1'),
  1,
  'evidence is stored as a governed reference rather than copied source facts'
);

select ok(
  exists(select 1 from public.audit_events where event_type='control.item.recorded' and school_id='22222222-2222-4222-8222-222222222222'),
  'item completion writes audit provenance'
);

select lives_ok(
  $$select public.complete_control_cycle((select id from public.control_cycle where cycle_key='2026-T1-DEPT'))$$,
  'fully recorded cycle can be completed'
);

select is(
  (select status from public.control_cycle where cycle_key='2026-T1-DEPT'),
  'completed',
  'cycle completion state is persisted'
);

select throws_ok(
  $$select public.record_control_item((select cti.id from public.control_teacher_item cti join public.control_cycle cc on cc.id=cti.control_cycle_id where cc.cycle_key='2026-T1-DEPT'),'complete','rewrite','note','rewrite')$$,
  'Completed control cycles are immutable',
  'later item edits cannot alter a completed cycle'
);

select lives_ok(
  $$select public.create_control_template_version('22222222-2222-4222-8222-222222222222','department-monthly','Monthly Departmental Report Preparation Control Form','2026-07-01',(select id from public.control_template where template_key='department-monthly' and version_no=1))$$,
  'successor version can begin after predecessor effective period'
);

select is(
  (select version_no from public.control_template where template_key='department-monthly' and effective_from='2026-07-01'),
  2,
  'successor version number is reproducible and increments exactly once'
);

select is(
  (select ct.version_no from public.control_cycle cc join public.control_template ct on ct.id=cc.control_template_id where cc.cycle_key='2026-T1-DEPT'),
  1,
  'existing cycle remains bound to version 1 after version 2 is created'
);

select is(
  (select cti.label from public.control_cycle cc join public.control_teacher_item x on x.control_cycle_id=cc.id join public.control_template_item cti on cti.id=x.control_template_item_id where cc.cycle_key='2026-T1-DEPT'),
  'Control of learners written work',
  'historical cycle resolves its original item definition unchanged'
);

select lives_ok(
  $$select public.review_control_cycle((select id from public.control_cycle where cycle_key='2026-T1-DEPT'),'HOD certified')$$,
  'completed cycle can be reviewed and certified'
);

select ok(
  exists(select 1 from public.audit_events where event_type='control.cycle.reviewed' and school_id='22222222-2222-4222-8222-222222222222'),
  'cycle review writes audit provenance'
);

select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000003',true);

select is(
  (select count(*)::integer from public.control_cycle),
  0,
  'other-school leadership cannot enumerate control cycles through RLS'
);

select is(
  (select count(*)::integer from public.control_template),
  0,
  'other-school leadership cannot enumerate template versions through RLS'
);

select throws_ok(
  $$select public.create_control_cycle((select id from public.control_template where template_key='department-monthly' limit 1),'cross-school','2026-01-01','2026-01-31',null)$$,
  'Control template not found',
  'cross-school RLS prevents template discovery inside unauthorized workflow input'
);

select ok(
  not has_function_privilege('anon','public.create_control_cycle(uuid,text,date,date,uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.create_control_cycle(uuid,text,date,date,uuid)','EXECUTE')
  and not has_table_privilege('authenticated','public.control_cycle','INSERT'),
  'anonymous execution and direct authenticated writes are denied; mutations use governed functions'
);

select * from finish();
rollback;