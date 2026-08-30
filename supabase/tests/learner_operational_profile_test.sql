begin;

select plan(5);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fda00000-0000-4000-8000-000000000001','learner-profile-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fda00000-0000-4000-8000-000000000001','school_admin','2026-01-01');

insert into public.learners(id,tenant_id,first_names,surname,preferred_name,sex)
values
('fda10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Official','Learner','Old','unspecified'),
('fda10000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Other','Learner',null,'unspecified');

insert into public.school_learner_identifiers(id,tenant_id,school_id,learner_id,admission_number,source)
values('fda20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fda10000-0000-4000-8000-000000000001','PROFILE-TEST-001','manual');

select set_config('request.jwt.claim.sub','fda00000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select is(public.update_learner_operational_profile('fda10000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',' New '),true,'school admin can update operational learner profile data');
select is((select preferred_name from public.learners where id='fda10000-0000-4000-8000-000000000001'),'New','preferred name is trimmed and saved');
select is((select first_names from public.learners where id='fda10000-0000-4000-8000-000000000001'),'Official','operational edit leaves official first names unchanged');
select ok(exists(select 1 from public.audit_events where entity_id='fda10000-0000-4000-8000-000000000001' and event_type='learner.operational_profile_updated'),'operational learner edit is audited');
select throws_ok($$select public.update_learner_operational_profile('fda10000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','Nope')$$,'Learner does not belong to this school','school-scoped update refuses a learner without a school identity link');

select * from finish();
rollback;
