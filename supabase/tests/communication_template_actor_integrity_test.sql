begin;

select plan(11);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('cb100000-0000-4000-8000-000000000001','template-actor-manager@example.test','authenticated','authenticated',now(),now()),
  ('cb100000-0000-4000-8000-000000000002','template-actor-unrelated@example.test','authenticated','authenticated',now(),now()),
  ('cb100000-0000-4000-8000-000000000003','template-actor-expired@example.test','authenticated','authenticated',now(),now()),
  ('cb100000-0000-4000-8000-000000000004','template-actor-platform@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from,active_to)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','cb100000-0000-4000-8000-000000000001','school_admin',current_date-5,null),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','cb100000-0000-4000-8000-000000000003','principal',current_date-10,current_date-1);

insert into public.platform_memberships(user_id,role_key,active_from,active_to)
values('cb100000-0000-4000-8000-000000000004','platform_admin',current_date-5,null);

select throws_ok(
  $$insert into public.communication_templates(tenant_id,school_id,template_key,channel,name,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','actor.unrelated','email','Unrelated','cb100000-0000-4000-8000-000000000002')$$,
  'Communication template creator is not authorized for school',
  'unrelated account cannot be forged as a communication-template creator'
);

select throws_ok(
  $$insert into public.communication_templates(tenant_id,school_id,template_key,channel,name,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','actor.expired','email','Expired','cb100000-0000-4000-8000-000000000003')$$,
  'Communication template creator is not authorized for school',
  'expired school manager cannot originate a fresh communication template'
);

select lives_ok(
  $$insert into public.communication_templates(id,tenant_id,school_id,template_key,channel,name,created_by_user_id)
    values('cb110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','actor.valid','email','Valid','cb100000-0000-4000-8000-000000000001')$$,
  'effective school manager remains a valid communication-template creator'
);

select lives_ok(
  $$insert into public.communication_templates(id,tenant_id,school_id,template_key,channel,name,created_by_user_id)
    values('cb110000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','actor.platform','sms','Platform','cb100000-0000-4000-8000-000000000004')$$,
  'platform administrator remains a valid communication-template creator'
);

select throws_ok(
  $$insert into public.communication_template_versions(template_id,version,language,body_preview,variables,created_by_user_id)
    values('cb110000-0000-4000-8000-000000000001',1,'en','Bad creator','[]'::jsonb,'cb100000-0000-4000-8000-000000000002')$$,
  'Communication template version creator is not authorized for school',
  'unrelated account cannot be forged as a template-version creator'
);

select lives_ok(
  $$insert into public.communication_template_versions(id,template_id,version,language,body_preview,variables,created_by_user_id)
    values('cb120000-0000-4000-8000-000000000001','cb110000-0000-4000-8000-000000000001',1,'en','Valid creator','[]'::jsonb,'cb100000-0000-4000-8000-000000000001')$$,
  'authorized manager remains a valid template-version creator'
);

select throws_ok(
  $$update public.communication_template_versions set status='approved',approved_by_user_id='cb100000-0000-4000-8000-000000000002',approved_at=now() where id='cb120000-0000-4000-8000-000000000001'$$,
  'Communication template version approver is not authorized for school',
  'unrelated account cannot be forged as template approver'
);

select lives_ok(
  $$update public.communication_template_versions set status='approved',approved_by_user_id='cb100000-0000-4000-8000-000000000001',approved_at=now() where id='cb120000-0000-4000-8000-000000000001'$$,
  'authorized school manager can approve the template version'
);

select throws_ok(
  $$update public.communication_template_versions set approved_by_user_id='cb100000-0000-4000-8000-000000000004' where id='cb120000-0000-4000-8000-000000000001'$$,
  'Communication template version approval provenance is immutable',
  'template approval actor cannot be rewritten after approval'
);

select ok(
  not has_function_privilege('authenticated','app_private.user_can_manage_communication_templates(uuid,uuid,date)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_communication_template_scope_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_communication_template_version_provenance()','EXECUTE'),
  'communication-template actor helpers remain private from authenticated clients'
);

select is(
  (select count(*)::integer from pg_trigger
   where tgrelid in ('public.communication_templates'::regclass,'public.communication_template_versions'::regclass)
     and tgname in ('communication_templates_scope_integrity_trg','communication_template_versions_provenance_trg')
     and not tgisinternal),
  2,
  'template and version integrity triggers remain installed exactly once'
);

select * from finish();
rollback;
