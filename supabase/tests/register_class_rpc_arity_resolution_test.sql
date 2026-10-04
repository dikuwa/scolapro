begin;

select plan(6);

select is(
  (
    select p.pronargdefaults
    from pg_proc p
    where p.oid = 'public.upsert_register_class(uuid,integer,uuid,text,text,uuid)'::regprocedure
  ),
  0::smallint,
  'home-room-aware upsert_register_class has no trailing default'
);

select is(
  (
    select p.pronargdefaults
    from pg_proc p
    where p.oid = 'public.update_register_class(uuid,uuid,text,text,uuid)'::regprocedure
  ),
  0::smallint,
  'home-room-aware update_register_class has no trailing default'
);

select throws_ok(
  $$select public.upsert_register_class(
    '22222222-2222-4222-8222-222222222222'::uuid,
    2026,
    '11111111-1111-4111-8111-111111111111'::uuid,
    '10A'::text,
    'Grade 10 A'::text
  )$$,
  'P0001',
  'Authentication required',
  'legacy five-argument upsert resolves uniquely'
);

select throws_ok(
  $$select public.upsert_register_class(
    '22222222-2222-4222-8222-222222222222'::uuid,
    2026,
    '11111111-1111-4111-8111-111111111111'::uuid,
    '10A'::text,
    'Grade 10 A'::text,
    null::uuid
  )$$,
  'P0001',
  'Authentication required',
  'home-room-aware six-argument upsert resolves uniquely'
);

select throws_ok(
  $$select public.update_register_class(
    '11111111-1111-4111-8111-111111111111'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid,
    '10A'::text,
    'Grade 10 A'::text
  )$$,
  'P0001',
  'Authentication required',
  'legacy four-argument update resolves uniquely'
);

select throws_ok(
  $$select public.update_register_class(
    '11111111-1111-4111-8111-111111111111'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid,
    '10A'::text,
    'Grade 10 A'::text,
    null::uuid
  )$$,
  'P0001',
  'Authentication required',
  'home-room-aware five-argument update resolves uniquely'
);

select * from finish();
rollback;
