begin;

select plan(21);

select ok(has_table_privilege('authenticated','public.import_batches','SELECT'),'authenticated can read governed import batches');
select ok(not has_table_privilege('authenticated','public.import_batches','INSERT'),'authenticated cannot insert import batches directly');
select ok(not has_table_privilege('authenticated','public.import_batches','UPDATE'),'authenticated cannot update import batches directly');
select ok(not has_table_privilege('authenticated','public.import_batches','DELETE'),'authenticated cannot delete import batches directly');
select ok(not has_table_privilege('authenticated','public.import_batches','TRUNCATE'),'authenticated cannot truncate import batches');
select ok(not has_table_privilege('authenticated','public.import_batches','TRIGGER'),'authenticated cannot create triggers on import batches');
select ok(not has_table_privilege('authenticated','public.import_batches','REFERENCES'),'authenticated cannot create references against import batches');

select ok(has_table_privilege('authenticated','public.import_rows','SELECT'),'authenticated can read governed import rows');
select ok(not has_table_privilege('authenticated','public.import_rows','INSERT'),'authenticated cannot insert import rows directly');
select ok(not has_table_privilege('authenticated','public.import_rows','UPDATE'),'authenticated cannot update import rows directly');
select ok(not has_table_privilege('authenticated','public.import_rows','DELETE'),'authenticated cannot delete import rows directly');
select ok(not has_table_privilege('authenticated','public.import_rows','TRUNCATE'),'authenticated cannot truncate import rows');
select ok(not has_table_privilege('authenticated','public.import_rows','TRIGGER'),'authenticated cannot create triggers on import rows');
select ok(not has_table_privilege('authenticated','public.import_rows','REFERENCES'),'authenticated cannot create references against import rows');

select ok(has_table_privilege('authenticated','public.import_commit_results','SELECT'),'authenticated can read governed import commit results');
select ok(not has_table_privilege('authenticated','public.import_commit_results','INSERT'),'authenticated cannot insert import commit results directly');
select ok(not has_table_privilege('authenticated','public.import_commit_results','UPDATE'),'authenticated cannot update import commit results directly');
select ok(not has_table_privilege('authenticated','public.import_commit_results','DELETE'),'authenticated cannot delete import commit results directly');
select ok(not has_table_privilege('authenticated','public.import_commit_results','TRUNCATE'),'authenticated cannot truncate import commit results');
select ok(not has_table_privilege('authenticated','public.import_commit_results','TRIGGER'),'authenticated cannot create triggers on import commit results');
select ok(not has_table_privilege('authenticated','public.import_commit_results','REFERENCES'),'authenticated cannot create references against import commit results');

select * from finish();
rollback;
