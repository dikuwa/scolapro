begin;

select plan(23);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('f6100000-0000-4000-8000-000000000001','directory-config-admin@example.test','authenticated','authenticated',now(),now()),
  ('f6100000-0000-4000-8000-000000000002','directory-config-support@example.test','authenticated','authenticated',now(),now()),
  ('f6100000-0000-4000-8000-000000000003','directory-config-principal@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(id,user_id,role_key,active_from)
values
  ('f6110000-0000-4000-8000-000000000001','f6100000-0000-4000-8000-000000000001','platform_admin',current_date-1),
  ('f6110000-0000-4000-8000-000000000002','f6100000-0000-4000-8000-000000000002','platform_support',current_date-1);

insert into public.tenants(id,name,slug,status)
values
  ('f6120000-0000-4000-8000-000000000001','Directory Config Tenant A','directory-config-a','active'),
  ('f6120000-0000-4000-8000-000000000002','Directory Config Tenant B','directory-config-b','active');

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values
  ('f6130000-0000-4000-8000-000000000001','f6120000-0000-4000-8000-000000000001','Directory Config School A','OLD-EMIS','Legacy Region','Old Town','active'),
  ('f6130000-0000-4000-8000-000000000002','f6120000-0000-4000-8000-000000000002','Directory Config School B',null,null,null,'active');

insert into public.school_settings(
  id,tenant_id,school_id,setting_key,setting_value,updated_by_user_id
) values (
  'f6140000-0000-4000-8000-000000000001',
  'f6120000-0000-4000-8000-000000000001',
  'f6130000-0000-4000-8000-000000000001',
  'document_profile',
  '{"logo_url":"https://cdn.example.test/original.svg","former_name":"Historical School"}'::jsonb,
  'f6100000-0000-4000-8000-000000000001'
);

insert into public.education_authorities(id,name)
values('f6150000-0000-4000-8000-000000000001','Directory Config Authority');

insert into public.education_regions(id,name)
values
  ('f6160000-0000-4000-8000-000000000001','Directory Config Region A'),
  ('f6160000-0000-4000-8000-000000000002','Directory Config Region B');

insert into public.education_circuits(id,name)
values
  ('f6170000-0000-4000-8000-000000000001','Directory Config Circuit A'),
  ('f6170000-0000-4000-8000-000000000002','Directory Config Circuit B');

insert into public.education_region_authority_history(id,region_id,authority_id,effective_from)
values
  ('f6180000-0000-4000-8000-000000000001','f6160000-0000-4000-8000-000000000001','f6150000-0000-4000-8000-000000000001',current_date-365),
  ('f6180000-0000-4000-8000-000000000002','f6160000-0000-4000-8000-000000000002','f6150000-0000-4000-8000-000000000001',current_date-365);

insert into public.education_circuit_region_history(id,circuit_id,region_id,effective_from)
values
  ('f6190000-0000-4000-8000-000000000001','f6170000-0000-4000-8000-000000000001','f6160000-0000-4000-8000-000000000001',current_date-365),
  ('f6190000-0000-4000-8000-000000000002','f6170000-0000-4000-8000-000000000002','f6160000-0000-4000-8000-000000000002',current_date-365);

insert into public.staff_members(
  id,tenant_id,user_id,employee_number,first_name,last_name,status
) values (
  'f61a0000-0000-4000-8000-000000000001',
  'f6120000-0000-4000-8000-000000000001',
  'f6100000-0000-4000-8000-000000000003',
  'PRINCIPAL-476','Current','Principal','active'
);

insert into public.school_memberships(
  id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from
) values (
  'f61b0000-0000-4000-8000-000000000001',
  'f6120000-0000-4000-8000-000000000001',
  'f6130000-0000-4000-8000-000000000001',
  'f6100000-0000-4000-8000-000000000003',
  'f61a0000-0000-4000-8000-000000000001',
  'principal',current_date-30
);

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,position_title,
  effective_from,effective_to,created_by_user_id
) values (
  'f61c0000-0000-4000-8000-000000000001',
  'f6120000-0000-4000-8000-000000000001',
  'f6130000-0000-4000-8000-000000000001',
  'f61a0000-0000-4000-8000-000000000001',
  'management','Principal',current_date-30,current_date-1,
  'f6100000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f6100000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.update_platform_tenant_configuration(
    'f6120000-0000-4000-8000-000000000001','Directory Config Tenant A Updated','suspended'
  )$$,
  'platform admin can update mutable tenant metadata'
);

select is(
  (select name || '|' || status from public.tenants where id='f6120000-0000-4000-8000-000000000001'),
  'Directory Config Tenant A Updated|suspended',
  'tenant name and status are updated'
);

select is(
  (select slug from public.tenants where id='f6120000-0000-4000-8000-000000000001'),
  'directory-config-a',
  'tenant slug remains immutable through platform configuration'
);

-- Keep the fixture discoverable by the directory after proving suspended is mutable.
-- This direct fixture reset is intentionally outside the application workflow.
update public.tenants
set status='active'
where id='f6120000-0000-4000-8000-000000000001';

select lives_ok(
  $$select public.update_platform_school_configuration(
    'f6120000-0000-4000-8000-000000000001',
    'f6130000-0000-4000-8000-000000000001',
    'Directory Config School A Updated','NEW-EMIS','Legacy Text Region','New Town','active',
    '1 School Street','P.O. Box 476','061 000 476','061 000 477',
    'school476@example.test','081 000 0476'
  )$$,
  'platform admin can update mutable school metadata and public contact fields'
);

select is(
  (select name || '|' || coalesce(emis_number,'') || '|' || coalesce(town,'') || '|' || coalesce(region,'') || '|' || status
   from public.schools where id='f6130000-0000-4000-8000-000000000001'),
  'Directory Config School A Updated|NEW-EMIS|New Town|Legacy Text Region|active',
  'school mutable metadata is updated without rebinding identity'
);

select is(
  (select setting_value ->> 'logo_url'
   from public.school_settings
   where school_id='f6130000-0000-4000-8000-000000000001' and setting_key='document_profile'),
  'https://cdn.example.test/original.svg',
  'platform school contact edit merges document profile and preserves unrelated keys'
);

select is(
  (select setting_value ->> 'telephone'
   from public.school_settings
   where school_id='f6130000-0000-4000-8000-000000000001' and setting_key='document_profile'),
  '061 000 476',
  'platform school contact edit writes the canonical public contact profile'
);

select is(
  (select tenant_id::text from public.schools where id='f6130000-0000-4000-8000-000000000001'),
  'f6120000-0000-4000-8000-000000000001',
  'school tenant identity remains unchanged'
);

select throws_ok(
  $$select public.update_platform_school_configuration(
    'f6120000-0000-4000-8000-000000000002',
    'f6130000-0000-4000-8000-000000000001',
    'Wrong Tenant',null,null,null,'active',null,null,null,null,null,null
  )$$,
  'P0001',
  'School not found in tenant',
  'cross-tenant school configuration is denied'
);

select lives_ok(
  $$select public.configure_school_network_assignment(
    'f6120000-0000-4000-8000-000000000001',
    'f6130000-0000-4000-8000-000000000001',
    'f6160000-0000-4000-8000-000000000001',
    'f6170000-0000-4000-8000-000000000001',
    current_date
  )$$,
  'platform admin can establish the current canonical region and circuit'
);

select is(
  (select region_id::text || '|' || circuit_id::text
   from public.school_network_assignments
   where school_id='f6130000-0000-4000-8000-000000000001'
     and effective_from=current_date),
  'f6160000-0000-4000-8000-000000000001|f6170000-0000-4000-8000-000000000001',
  'network assignment uses canonical region and circuit identities'
);

select throws_ok(
  $$select public.configure_school_network_assignment(
    'f6120000-0000-4000-8000-000000000001',
    'f6130000-0000-4000-8000-000000000001',
    'f6160000-0000-4000-8000-000000000002',
    'f6170000-0000-4000-8000-000000000001',
    current_date+1
  )$$,
  'P0001',
  'Circuit is not assigned to the selected region on that date',
  'region/circuit hierarchy mismatch is denied'
);

select lives_ok(
  $$select public.configure_school_network_assignment(
    'f6120000-0000-4000-8000-000000000001',
    'f6130000-0000-4000-8000-000000000001',
    'f6160000-0000-4000-8000-000000000002',
    'f6170000-0000-4000-8000-000000000002',
    current_date+1
  )$$,
  'platform admin can schedule an effective region/circuit transition'
);

select is(
  (select effective_to::text
   from public.school_network_assignments
   where school_id='f6130000-0000-4000-8000-000000000001'
     and circuit_id='f6170000-0000-4000-8000-000000000001'),
  current_date::text,
  'prior assignment is closed rather than deleted'
);

select is(
  (select count(*)::integer
   from public.school_network_assignments
   where school_id='f6130000-0000-4000-8000-000000000001'
     and region_id='f6160000-0000-4000-8000-000000000002'
     and circuit_id='f6170000-0000-4000-8000-000000000002'
     and effective_from=current_date+1
     and effective_to is null),
  1,
  'new effective assignment preserves the transition history'
);

select set_config('request.jwt.claim.sub','f6100000-0000-4000-8000-000000000002',true);

select throws_ok(
  $$select public.update_platform_tenant_configuration(
    'f6120000-0000-4000-8000-000000000001','Support Rename','active'
  )$$,
  'P0001',
  'Platform administrator authority required',
  'Platform Support cannot mutate tenant configuration'
);

select throws_ok(
  $$select public.update_platform_school_configuration(
    'f6120000-0000-4000-8000-000000000001',
    'f6130000-0000-4000-8000-000000000001',
    'Support Rename',null,null,null,'active',null,null,null,null,null,null
  )$$,
  'P0001',
  'Platform administrator authority required',
  'Platform Support cannot mutate school configuration'
);

select throws_ok(
  $$select public.configure_school_network_assignment(
    'f6120000-0000-4000-8000-000000000001',
    'f6130000-0000-4000-8000-000000000001',
    'f6160000-0000-4000-8000-000000000001',
    'f6170000-0000-4000-8000-000000000001',
    current_date+2
  )$$,
  'P0001',
  'Platform administrator authority required',
  'Platform Support cannot mutate school network assignment'
);

select set_config('request.jwt.claim.sub','f6100000-0000-4000-8000-000000000001',true);

select is(
  (select principal_name
   from public.search_school_directory()
   where school_id='f6130000-0000-4000-8000-000000000001'),
  null,
  'stale principal placement does not produce a derived directory principal'
);

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,position_title,
  effective_from,effective_to,created_by_user_id
) values (
  'f61c0000-0000-4000-8000-000000000002',
  'f6120000-0000-4000-8000-000000000001',
  'f6130000-0000-4000-8000-000000000001',
  'f61a0000-0000-4000-8000-000000000001',
  'management','Principal',current_date,null,
  'f6100000-0000-4000-8000-000000000001'
);

select is(
  (select principal_name
   from public.search_school_directory()
   where school_id='f6130000-0000-4000-8000-000000000001'),
  'Current Principal',
  'directory principal is derived once membership, active identity and effective placement are all current'
);

select is(
  (select count(*)::integer from public.audit_events
   where tenant_id='f6120000-0000-4000-8000-000000000001'
     and event_type='tenant.configuration.updated'
     and actor_user_id='f6100000-0000-4000-8000-000000000001'),
  1,
  'tenant configuration update records platform-admin audit provenance'
);

select is(
  (select count(*)::integer from public.audit_events
   where school_id='f6130000-0000-4000-8000-000000000001'
     and event_type='school.configuration.updated'
     and actor_user_id='f6100000-0000-4000-8000-000000000001'),
  1,
  'school configuration update records platform-admin audit provenance'
);

select ok(
  (select count(*) >= 3 from public.audit_events
   where entity_type='school_network_assignments'
     and event_type like 'education_network.%'
     and actor_user_id='f6100000-0000-4000-8000-000000000001'),
  'effective assignment creation/closure is captured by the existing network audit trail'
);

select * from finish();
rollback;
