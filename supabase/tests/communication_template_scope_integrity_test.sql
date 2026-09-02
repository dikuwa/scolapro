begin;

select plan(11);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fd900000-0000-4000-8000-000000000001','template-scope-author@example.test','authenticated','authenticated',now(),now()),
  ('fd900000-0000-4000-8000-000000000002','template-scope-other@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug)
values('fd910000-0000-4000-8000-000000000001','Template Scope Tenant B','template-scope-tenant-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('fd920000-0000-4000-8000-000000000001','fd910000-0000-4000-8000-000000000001','Template Scope School B','TEMPLATE-SCOPE-B','Khomas','Windhoek');

select throws_ok(
  $$insert into public.communication_templates(
      tenant_id,school_id,template_key,channel,name,created_by_user_id
    ) values(
      'fd910000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','invalid-scope','email','Invalid scope','fd900000-0000-4000-8000-000000000001'
    )$$,
  'Communication template scope mismatch: school does not belong to tenant',
  'template tenant must match its school tenant'
);

select lives_ok(
  $$insert into public.communication_templates(
      id,tenant_id,school_id,template_key,channel,name,created_by_user_id
    ) values(
      'fd930000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','template-scope-a','email','Template Scope A','fd900000-0000-4000-8000-000000000001'
    )$$,
  'valid same-school communication template remains allowed'
);

select throws_ok(
  $$update public.communication_templates
       set channel='sms'
     where id='fd930000-0000-4000-8000-000000000001'$$,
  'Communication template scope and identity are immutable',
  'template channel identity cannot be rewritten after creation'
);

select lives_ok(
  $$update public.communication_templates
       set name='Template Scope A Updated', description='Ordinary metadata change'
     where id='fd930000-0000-4000-8000-000000000001'$$,
  'ordinary template display metadata remains editable'
);

select lives_ok(
  $$insert into public.communication_template_versions(
      id,template_id,version,language,body_preview,variables,status,created_by_user_id
    ) values(
      'fd940000-0000-4000-8000-000000000001','fd930000-0000-4000-8000-000000000001',1,'en','Template body','[]'::jsonb,'draft','fd900000-0000-4000-8000-000000000001'
    )$$,
  'valid communication template version remains allowed'
);

select throws_ok(
  $$update public.communication_template_versions
       set body_preview='Rewritten historical body'
     where id='fd940000-0000-4000-8000-000000000001'$$,
  'Communication template version provenance is immutable',
  'template version content provenance cannot be rewritten in place'
);

select lives_ok(
  $$update public.communication_template_versions
       set status='rejected', updated_at=now()
     where id='fd940000-0000-4000-8000-000000000001'$$,
  'template version review lifecycle remains editable'
);

select lives_ok(
  $$insert into public.communication_provider_template_bindings(
      id,template_version_id,provider_key,provider_template_key,approval_status,active,updated_by_user_id
    ) values(
      'fd950000-0000-4000-8000-000000000001','fd940000-0000-4000-8000-000000000001','bird_whatsapp','template-a','pending',true,'fd900000-0000-4000-8000-000000000001'
    )$$,
  'valid provider template binding remains allowed'
);

select throws_ok(
  $$update public.communication_provider_template_bindings
       set provider_key='other_provider'
     where id='fd950000-0000-4000-8000-000000000001'$$,
  'Communication provider template binding provenance is immutable',
  'provider binding identity cannot be rebound after creation'
);

select lives_ok(
  $$update public.communication_provider_template_bindings
       set provider_template_key='template-a-v2', active=false, updated_by_user_id='fd900000-0000-4000-8000-000000000002', updated_at=now()
     where id='fd950000-0000-4000-8000-000000000001'$$,
  'provider binding lifecycle and provider metadata remain editable'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_communication_template_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_communication_template_scope_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_communication_template_version_provenance()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_communication_template_version_provenance()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_communication_provider_template_binding_provenance()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_communication_provider_template_binding_provenance()','EXECUTE')
  and (select count(*) from pg_trigger where tgname in (
    'communication_templates_scope_integrity_trg',
    'communication_template_versions_provenance_trg',
    'communication_provider_template_bindings_provenance_trg'
  ) and not tgisinternal)=3,
  'communication template integrity helpers are private and all triggers are installed'
);

select * from finish();
rollback;
