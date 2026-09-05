begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('aa700000-0000-4000-8000-000000000001','profile-change-scope@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','aa700000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.learners(id,tenant_id,first_names,surname)
values('aa710000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Profile','Learner A');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values('aa720000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','aa710000-0000-4000-8000-000000000001',extract(year from current_date)::integer,current_date-30,'current');

insert into public.tenants(id,name,slug)
values('aa800000-0000-4000-8000-000000000001','Profile Change Scope Tenant B','profile-change-scope-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('aa810000-0000-4000-8000-000000000001','aa800000-0000-4000-8000-000000000001','Profile Change Scope School B','PCS-B','Khomas','Windhoek');

insert into public.learners(id,tenant_id,first_names,surname)
values('aa820000-0000-4000-8000-000000000001','aa800000-0000-4000-8000-000000000001','Profile','Learner B');

select throws_ok(
  $$insert into public.profile_change_requests(tenant_id,school_id,learner_id,target_type,target_id,field_key,current_value,proposed_value,requested_by_user_id)
    values('aa800000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','aa710000-0000-4000-8000-000000000001','learner','aa710000-0000-4000-8000-000000000001','preferred_name',null,'New name','aa700000-0000-4000-8000-000000000001')$$,
  'Profile change request scope mismatch: school does not belong to tenant',
  'profile change request tenant must match school tenant'
);

select throws_ok(
  $$insert into public.profile_change_requests(tenant_id,school_id,learner_id,target_type,target_id,field_key,current_value,proposed_value,requested_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','aa820000-0000-4000-8000-000000000001','learner','aa820000-0000-4000-8000-000000000001','preferred_name',null,'New name','aa700000-0000-4000-8000-000000000001')$$,
  'Profile change request scope mismatch: learner does not belong to tenant',
  'profile change request learner must match tenant'
);

select throws_ok(
  $$insert into public.profile_change_requests(tenant_id,school_id,learner_id,target_type,target_id,field_key,current_value,proposed_value,requested_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','aa710000-0000-4000-8000-000000000001','learner','50000000-0000-4000-8000-000000000001','preferred_name',null,'New name','aa700000-0000-4000-8000-000000000001')$$,
  'Profile change request scope mismatch: target is not linked to learner',
  'profile change request target must belong to learner relationship'
);

select lives_ok(
  $$insert into public.profile_change_requests(id,tenant_id,school_id,learner_id,target_type,target_id,field_key,current_value,proposed_value,requested_by_user_id)
    values('aa830000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','aa710000-0000-4000-8000-000000000001','learner','aa710000-0000-4000-8000-000000000001','preferred_name',null,'New name','aa700000-0000-4000-8000-000000000001')$$,
  'valid profile change request remains allowed'
);

select lives_ok(
  $$update public.profile_change_requests set status='approved', reviewed_by_user_id='aa700000-0000-4000-8000-000000000001', reviewed_at=now(), applied_at=now() where id='aa830000-0000-4000-8000-000000000001'$$,
  'profile change review lifecycle fields remain mutable for an authorized reviewer'
);

select throws_ok(
  $$update public.profile_change_requests set proposed_value='Rewritten proposal' where id='aa830000-0000-4000-8000-000000000001'$$,
  'Profile change request scope and submitted proposal are immutable',
  'submitted profile change proposal cannot be rewritten'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_profile_change_request_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_profile_change_request_scope_integrity()','EXECUTE'),
  'profile change request integrity helper is private from client roles'
);

select is(
  (select count(*)::integer from pg_trigger where tgrelid='public.profile_change_requests'::regclass and tgname='profile_change_request_scope_integrity_trg' and not tgisinternal),
  1,
  'profile change requests have exactly one scope-integrity trigger'
);

select * from finish();
rollback;
