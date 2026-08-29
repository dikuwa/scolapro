-- Base tables were hardened separately. PostgreSQL relation grants can also expose
-- TRUNCATE/TRIGGER/REFERENCES bits on views through broad default grants, even though
-- application clients only need SELECT on read models. Remove those bits from every
-- public relation that is not a base table as well.

do $$
declare
  v_relation record;
begin
  for v_relation in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('v','m','p','f')
    order by c.relname
  loop
    execute format(
      'revoke truncate, trigger, references on table public.%I from authenticated, anon',
      v_relation.relname
    );
  end loop;
end;
$$;
