begin;

select plan(10);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fe400000-0000-4000-8000-000000000001','comms-author@example.test','authenticated','authenticated',now(),now()),
  ('fe400000-0000-4000-8000-000000000002','comms-other@example.test','authenticated','authenticated',now(),now()),
  ('fe400000-0000-4000-8000-000000000003','comms-principal@example.test','authenticated','authenticated',now(),now()),
  ('fe400000-0000-4000-8000-000000000004','comms-counsellor@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe400000-0000-4000-8000-000000000001','teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe400000-0000-4000-8000-000000000002','teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe400000-0000-4000-8000-000000000003','principal',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe400000-0000-4000-8000-000000000004','counsellor',current_date);

insert into public.communication_messages(
  id,tenant_id,school_id,channel,subject,body,audience_type,status,sensitive,created_by_user_id
) values
  ('fe410000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','app','Routine class note','Routine communication','individual','draft',false,'fe400000-0000-4000-8000-000000000001'),
  ('fe410000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','email','Sensitive parent note','Sensitive communication','individual','draft',true,'fe400000-0000-4000-8000-000000000001');

insert into public.communication_recipients(
  id,tenant_id,school_id,message_id,user_id,destination
) values
  ('fe420000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe410000-0000-4000-8000-000000000001','fe400000-0000-4000-8000-000000000003','principal@example.test'),
  ('fe420000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe410000-0000-4000-8000-000000000002','fe400000-0000-4000-8000-000000000003','private-parent@example.test');

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','fe400000-0000-4000-8000-000000000001',true);
select is(app_private.can_author_communications('22222222-2222-4222-8222-222222222222'),true,'teacher may author communications');
select is(app_private.can_read_communication('fe410000-0000-4000-8000-000000000002'),true,'message author can read own sensitive draft');

select set_config('request.jwt.claim.sub','fe400000-0000-4000-8000-000000000002',true);
select is(app_private.can_author_communications('22222222-2222-4222-8222-222222222222'),true,'another teacher may author own communications');
select is(app_private.can_read_communication('fe410000-0000-4000-8000-000000000001'),false,'ordinary teacher cannot browse another teacher routine message ledger');
select is(app_private.can_read_communication('fe410000-0000-4000-8000-000000000002'),false,'ordinary teacher cannot browse another teacher sensitive message or recipient destination');

select set_config('request.jwt.claim.sub','fe400000-0000-4000-8000-000000000004',true);
select is(app_private.can_read_communication('fe410000-0000-4000-8000-000000000001'),true,'counsellor may read non-sensitive school communication for support coordination');
select is(app_private.can_read_communication('fe410000-0000-4000-8000-000000000002'),false,'counsellor does not automatically inherit sensitive message access');

select set_config('request.jwt.claim.sub','fe400000-0000-4000-8000-000000000003',true);
select is(app_private.can_read_communication('fe410000-0000-4000-8000-000000000002'),true,'principal has governed school communication oversight');

select set_config('request.jwt.claim.sub','fe400000-0000-4000-8000-000000000001',true);
select is(public.queue_communication('fe410000-0000-4000-8000-000000000001'),true,'author can queue own draft with recipient');
select is((select status from public.communication_messages where id='fe410000-0000-4000-8000-000000000001'),'queued','queue workflow advances canonical message state');

select * from finish();
rollback;