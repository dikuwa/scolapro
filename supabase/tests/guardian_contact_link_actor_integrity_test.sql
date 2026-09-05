begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fe300000-0000-4000-8000-000000000001','guardian-actor-manager@example.test','authenticated','authenticated',now(),now()),
('fe300000-0000-4000-8000-000000000002','guardian-actor-outsider@example.test','authenticated','authenticated',now(),now()),
('fe300000-0000-4000-8000-000000000003','guardian-actor-parent@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe300000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.guardian_profiles(id,tenant_id,first_names,surname,status) values
('fe310000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Guardian','Actor','active');

insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,relationship_type,effective_from) values
('fe320000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','fe310000-0000-4000-8000-000000000001','guardian',current_date);

select throws_ok(
  $$insert into public.guardian_contacts(tenant_id,guardian_id,contact_type,contact_value,is_primary,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','fe310000-0000-4000-8000-000000000001','mobile','0810000000',false,'fe300000-0000-4000-8000-000000000002')$$,
  'Guardian contact creator is not authorized for guardian',
  'trusted contact write cannot forge an unrelated creator'
);

select lives_ok(
  $$insert into public.guardian_contacts(id,tenant_id,guardian_id,contact_type,contact_value,is_primary,created_by_user_id)
    values('fe330000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fe310000-0000-4000-8000-000000000001','email','guardian-actor-parent@example.test',true,'fe300000-0000-4000-8000-000000000001')$$,
  'authorized guardian manager can author a contact'
);

select throws_ok(
  $$update public.guardian_contacts set created_by_user_id='fe300000-0000-4000-8000-000000000002' where id='fe330000-0000-4000-8000-000000000001'$$,
  'Guardian contact creator provenance is immutable',
  'guardian contact creator cannot be rewritten'
);

select throws_ok(
  $$insert into public.guardian_addresses(tenant_id,guardian_id,address_type,address_line_1,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','fe310000-0000-4000-8000-000000000001','physical','1 Unrelated Street','fe300000-0000-4000-8000-000000000002')$$,
  'Guardian address creator is not authorized for guardian',
  'trusted address write cannot forge an unrelated creator'
);

select lives_ok(
  $$insert into public.guardian_addresses(id,tenant_id,guardian_id,address_type,address_line_1,created_by_user_id)
    values('fe340000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fe310000-0000-4000-8000-000000000001','physical','1 Verified Street','fe300000-0000-4000-8000-000000000001')$$,
  'authorized guardian manager can author an address'
);

select throws_ok(
  $$insert into public.guardian_user_links(tenant_id,guardian_id,user_id,linked_by_user_id)
    values('11111111-1111-4111-8111-111111111111','fe310000-0000-4000-8000-000000000001','fe300000-0000-4000-8000-000000000003','fe300000-0000-4000-8000-000000000002')$$,
  'Guardian user-link actor is not authorized for guardian',
  'trusted account-link write cannot forge an unrelated linker'
);

select lives_ok(
  $$insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id,linked_by_user_id)
    values('fe350000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fe310000-0000-4000-8000-000000000001','fe300000-0000-4000-8000-000000000003','fe300000-0000-4000-8000-000000000003')$$,
  'verified guardian account may self-link when its email matches an active guardian email'
);

select throws_ok(
  $$update public.guardian_user_links set linked_by_user_id='fe300000-0000-4000-8000-000000000001' where id='fe350000-0000-4000-8000-000000000001'$$,
  'Guardian user-link actor provenance is immutable',
  'guardian account-link actor cannot be rewritten'
);

select ok(
  not has_function_privilege('authenticated','app_private.user_can_manage_guardian_actor(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.user_can_claim_guardian_actor(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_can_manage_guardian_actor(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_can_claim_guardian_actor(uuid,uuid)','EXECUTE'),
  'guardian actor authority helpers remain private from client roles'
);

select is(
  (select count(*)::integer from pg_catalog.pg_trigger
   where tgname in ('guardian_contact_submit_actor_integrity_trg','guardian_address_submit_actor_integrity_trg','guardian_user_link_submit_actor_integrity_trg')
     and not tgisinternal),
  3,
  'guardian contact/address/account-link actor integrity triggers are installed once each'
);

select * from finish();
rollback;