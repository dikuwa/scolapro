begin;

select plan(20);

-- Dedicated schools/tenants for current-school and cross-scope checks.
insert into public.tenants(id,name,slug,status) values
('85310000-0000-4000-8000-000000000001','AEC Profile Tenant A','aec-profile-a','active'),
('85310000-0000-4000-8000-000000000002','AEC Profile Tenant B','aec-profile-b','active');

insert into public.schools(id,tenant_id,name,emis_number,region,town,status) values
('85320000-0000-4000-8000-000000000001','85310000-0000-4000-8000-000000000001','AEC Profile School A','EMIS-853-A','Legacy A','Swakopmund','active'),
('85320000-0000-4000-8000-000000000002','85310000-0000-4000-8000-000000000001','AEC Profile School B','EMIS-853-B','Legacy B','Walvis Bay','active'),
('85320000-0000-4000-8000-000000000003','85310000-0000-4000-8000-000000000002','AEC Profile School C','EMIS-853-C','Legacy C','Oshakati','active');

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('85330000-0000-4000-8000-000000000001','profile-admin@example.test','authenticated','authenticated',now(),now()),
('85330000-0000-4000-8000-000000000002','profile-teacher@example.test','authenticated','authenticated',now(),now()),
('85330000-0000-4000-8000-000000000003','profile-stale@example.test','authenticated','authenticated',now(),now()),
('85330000-0000-4000-8000-000000000004','profile-other-school@example.test','authenticated','authenticated',now(),now()),
('85330000-0000-4000-8000-000000000005','profile-other-tenant@example.test','authenticated','authenticated',now(),now()),
('85330000-0000-4000-8000-000000000006','profile-support@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from,active_to) values
('85310000-0000-4000-8000-000000000001','85320000-0000-4000-8000-000000000001','85330000-0000-4000-8000-000000000001','school_admin',current_date-20,null),
('85310000-0000-4000-8000-000000000001','85320000-0000-4000-8000-000000000001','85330000-0000-4000-8000-000000000002','teacher',current_date-20,null),
('85310000-0000-4000-8000-000000000001','85320000-0000-4000-8000-000000000001','85330000-0000-4000-8000-000000000003','principal',current_date-40,current_date-1),
('85310000-0000-4000-8000-000000000001','85320000-0000-4000-8000-000000000002','85330000-0000-4000-8000-000000000004','school_admin',current_date-10,null),
('85310000-0000-4000-8000-000000000002','85320000-0000-4000-8000-000000000003','85330000-0000-4000-8000-000000000005','school_admin',current_date-10,null);

insert into public.platform_memberships(user_id,role_key,active_from)
values('85330000-0000-4000-8000-000000000006','platform_support',current_date-10);

insert into public.school_settings(
  tenant_id,school_id,setting_key,setting_value,updated_by_user_id
) values (
  '85310000-0000-4000-8000-000000000001',
  '85320000-0000-4000-8000-000000000001',
  'document_profile',
  '{"physical_address":"1 Canonical Street","postal_address":"PO Box 853","telephone":"064 853","email":"school853@example.test","cellphone":"081 853","logo_url":"https://example.test/logo.png"}'::jsonb,
  '85330000-0000-4000-8000-000000000001'
);

insert into public.education_authorities(id,name)
values('85340000-0000-4000-8000-000000000001','AEC Profile Authority');
insert into public.education_regions(id,name)
values('85341000-0000-4000-8000-000000000001','Canonical Region');
insert into public.education_circuits(id,name)
values('85342000-0000-4000-8000-000000000001','Canonical Circuit');
insert into public.education_clusters(id,name)
values('85343000-0000-4000-8000-000000000001','Canonical Cluster');
insert into public.education_region_authority_history(region_id,authority_id,effective_from)
values('85341000-0000-4000-8000-000000000001','85340000-0000-4000-8000-000000000001',current_date-100);
insert into public.education_circuit_region_history(circuit_id,region_id,effective_from)
values('85342000-0000-4000-8000-000000000001','85341000-0000-4000-8000-000000000001',current_date-100);
insert into public.education_cluster_circuit_history(cluster_id,circuit_id,effective_from)
values('85343000-0000-4000-8000-000000000001','85342000-0000-4000-8000-000000000001',current_date-100);
insert into public.school_network_assignments(
  school_id,authority_id,region_id,circuit_id,cluster_id,effective_from
) values (
  '85320000-0000-4000-8000-000000000001',
  '85340000-0000-4000-8000-000000000001',
  '85341000-0000-4000-8000-000000000001',
  '85342000-0000-4000-8000-000000000001',
  '85343000-0000-4000-8000-000000000001',
  current_date-10
);

-- Add a canonical hostel profile; statutory profile must only summarize it.
insert into public.school_hostels(
  tenant_id,school_id,hostel_type,capacity,active_from,created_by_user_id
) values (
  '85310000-0000-4000-8000-000000000001',
  '85320000-0000-4000-8000-000000000001',
  'boarding',40,current_date-10,'85330000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','85330000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.save_school_statutory_emis_profile(
    '85320000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'pay_point','Swakopmund',
      'constituency','Swakopmund',
      'school_classification','Secondary',
      'ownership','Government',
      'urban_rural','Urban',
      'is_satellite_school',false,
      'satellite_school_information','',
      'is_cluster_centre',true
    )
  )$$,
  'authorized current-school manager can update reusable statutory profile'
);

select is(
  (select public.get_school_statutory_emis_profile('85320000-0000-4000-8000-000000000001') #>> '{school,emis_number}'),
  'EMIS-853-A',
  'existing schools.emis_number is reused'
);

select is(
  (select public.get_school_statutory_emis_profile('85320000-0000-4000-8000-000000000001') #>> '{network,region_name}'),
  'Canonical Region',
  'region resolves from the effective canonical education network'
);

select is(
  (select public.get_school_statutory_emis_profile('85320000-0000-4000-8000-000000000001') #>> '{network,circuit_name}'),
  'Canonical Circuit',
  'circuit resolves from the effective canonical education network'
);

select is(
  (select public.get_school_statutory_emis_profile('85320000-0000-4000-8000-000000000001') #>> '{network,cluster_name}'),
  'Canonical Cluster',
  'cluster resolves from the effective canonical education network'
);

select is(
  (select public.get_school_statutory_emis_profile('85320000-0000-4000-8000-000000000001') #>> '{contact,physical_address}'),
  '1 Canonical Street',
  'physical address reuses document_profile authority'
);

select is(
  (select public.get_school_statutory_emis_profile('85320000-0000-4000-8000-000000000001') #>> '{hostel,active_count}'),
  '1',
  'hostel information derives from the canonical operational hostel profile'
);

select is(
  (select setting_value ->> 'pay_point'
   from public.school_settings
   where school_id='85320000-0000-4000-8000-000000000001'
     and setting_key='statutory_emis_profile'),
  'Swakopmund',
  'schema-gap reusable statutory field is stored in school_settings'
);

select ok(
  not exists(
    select 1
    from public.school_settings,
         jsonb_object_keys(setting_value) key
    where school_id='85320000-0000-4000-8000-000000000001'
      and setting_key='statutory_emis_profile'
      and (key ilike '%code%' or key in ('emis_number','region_id','circuit_id','cluster_id','physical_address','postal_address','telephone','email'))
  ),
  'profile does not duplicate canonical identifiers/contact data or invent official-code fields'
);

select lives_ok(
  $$select public.save_school_statutory_emis_profile(
    '85320000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'pay_point','',
      'constituency','',
      'school_classification','',
      'ownership','',
      'urban_rural','',
      'satellite_school_information',''
    )
  )$$,
  'blank optional values are safe'
);

select ok(
  not exists(
    select 1 from public.school_settings
    where school_id='85320000-0000-4000-8000-000000000001'
      and setting_key='statutory_emis_profile'
      and (
        setting_value ? 'pay_point'
        or setting_value ? 'constituency'
        or setting_value ? 'school_classification'
        or setting_value ? 'ownership'
        or setting_value ? 'urban_rural'
        or setting_value ? 'satellite_school_information'
      )
  ),
  'blank optional strings are removed rather than persisted'
);

select is(
  (select setting_value ->> 'physical_address'
   from public.school_settings
   where school_id='85320000-0000-4000-8000-000000000001'
     and setting_key='document_profile'),
  '1 Canonical Street',
  'statutory profile save does not rewrite canonical address/contact settings'
);

select set_config('request.jwt.claim.sub','85330000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select public.get_school_statutory_emis_profile('85320000-0000-4000-8000-000000000001')$$,
  'P0001','Current School Settings authority is required',
  'ordinary teacher is denied'
);

select set_config('request.jwt.claim.sub','85330000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$select public.save_school_statutory_emis_profile('85320000-0000-4000-8000-000000000001','{}'::jsonb)$$,
  'P0001','Current School Settings authority is required',
  'stale school-management membership is denied'
);

select set_config('request.jwt.claim.sub','85330000-0000-4000-8000-000000000004',true);
select throws_ok(
  $$select public.save_school_statutory_emis_profile('85320000-0000-4000-8000-000000000001','{}'::jsonb)$$,
  'P0001','Current School Settings authority is required',
  'cross-school manager is denied'
);

select set_config('request.jwt.claim.sub','85330000-0000-4000-8000-000000000005',true);
select throws_ok(
  $$select public.get_school_statutory_emis_profile('85320000-0000-4000-8000-000000000001')$$,
  'P0001','Current School Settings authority is required',
  'cross-tenant manager is denied'
);

select set_config('request.jwt.claim.sub','85330000-0000-4000-8000-000000000006',true);
select throws_ok(
  $$select public.get_school_statutory_emis_profile('85320000-0000-4000-8000-000000000001')$$,
  'P0001','Current School Settings authority is required',
  'Platform Support does not inherit school profile authority'
);

select set_config('request.jwt.claim.sub','85330000-0000-4000-8000-000000000001',true);
select is(
  (select count(*)::integer
   from public.audit_events
   where school_id='85320000-0000-4000-8000-000000000001'
     and actor_user_id='85330000-0000-4000-8000-000000000001'
     and event_type='school.statutory_emis_profile.updated'),
  2,
  'profile updates preserve actor audit provenance'
);

select ok(
  has_function_privilege('authenticated','public.get_school_statutory_emis_profile(uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.save_school_statutory_emis_profile(uuid,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.get_school_statutory_emis_profile(uuid)','EXECUTE')
  and not has_function_privilege('anon','public.save_school_statutory_emis_profile(uuid,jsonb)','EXECUTE'),
  'profile RPC grants are authenticated-only'
);

select ok(
  not has_function_privilege('authenticated','app_private.can_manage_current_school_statutory_profile(uuid)','EXECUTE'),
  'private authority helper is not exposed to clients'
);

select * from finish();
rollback;
