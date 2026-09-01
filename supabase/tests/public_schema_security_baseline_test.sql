begin;

select plan(3);

select is(
  (
    select count(*)::integer
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity
  ),
  0,
  'every public table has row level security enabled'
);

select is(
  (
    select count(*)::integer
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_policies p
      on p.schemaname = n.nspname
     and p.tablename = c.relname
    where n.nspname = 'public'
      and c.relkind = 'r'
    group by n.nspname
    having count(*) filter (where p.policyname is null) > 0
  ),
  0,
  'every public table has at least one RLS policy'
);

select is(
  (
    select count(*)::integer
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'v'
      and not coalesce(c.reloptions, array[]::text[]) @> array['security_invoker=true']::text[]
  ),
  0,
  'every public view is security invoker'
);

select * from finish();
rollback;
