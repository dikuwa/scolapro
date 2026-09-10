-- Runtime closure: remove the obsolete comparison contract that cannot represent
-- distinct annual subject offerings and predates the governed official-results scope.
-- The seven-argument overload introduced by 20260908114000 remains authoritative.

drop function if exists public.compare_official_result_series(
  uuid,
  uuid,
  integer,
  smallint,
  integer,
  smallint
);
