-- Close the remaining table-level privilege surface on import staging.
-- SECURITY DEFINER import RPCs remain the only mutation boundary.

drop policy if exists "authorized staff manage import batches [insert]" on public.import_batches;
drop policy if exists "authorized staff manage import batches [update]" on public.import_batches;
drop policy if exists "authorized staff manage import batches [delete]" on public.import_batches;
drop policy if exists "authorized staff manage import rows [insert]" on public.import_rows;
drop policy if exists "authorized staff manage import rows [update]" on public.import_rows;
drop policy if exists "authorized staff manage import rows [delete]" on public.import_rows;

revoke all privileges on public.import_batches from authenticated, anon;
revoke all privileges on public.import_rows from authenticated, anon;
revoke all privileges on public.import_commit_results from authenticated, anon;

grant select on public.import_batches to authenticated;
grant select on public.import_rows to authenticated;
grant select on public.import_commit_results to authenticated;

comment on table public.import_batches is
  'Governed bulk-import batches. Authenticated clients have SELECT only; all mutation including truncate/trigger privileges is withheld and writes are RPC-only.';
comment on table public.import_rows is
  'Source-preserving import staging rows. Authenticated clients have SELECT only; all mutation including truncate/trigger privileges is withheld and writes are RPC-only.';
comment on table public.import_commit_results is
  'Append-only import commit outcomes. Authenticated clients have SELECT only; commit RPCs own the write boundary.';
