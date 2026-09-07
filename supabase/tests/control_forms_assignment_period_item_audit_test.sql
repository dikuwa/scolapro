begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fd000000-0000-4000-8000-000000000001','n20-period-admin@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status) values
('fd100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','N20-CYCLE-FULL','Full','Coverage','active'),
('fd100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','N20-CYCLE-LATE','Late','Start','active'),
('fd100000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','N20-CYCLE-EARLY','Early','End','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd000000-0000-4000-8000-000000000001','school_admin','2026-01-01');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,position_title,effective_from,effective_to,created_by_user_id
) values
('fd200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd100000-0000-4000-8000-000000000001','management','Full-cycle responsible','2026-01-01','2026-12-31','fd000000-0000-4000-8000-000000000001'),
('fd200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd100000-0000-4000-8000-000000000002','management','Starts too late','2026-04-01','2026-12-31','fd000000-0000-4000-8000-000000000001'),
('fd200000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd100000-0000-4000-8000-000000000003','management','Ends too early','2026-01-01','2026-05-31','fd000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.create_control_template_version('22222222-2222-4222-8222-222222222222','period-audit','Period + Audit Control','2026-01-01')$$,
  'school leadership creates control template for assignment-period test'
);

select lives_ok(
  $$select public.add_control_template_item((select id from public.control_template where template_key='period-audit'),'proof','Traceable requirement',1,'Retain evidence',true,true)$$,
  'template item creation succeeds through governed RPC'
);

select is(
  (select count(*)::integer from public.audit_events ae
   join public.control_template_item i on i.id=ae.entity_id
   join public.control_template t on t.id=i.control_template_id
   where t.template_key='period-audit'
     and ae.event_type='control.template.item_created'
     and ae.entity_type='control_template_item'),
  1,
  'template item creation emits one canonical audit event'
);

select ok(
  exists(
    select 1
    from public.audit_events ae
    join public.control_template_item i on i.id=ae.entity_id
    join public.control_template t on t.id=i.control_template_id
    where t.template_key='period-audit'
      and ae.event_type='control.template.item_created'
      and ae.actor_user_id='fd000000-0000-4000-8000-000000000001'
      and ae.metadata->>'item_key'='proof'
      and ae.metadata->>'template_key'='period-audit'
      and ae.metadata->>'version_no'='1'
  ),
  'template item audit preserves actor and version/item provenance'
);

select lives_ok(
  $$select public.publish_control_template((select id from public.control_template where template_key='period-audit'),'2026-12-31')$$,
  'template publishes after traceable item creation'
);

select lives_ok(
  $$select public.create_control_cycle((select id from public.control_template where template_key='period-audit'),'PERIOD-OK','2026-03-01','2026-06-30','fd200000-0000-4000-8000-000000000001')$$,
  'responsible assignment covering full cycle period is accepted'
);

select throws_ok(
  $$select public.create_control_cycle((select id from public.control_template where template_key='period-audit'),'PERIOD-LATE','2026-03-01','2026-06-30','fd200000-0000-4000-8000-000000000002')$$,
  'Responsible staff assignment must be effective for the full control cycle period',
  'responsible assignment starting after cycle start is rejected'
);

select throws_ok(
  $$select public.create_control_cycle((select id from public.control_template where template_key='period-audit'),'PERIOD-EARLY','2026-03-01','2026-06-30','fd200000-0000-4000-8000-000000000003')$$,
  'Responsible staff assignment must be effective for the full control cycle period',
  'responsible assignment ending before cycle end is rejected'
);

select * from finish();
rollback;