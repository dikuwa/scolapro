-- #917: harden the immutable term-array helper against role-mutated search_path.
--
-- The function only needs PostgreSQL built-ins (array_length, unnest,
-- cardinality), all of which resolve from pg_catalog. Pinning the path removes
-- ambient-schema lookup without changing function semantics.
alter function app_private.valid_three_term_array(smallint[])
  set search_path = pg_catalog;
