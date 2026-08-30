begin;

select plan(3);

select ok(
  not has_table_privilege('authenticated','public.guardian_profiles','DELETE'),
  'authenticated application users cannot hard-delete reusable guardian identities'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname='public'
      and tablename='guardian_profiles'
      and cmd='DELETE'
      and roles @> array['authenticated']::name[]
  ),
  0,
  'guardian profiles expose no authenticated delete RLS path'
);

select ok(
  has_table_privilege('authenticated','public.guardian_profiles','SELECT'),
  'delete protection does not remove governed guardian read access'
);

select * from finish();
rollback;
