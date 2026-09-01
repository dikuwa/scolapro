begin;

select plan(2);

select is(
  (
    select count(*)::integer
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where c.contype='f'
      and n.nspname='public'
      and t.relname = any(array[
        'communication_delivery_receipts',
        'communication_messages',
        'communication_provider_template_bindings',
        'communication_template_versions',
        'communication_templates',
        'detention_supervision_preferences',
        'learner_cumulative_notes',
        'learner_development_observations',
        'learner_health_history',
        'learner_prior_school_history',
        'learner_psychometric_records'
      ])
  ),
  58,
  'post-staging closure tables retain the expected foreign-key surface'
);

with target_fk as (
  select c.conrelid, c.conkey
  from pg_constraint c
  join pg_class t on t.oid=c.conrelid
  join pg_namespace n on n.oid=t.relnamespace
  where c.contype='f'
    and n.nspname='public'
    and t.relname = any(array[
      'communication_delivery_receipts',
      'communication_messages',
      'communication_provider_template_bindings',
      'communication_template_versions',
      'communication_templates',
      'detention_supervision_preferences',
      'learner_cumulative_notes',
      'learner_development_observations',
      'learner_health_history',
      'learner_prior_school_history',
      'learner_psychometric_records'
    ])
), uncovered as (
  select 1
  from target_fk f
  where not exists (
    select 1
    from pg_index i
    where i.indrelid=f.conrelid
      and i.indisvalid
      and i.indisready
      and (i.indkey::smallint[])[0:cardinality(f.conkey)-1] = f.conkey::smallint[]
  )
)
select is(
  (select count(*)::integer from uncovered),
  0,
  'all foreign keys on post-staging closure tables have a covering index'
);

select * from finish();
rollback;
