begin;

select plan(1);

select throws_ok(
  $$
    insert into public.promotion_rule_conditions(
      tenant_id,school_id,promotion_rule_set_id,condition_code,condition_type,threshold,required,configuration,sort_order
    )
    select tenant_id,school_id,id,'CI-ACTIVE-GUARD','minimum_attendance_rate',80,true,'{}'::jsonb,999
    from public.promotion_rule_sets
    where status='active'
    limit 1
  $$,
  'Conditions can only be edited while the promotion rule version is draft',
  'behavior fixtures must respect immutable active promotion-rule versions'
);

select * from finish();
rollback;
