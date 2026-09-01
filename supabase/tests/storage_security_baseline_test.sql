begin;

select plan(3);

select is(
  (
    select count(*)::integer
    from storage.buckets
    where id in (
      'attendance-evidence',
      'guardian-absence-evidence',
      'learner-photos',
      'report-card-artifacts'
    )
      and public
  ),
  0,
  'sensitive school evidence and report-card buckets remain private'
);

select is(
  (
    select array_agg(id order by id)::text[]
    from storage.buckets
    where public
  ),
  array['avatars']::text[],
  'avatars are the only public storage bucket'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        'anon' = any(roles::text[])
        or 'public' = any(roles::text[])
      )
  ),
  0,
  'storage object policies do not grant anonymous or public role access'
);

select * from finish();
rollback;
