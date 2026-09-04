begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fe000000-0000-4000-8000-000000000001','promotion-version-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe000000-0000-4000-8000-000000000001','hod',current_date);

insert into public.promotion_rule_sets(
  id,tenant_id,school_id,academic_year,grade_id,rule_set_key,version,
  result_term_number,pass_outcome,fail_outcome,source_reference,effective_from,
  status,created_by_user_id
) values (
  'fe100000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2026,'30000000-0000-4000-8000-000000000010',
  'TEST_VERSIONED_POLICY','v1',3,'promoted','not_promoted','Authoritative test source',
  '2026-01-01','draft','fe000000-0000-4000-8000-000000000001'
);

insert into public.promotion_rule_conditions(
  id,tenant_id,school_id,promotion_rule_set_id,condition_code,condition_type,
  threshold,required,sort_order
) values (
  'fe200000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fe100000-0000-4000-8000-000000000001',
  'MIN_SUBJECTS','minimum_passed_subjects',5,true,10
);

select lives_ok(
  $$update public.promotion_rule_conditions set threshold=6 where id='fe200000-0000-4000-8000-000000000001'$$,
  'conditions remain editable while their rule version is draft'
);

select lives_ok(
  $$update public.promotion_rule_sets set status='active',updated_at=now() where id='fe100000-0000-4000-8000-000000000001'$$,
  'draft rule version can be activated'
);

select throws_ok(
  $$update public.promotion_rule_conditions set threshold=7 where id='fe200000-0000-4000-8000-000000000001'$$,
  'Conditions of an activated promotion rule version are immutable',
  'activated rule conditions cannot be rewritten in place'
);

select throws_ok(
  $$insert into public.promotion_rule_conditions(tenant_id,school_id,promotion_rule_set_id,condition_code,condition_type,threshold)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe100000-0000-4000-8000-000000000001','LATE_CONDITION','maximum_failed_subjects',2)$$,
  'Conditions can only be edited while the promotion rule version is draft',
  'new conditions cannot be appended to an activated version'
);

select throws_ok(
  $$update public.promotion_rule_sets set pass_outcome='condoned' where id='fe100000-0000-4000-8000-000000000001'$$,
  'Activated promotion rule version content is immutable',
  'activated rule-set semantics cannot be rewritten while keeping the same version label'
);

select lives_ok(
  $$update public.promotion_rule_sets set status='superseded',updated_at=now() where id='fe100000-0000-4000-8000-000000000001'$$,
  'active rule version can be retired as superseded without changing its content'
);

select throws_ok(
  $$update public.promotion_rule_sets set status='active' where id='fe100000-0000-4000-8000-000000000001'$$,
  'Terminal promotion rule versions are immutable',
  'superseded rule version cannot be reactivated'
);

select throws_ok(
  $$delete from public.promotion_rule_sets where id='fe100000-0000-4000-8000-000000000001'$$,
  'Activated promotion rule versions cannot be deleted',
  'superseded policy provenance cannot be deleted'
);

select * from finish();
rollback;