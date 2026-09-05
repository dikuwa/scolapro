begin;

select plan(14);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('ac100000-0000-4000-8000-000000000001','tenant-governance-a@example.test','authenticated','authenticated',now(),now()),
  ('ac100000-0000-4000-8000-000000000002','tenant-governance-b@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key,active_from)
values('ac100000-0000-4000-8000-000000000001','platform_admin',current_date-1);

insert into public.tenants(id,name,slug)
values
  ('ac110000-0000-4000-8000-000000000001','Tenant Governance A','tenant-governance-a'),
  ('ac110000-0000-4000-8000-000000000002','Tenant Governance B','tenant-governance-b');

select set_config('request.jwt.claim.sub','ac100000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$insert into public.tenant_features(
      id,tenant_id,feature_key,enabled,configuration,effective_from,updated_by_user_id
    ) values(
      'ac120000-0000-4000-8000-000000000001','ac110000-0000-4000-8000-000000000001','parent_portal',true,'{}'::jsonb,current_date,'ac100000-0000-4000-8000-000000000002'
    )$$,
  'tenant feature insert remains allowed'
);

select is(
  (select updated_by_user_id::text from public.tenant_features where id='ac120000-0000-4000-8000-000000000001'),
  'ac100000-0000-4000-8000-000000000001',
  'authenticated tenant feature write records the real updater'
);

select lives_ok(
  $$update public.tenant_features
       set enabled=false,configuration='{"reason":"pilot_pause"}'::jsonb,effective_to=current_date+30,updated_by_user_id='ac100000-0000-4000-8000-000000000002',updated_at=now()
     where id='ac120000-0000-4000-8000-000000000001'$$,
  'tenant feature operational configuration remains editable'
);

select is(
  (select updated_by_user_id::text from public.tenant_features where id='ac120000-0000-4000-8000-000000000001'),
  'ac100000-0000-4000-8000-000000000001',
  'tenant feature updater provenance cannot be spoofed'
);

select throws_ok(
  $$update public.tenant_features
       set tenant_id='ac110000-0000-4000-8000-000000000002'
     where id='ac120000-0000-4000-8000-000000000001'$$,
  'Tenant feature identity and creation provenance are immutable',
  'tenant feature cannot be rebound to another tenant'
);

select throws_ok(
  $$update public.tenant_features
       set feature_key='rewritten_feature'
     where id='ac120000-0000-4000-8000-000000000001'$$,
  'Tenant feature identity and creation provenance are immutable',
  'tenant feature key cannot be rewritten'
);

select lives_ok(
  $$insert into public.tenant_lifecycle_events(
      id,tenant_id,event_type,note,actor_user_id
    ) values(
      'ac130000-0000-4000-8000-000000000001','ac110000-0000-4000-8000-000000000001','support_note','Initial note',null
    )$$,
  'tenant lifecycle event insert remains allowed'
);

select is(
  (select actor_user_id::text from public.tenant_lifecycle_events where id='ac130000-0000-4000-8000-000000000001'),
  'ac100000-0000-4000-8000-000000000001',
  'tenant lifecycle event records authenticated actor'
);

select throws_ok(
  $$insert into public.tenant_lifecycle_events(
      tenant_id,event_type,note,actor_user_id
    ) values(
      'ac110000-0000-4000-8000-000000000001','support_note','Spoofed actor','ac100000-0000-4000-8000-000000000002'
    )$$,
  'Tenant lifecycle event actor must match authenticated user',
  'tenant lifecycle event actor cannot be spoofed'
);

select set_config('request.jwt.claim.sub','',true);

select throws_ok(
  $$insert into public.tenant_features(tenant_id,feature_key,enabled,configuration,effective_from)
    values('ac110000-0000-4000-8000-000000000001','trusted_missing_actor',true,'{}',current_date)$$,
  'Tenant feature updater is required',
  'trusted tenant-feature write cannot omit actor evidence'
);

select throws_ok(
  $$insert into public.tenant_features(tenant_id,feature_key,enabled,configuration,effective_from,updated_by_user_id)
    values('ac110000-0000-4000-8000-000000000001','trusted_forged_actor',true,'{}',current_date,'ac100000-0000-4000-8000-000000000002')$$,
  'Tenant feature updater is not an active platform administrator',
  'trusted tenant-feature write cannot attribute change to ordinary user'
);

select throws_ok(
  $$insert into public.tenant_lifecycle_events(tenant_id,event_type,note)
    values('ac110000-0000-4000-8000-000000000001','support_note','Missing trusted actor')$$,
  'Tenant lifecycle event actor is required',
  'trusted lifecycle event cannot omit actor evidence'
);

select throws_ok(
  $$insert into public.tenant_lifecycle_events(tenant_id,event_type,note,actor_user_id)
    values('ac110000-0000-4000-8000-000000000001','support_note','Forged trusted actor','ac100000-0000-4000-8000-000000000002')$$,
  'Tenant lifecycle event actor is not an active platform administrator',
  'trusted lifecycle event cannot attribute history to ordinary user'
);

select ok(
  not has_function_privilege('authenticated','app_private.user_is_active_platform_admin(uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_is_active_platform_admin(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_tenant_feature_provenance()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_tenant_feature_provenance()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_tenant_lifecycle_event_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_tenant_lifecycle_event_integrity()','EXECUTE')
  and (select count(*) from pg_trigger where tgname in (
    'tenant_features_provenance_integrity_trg',
    'tenant_lifecycle_events_integrity_trg'
  ) and not tgisinternal)=2,
  'tenant governance integrity helpers are private and both triggers are installed'
);

select * from finish();
rollback;
