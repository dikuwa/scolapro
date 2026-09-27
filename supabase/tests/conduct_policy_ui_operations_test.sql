begin;
select no_plan();

insert into auth.users(id,email,aud,role) values
('d2000000-0000-4000-8000-000000000001','conduct-ui-deputy@example.test','authenticated','authenticated');
insert into public.tenants(id,name,slug) values
('d2100000-0000-4000-8000-000000000001','Conduct UI Tenant','conduct-ui');
insert into public.schools(id,tenant_id,name,status) values
('d2200000-0000-4000-8000-000000000001','d2100000-0000-4000-8000-000000000001','Conduct UI School','active');
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('d2100000-0000-4000-8000-000000000001','d2200000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','deputy_principal',current_date-1);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000001',true);

select lives_ok($$select public.ensure_conduct_starter_policy('d2200000-0000-4000-8000-000000000001')$$,'deputy principal can provision starter policy');
select lives_ok($$select public.reorder_conduct_policy_group((select id from public.conduct_policy_groups where school_id='d2200000-0000-4000-8000-000000000001' and code='ACADEMIC'),'up')$$,'group can move up');
select is((select sort_order::integer from public.conduct_policy_groups where school_id='d2200000-0000-4000-8000-000000000001' and code='ACADEMIC'),10,'group reorder normalizes order');
select lives_ok($$select public.reorder_conduct_policy_category((select id from public.conduct_policy_categories where school_id='d2200000-0000-4000-8000-000000000001' and code='REC_GEN_02'),'up')$$,'conduct item can move up');
select is((select sort_order::integer from public.conduct_policy_categories where school_id='d2200000-0000-4000-8000-000000000001' and code='REC_GEN_02'),10,'item reorder normalizes order');

select lives_ok($$select public.retire_conduct_policy_group((select id from public.conduct_policy_groups where school_id='d2200000-0000-4000-8000-000000000001' and code='GENERAL'))$$,'group archives');
select lives_ok($$select public.restore_conduct_policy_group((select id from public.conduct_policy_groups where school_id='d2200000-0000-4000-8000-000000000001' and code='GENERAL'))$$,'group restores');
select ok((select active from public.conduct_policy_groups where school_id='d2200000-0000-4000-8000-000000000001' and code='GENERAL'),'restored group is active');

select lives_ok($$select public.retire_conduct_policy_category((select id from public.conduct_policy_categories where school_id='d2200000-0000-4000-8000-000000000001' and code='REC_GEN_01'))$$,'item archives');
select lives_ok($$select public.restore_conduct_policy_category((select id from public.conduct_policy_categories where school_id='d2200000-0000-4000-8000-000000000001' and code='REC_GEN_01'))$$,'item restores');
select ok((select active from public.conduct_policy_categories where school_id='d2200000-0000-4000-8000-000000000001' and code='REC_GEN_01'),'restored item is active');

select ok(not has_function_privilege('authenticated','app_private.can_manage_conduct_policy(uuid)','EXECUTE'),'policy authority helper stays private');
reset role;
select * from finish();
rollback;
