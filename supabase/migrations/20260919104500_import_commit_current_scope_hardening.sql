-- Import commit authority must use the canonical current-school/platform boundary.
-- Legacy learner/staff/guardian commit RPCs still perform a broader has_school_role()
-- check before transitioning a batch to committing. Enforce the canonical predicate at
-- the batch state boundary so stale/non-current school authority and Platform Support
-- cannot reach authoritative writes, while governed Platform Admin access is preserved.

create or replace function app_private.enforce_import_commit_authority()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if new.status = 'committing' and old.status is distinct from new.status then
    if (select auth.uid()) is null then
      raise exception 'Authentication required';
    end if;
    if not app_private.can_manage_school_imports(new.school_id) then
      raise exception 'Permission denied';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_import_commit_authority() from public, anon, authenticated;

drop trigger if exists import_batch_commit_authority_trg on public.import_batches;
create trigger import_batch_commit_authority_trg
before update of status on public.import_batches
for each row
when (new.status = 'committing' and old.status is distinct from new.status)
execute function app_private.enforce_import_commit_authority();

comment on function app_private.enforce_import_commit_authority() is
'Enforces canonical current-school/import authority whenever a batch enters committing, closing legacy commit RPC role checks without duplicating import engines.';
