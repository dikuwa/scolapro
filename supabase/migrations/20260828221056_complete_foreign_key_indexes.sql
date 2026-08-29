-- Ensure every public-schema foreign key has a valid leading-column index.
-- Existing composite indexes are reused when their leading columns match the FK;
-- only uncovered relationships receive a narrow btree index.

do $$
declare
  fk record;
  column_list text;
  index_name text;
begin
  for fk in
    select c.oid, c.conrelid, c.conname, c.conkey,
           n.nspname as schema_name, t.relname as table_name
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where c.contype='f'
      and n.nspname='public'
      and not exists (
        select 1
        from pg_index i
        where i.indrelid=c.conrelid
          and i.indisvalid
          and i.indisready
          and array_length(i.indkey::smallint[],1) >= array_length(c.conkey,1)
          and not exists (
            select 1
            from unnest(c.conkey) with ordinality as ck(attnum,ord)
            where (i.indkey::smallint[])[ck.ord-1] <> ck.attnum
          )
      )
  loop
    select string_agg(format('%I',a.attname),', ' order by ck.ord)
      into column_list
    from unnest(fk.conkey) with ordinality as ck(attnum,ord)
    join pg_attribute a on a.attrelid=fk.conrelid and a.attnum=ck.attnum;

    index_name := left('fkidx_' || fk.table_name || '_' || substr(md5(fk.conname),1,10),63);
    execute format('create index if not exists %I on %I.%I (%s)',
      index_name,fk.schema_name,fk.table_name,column_list);
  end loop;
end
$$;
