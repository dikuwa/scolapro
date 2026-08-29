begin;

select plan(5);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fb000000-0000-4000-8000-000000000001','promotion-test-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fb000000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.promotion_rule_sets(
  id,tenant_id,school_id,academic_year,grade_id,rule_set_key,version,result_term_number,pass_outcome,fail_outcome,source_reference,effective_from,status,created_by_user_id
)
values(
  'fb100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'30000000-0000-4000-8000-000000000010','TEST-CONFIGURED','1',3,'promoted','not_promoted','Behavioral test only — not Namibia policy',current_date-30,'active','fb000000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select is(
  public.evaluate_promotion_recommendation('60000000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000001')->>'passed',
  'false',
  'promotion evaluator fails safely when official results are absent'
);

select is(
  public.evaluate_promotion_recommendation('60000000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000001')->>'recommended_outcome',
  'not_promoted',
  'configured fail outcome is used rather than an inferred grade rule'
);

select ok(
  public.evaluate_promotion_recommendation('60000000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000001')->'failures' @> '[{"code":"no_official_results","type":"data_readiness"}]'::jsonb,
  'missing official results are exposed as an explicit data-readiness failure'
);

select lives_ok(
  $$select public.generate_year_end_progression('60000000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000001')$$,
  'progression generator records the explainable configured recommendation for review'
);

select throws_ok(
  $$select public.evaluate_promotion_recommendation('60000000-0000-4000-8000-000000000002', 'fb100000-0000-4000-8000-000000000001')$$,
  'Promotion rule set does not match enrolment scope',
  'promotion evaluator rejects an enrolment outside the rule-set grade/class scope'
);

select * from finish();
rollback;
