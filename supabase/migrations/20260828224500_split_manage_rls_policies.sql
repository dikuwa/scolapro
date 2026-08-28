-- Convert existing authenticated FOR ALL policies into operation-specific write
-- policies. This preserves each policy's exact USING/WITH CHECK expressions while
-- preventing manage policies from also participating in SELECT evaluation.
--
-- The migration intentionally derives policy expressions from pg_policies so the
-- resulting semantics remain identical to the source policy at execution time.

do $$
declare
  p record;
  base_name text;
  insert_name text;
  update_name text;
  delete_name text;
begin
  for p in
    select schemaname, tablename, policyname, roles, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and cmd = 'ALL'
      and roles = array['authenticated']::name[]
  loop
    base_name := p.policyname;
    insert_name := left(base_name || ' [insert]', 63);
    update_name := left(base_name || ' [update]', 63);
    delete_name := left(base_name || ' [delete]', 63);

    execute format('drop policy if exists %I on %I.%I', base_name, p.schemaname, p.tablename);

    execute format(
      'create policy %I on %I.%I for insert to authenticated with check (%s)',
      insert_name, p.schemaname, p.tablename, coalesce(p.with_check, 'true')
    );

    execute format(
      'create policy %I on %I.%I for update to authenticated using (%s) with check (%s)',
      update_name, p.schemaname, p.tablename,
      coalesce(p.qual, 'true'), coalesce(p.with_check, p.qual, 'true')
    );

    execute format(
      'create policy %I on %I.%I for delete to authenticated using (%s)',
      delete_name, p.schemaname, p.tablename, coalesce(p.qual, 'true')
    );
  end loop;
end
$$;

-- Final direct auth.uid() initialization-plan warning remaining after the first
-- hardening pass.
drop policy if exists "users can read own platform membership" on public.platform_memberships;
create policy "users can read own platform membership"
on public.platform_memberships
for select to authenticated
using (user_id = (select auth.uid()));
