-- Harden bulk-import staging so authenticated clients can inspect governed import
-- state but cannot mutate staging tables directly. All writes flow through the
-- self-authorizing SECURITY DEFINER import RPC boundary.

drop policy if exists "authorized staff manage import batches" on public.import_batches;
drop policy if exists "authorized staff manage import rows" on public.import_rows;

revoke insert, update, delete on public.import_batches from authenticated;
revoke insert, update, delete on public.import_rows from authenticated;

-- Import results are append-only products of commit RPCs; authenticated users
-- retain governed read access only.
revoke insert, update, delete on public.import_commit_results from authenticated;

comment on table public.import_batches is
  'Governed bulk-import batches. Authenticated clients have read access only; mutation is RPC-only.';
comment on table public.import_rows is
  'Source-preserving import staging rows. Authenticated clients have read access only; mutation is RPC-only.';
comment on table public.import_commit_results is
  'Append-only import commit outcomes written by governed commit RPCs and readable to authorized import managers.';
