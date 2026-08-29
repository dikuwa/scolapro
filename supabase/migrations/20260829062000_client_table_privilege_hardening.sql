-- Supabase grants broad table privileges to authenticated/anon by default. RLS governs
-- row-level DML, but TRUNCATE bypasses RLS and TRIGGER/REFERENCES are not application
-- client capabilities. Remove those privileges from every public base table while
-- leaving existing SELECT/INSERT/UPDATE/DELETE grants and RLS policies intact.

do $$
declare
  v_table record;
begin
  for v_table in
    select tablename
    from pg_tables
    where schemaname = 'public'
    order by tablename
  loop
    execute format(
      'revoke truncate, trigger, references on table public.%I from authenticated, anon',
      v_table.tablename
    );
  end loop;
end;
$$;

comment on schema public is
  'Application schema. Client roles do not receive TRUNCATE, TRIGGER or REFERENCES on base tables; row-level application access remains governed by explicit RLS and RPC boundaries.';
