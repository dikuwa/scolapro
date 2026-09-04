begin;

select plan(9);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_promotion_rule_creator_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_promotion_rule_creator_integrity()','EXECUTE'),
  'promotion-rule creator helper remains private'
);

select trigger_is(
  'public','promotion_rule_sets','promotion_rule_creator_integrity_trg',
  'app_private','enforce_promotion_rule_creator_integrity',
  'promotion-rule creator trigger is installed'
);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('f6f00000-0000-4000-8000-000000000001','promotion-rule-hod@example.test','authenticated','authenticated',now(),now()),
('f6f00000-0000-4000-8000-000000000002','promotion-rule-principal@example.test','authenticated','authenticated',now(),now()),
('f6f00000-0000-4000-8000-000000000003','promotion-rule-unrelated@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6f00000-0000-4000-8000-000000000001','hod',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6f00000-0000-4000-8000-000000000002','principal',current_date);

select throws_ok(
  $$insert into public.promotion_rule_sets(tenant_id,school_id,academic_year,grade_id,rule_set_key,version,result_term_number,source_reference,effective_from,status,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'30000000-0000-4000-8000-000000000010','FORGED','v1',3,'Test source',current_date,'draft','f6f00000-0000-4000-8000-000000000003')$$,
  'Promotion rule creator is not authorized for school',
  'trusted path cannot forge unrelated promotion-rule creator'
);

select lives_ok(
  $$insert into public.promotion_rule_sets(id,tenant_id,school_id,academic_year,grade_id,rule_set_key,version,result_term_number,source_reference,effective_from,status,created_by_user_id)
    values('f6f10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'30000000-0000-4000-8000-000000000010','VALID','v1',3,'Test source',current_date,'draft','f6f00000-0000-4000-8000-000000000001')$$,
  'trusted path can record authorized promotion-rule creator'
);

select lives_ok(
  $$update public.promotion_rule_sets set source_reference='Revised draft source' where id='f6f10000-0000-4000-8000-000000000001'$$,
  'ordinary draft promotion-rule edits remain allowed'
);

select throws_ok(
  $$update public.promotion_rule_sets set created_by_user_id='f6f00000-0000-4000-8000-000000000002' where id='f6f10000-0000-4000-8000-000000000001'$$,
  'Promotion rule creator provenance is immutable',
  'draft creator cannot be rewritten to another authorized academic leader'
);

select set_config('request.jwt.claim.sub','f6f00000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select throws_ok(
  $$insert into public.promotion_rule_sets(tenant_id,school_id,academic_year,grade_id,rule_set_key,version,result_term_number,source_reference,effective_from,status,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'30000000-0000-4000-8000-000000000010','CLIENT-FORGED','v1',3,'Test source',current_date,'draft','f6f00000-0000-4000-8000-000000000002')$$,
  'Promotion rule creator must match authenticated actor',
  'authenticated academic leader cannot claim another manager as creator'
);

select lives_ok(
  $$insert into public.promotion_rule_sets(tenant_id,school_id,academic_year,grade_id,rule_set_key,version,result_term_number,source_reference,effective_from,status,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'30000000-0000-4000-8000-000000000010','CLIENT-OWN','v1',3,'Test source',current_date,'draft','f6f00000-0000-4000-8000-000000000001')$$,
  'authenticated academic leader can create promotion rule under own identity'
);

reset role;

select ok(
  (select with_check from pg_policies where schemaname='public' and tablename='promotion_rule_sets' and policyname='academic leaders can manage promotion rule sets [insert]') ilike '%created_by_user_id%auth.uid%',
  'promotion-rule insert RLS binds creator to authenticated actor'
);

select * from finish();
rollback;