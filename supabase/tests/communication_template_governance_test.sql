begin;

select plan(19);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fd500000-0000-4000-8000-000000000001','template-admin@example.test','authenticated','authenticated',now(),now()),
  ('fd500000-0000-4000-8000-000000000002','template-teacher@example.test','authenticated','authenticated',now(),now()),
  ('fd500000-0000-4000-8000-000000000003','template-other-admin@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,status) values
  ('fd510000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Template Other School','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd500000-0000-4000-8000-000000000001','school_admin',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd500000-0000-4000-8000-000000000002','teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','fd510000-0000-4000-8000-000000000001','fd500000-0000-4000-8000-000000000003','school_admin',current_date);

select ok(not has_table_privilege('authenticated','public.communication_templates','INSERT'),'authenticated clients cannot insert communication templates directly');
select ok(not has_table_privilege('authenticated','public.communication_template_versions','UPDATE'),'authenticated clients cannot mutate template versions directly');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd500000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.create_communication_template('22222222-2222-4222-8222-222222222222','whatsapp','attendance.absence','Attendance absence','Approved parent absence notice')$$,
  'school administrator creates a governed WhatsApp template'
);

select set_config('request.jwt.claim.sub','fd500000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select public.create_communication_template('22222222-2222-4222-8222-222222222222','whatsapp','teacher.unauthorized','Nope',null)$$,
  'Permission denied',
  'ordinary teacher cannot administer communication templates'
);

select set_config('request.jwt.claim.sub','fd500000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$select public.create_communication_template('22222222-2222-4222-8222-222222222222','whatsapp','cross.school','Nope',null)$$,
  'Permission denied',
  'administrator of another school cannot administer this school templates'
);

select set_config('request.jwt.claim.sub','fd500000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.add_communication_template_version(
      (select id from public.communication_templates where school_id='22222222-2222-4222-8222-222222222222' and template_key='attendance.absence'),
      1,'en','{{learner_name}} was absent on {{date}}',
      '[{"key":"learner_name","required":true},{"key":"learner_name","required":true}]'::jsonb
    )$$,
  'Template variable keys must be unique',
  'duplicate declared template variable keys are rejected'
);

select lives_ok(
  $$select public.add_communication_template_version(
      (select id from public.communication_templates where school_id='22222222-2222-4222-8222-222222222222' and template_key='attendance.absence'),
      1,'en','{{learner_name}} was absent on {{date}}',
      '[{"key":"learner_name","required":true},{"key":"date","required":true},{"key":"reason","required":false}]'::jsonb
    )$$,
  'valid declared-variable template version is created'
);

select throws_ok(
  $$select public.set_communication_provider_template_binding(
      (select v.id from public.communication_template_versions v join public.communication_templates t on t.id=v.template_id where t.template_key='attendance.absence'),
      'bird_whatsapp','attendance_absence','en','approved',true,'{}'::jsonb
    )$$,
  'Approve the ScolaPro template version before approving a provider binding',
  'provider binding cannot be approved before the ScolaPro template version'
);

select lives_ok(
  $$select public.approve_communication_template_version(
      (select v.id from public.communication_template_versions v join public.communication_templates t on t.id=v.template_id where t.template_key='attendance.absence')
    )$$,
  'school administrator approves the reviewed template version'
);

select throws_ok(
  $$select public.set_communication_provider_template_binding(
      (select v.id from public.communication_template_versions v join public.communication_templates t on t.id=v.template_id where t.template_key='attendance.absence'),
      'bird_whatsapp','attendance_absence','en','approved',true,'{"api_key":"must-not-persist"}'::jsonb
    )$$,
  'Provider template config must not contain credentials or secret-bearing keys',
  'provider template binding rejects credential-bearing configuration'
);

select lives_ok(
  $$select public.set_communication_provider_template_binding(
      (select v.id from public.communication_template_versions v join public.communication_templates t on t.id=v.template_id where t.template_key='attendance.absence'),
      'bird_whatsapp','attendance_absence','en','approved',true,'{"component_style":"named"}'::jsonb
    )$$,
  'approved secret-free provider binding is accepted'
);

insert into public.communication_messages(
  id,tenant_id,school_id,channel,subject,body,audience_type,status,sensitive,created_by_user_id,template_version_id,template_parameters
) values
  ('fd520000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','whatsapp',null,'No template','individual','draft',false,'fd500000-0000-4000-8000-000000000001',null,'{}'),
  ('fd520000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','whatsapp',null,'Template no route','individual','draft',false,'fd500000-0000-4000-8000-000000000001',(select v.id from public.communication_template_versions v join public.communication_templates t on t.id=v.template_id where t.template_key='attendance.absence'),' {"learner_name":"Sam","date":"2026-08-31"}'),
  ('fd520000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','whatsapp',null,'Missing parameter','individual','draft',false,'fd500000-0000-4000-8000-000000000001',(select v.id from public.communication_template_versions v join public.communication_templates t on t.id=v.template_id where t.template_key='attendance.absence'),' {"learner_name":"Sam"}'),
  ('fd520000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','whatsapp',null,'Unexpected parameter','individual','draft',false,'fd500000-0000-4000-8000-000000000001',(select v.id from public.communication_template_versions v join public.communication_templates t on t.id=v.template_id where t.template_key='attendance.absence'),' {"learner_name":"Sam","date":"2026-08-31","unknown":"x"}'),
  ('fd520000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','whatsapp',null,'Valid template','individual','draft',false,'fd500000-0000-4000-8000-000000000001',(select v.id from public.communication_template_versions v join public.communication_templates t on t.id=v.template_id where t.template_key='attendance.absence'),' {"learner_name":"Sam","date":"2026-08-31","reason":"Illness"}');

insert into public.communication_recipients(id,tenant_id,school_id,message_id,destination)
select gen_random_uuid(),'11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',m.id,'+264811234567'
from public.communication_messages m
where m.id in (
  'fd520000-0000-4000-8000-000000000001','fd520000-0000-4000-8000-000000000002','fd520000-0000-4000-8000-000000000003','fd520000-0000-4000-8000-000000000004','fd520000-0000-4000-8000-000000000005'
);

select throws_ok(
  $$select public.queue_communication('fd520000-0000-4000-8000-000000000001')$$,
  'WhatsApp communications require an approved template version',
  'WhatsApp message without a template cannot enter the outbox'
);

select throws_ok(
  $$select public.queue_communication('fd520000-0000-4000-8000-000000000002')$$,
  'No active WhatsApp provider route is configured',
  'approved template cannot queue without an active WhatsApp provider route'
);

select throws_ok(
  $$select public.queue_communication('fd520000-0000-4000-8000-000000000003')$$,
  'Missing required template parameter: date',
  'missing required template parameter blocks queueing'
);

select throws_ok(
  $$select public.queue_communication('fd520000-0000-4000-8000-000000000004')$$,
  'Unexpected template parameter: unknown',
  'undeclared template parameter blocks queueing'
);

select lives_ok(
  $$select public.set_communication_provider_route(
      '11111111-1111-4111-8111-111111111111'::uuid,
      '22222222-2222-4222-8222-222222222222'::uuid,
      'whatsapp'::text,
      'bird_whatsapp'::text,
      100::smallint,
      true,
      current_date,
      null::date,
      '{}'::jsonb
    )$$,
  'school administrator configures the WhatsApp provider route without credentials'
);

select is(
  public.queue_communication('fd520000-0000-4000-8000-000000000005'),
  true,
  'approved template, valid parameters, provider route and approved binding allow queueing'
);

select is(
  (select count(*)::integer from public.communication_delivery_jobs where message_id='fd520000-0000-4000-8000-000000000005' and status='pending'),
  1,
  'valid WhatsApp communication creates exactly one durable delivery job'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','fd500000-0000-4000-8000-000000000003',true);
select is(
  (select count(*)::integer from public.communication_templates where school_id='22222222-2222-4222-8222-222222222222'),
  0,
  'RLS prevents another-school administrator from reading this school template registry'
);
reset role;

select * from finish();
rollback;
