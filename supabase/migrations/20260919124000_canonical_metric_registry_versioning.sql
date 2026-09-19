-- Issue #555: N24 canonical metric registry versioning hardening.
--
-- The registry already carries effective_from/effective_to metadata, but metric_key
-- alone was the primary key, preventing multiple historical definition versions.
-- Keep the single canonical registry and make its effective-dated model real.

alter table public.canonical_metric_registry
  drop constraint canonical_metric_registry_pkey;

alter table public.canonical_metric_registry
  add constraint canonical_metric_registry_pkey
  primary key (metric_key, effective_from);

alter table public.canonical_metric_registry
  add constraint canonical_metric_registry_no_overlapping_versions
  exclude using gist (
    metric_key with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  );

comment on table public.canonical_metric_registry is
'Canonical effective-dated metric metadata registry. Multiple non-overlapping definition versions may exist for one metric_key; definitions remain descriptive only and contain no executable SQL, learner identifiers or school-level fact values.';
