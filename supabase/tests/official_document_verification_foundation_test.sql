begin;

select plan(20);

insert into public.tenants(id, name, slug) values
  ('70710000-0000-4000-8000-000000000001', 'Verification Tenant A', 'verification-tenant-a'),
  ('70710000-0000-4000-8000-000000000002', 'Verification Tenant B', 'verification-tenant-b');

insert into public.schools(id, tenant_id, name, emis_number, status) values
  ('70720000-0000-4000-8000-000000000001', '70710000-0000-4000-8000-000000000001', 'Verification School A', 'VER-A', 'active'),
  ('70720000-0000-4000-8000-000000000002', '70710000-0000-4000-8000-000000000002', 'Verification School B', 'VER-B', 'active');

create temporary table test_verifications (
  label text primary key,
  verification_id uuid,
  scolapro_reference text,
  verification_token text,
  verification_path text
) on commit drop;

grant select on test_verifications to anon;

select is(
  (select count(*)::integer from public.official_document_type_registry),
  3,
  'the shared registry declares the current architectural consumers'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.register_official_document_verification(uuid,uuid,text,uuid,uuid,integer,uuid,date,timestamptz,uuid)',
    'EXECUTE'
  ) and not has_function_privilege(
    'anon',
    'app_private.register_official_document_verification(uuid,uuid,text,uuid,uuid,integer,uuid,date,timestamptz,uuid)',
    'EXECUTE'
  ),
  'registration is a trusted finalization hook, not an application RPC'
);

select throws_ok(
  $$select * from app_private.register_official_document_verification(
    '70710000-0000-4000-8000-000000000001',
    '70720000-0000-4000-8000-000000000001',
    'official_attendance_summary',
    '70730000-0000-4000-8000-000000000001',
    '70740000-0000-4000-8000-000000000001',
    1, null, date '2026-09-24', null, null
  )$$,
  'P0001',
  'Draft or non-finalized documents cannot be registered for public verification',
  'drafts receive no public verification'
);

select throws_ok(
  $$select * from app_private.register_official_document_verification(
    '70710000-0000-4000-8000-000000000002',
    '70720000-0000-4000-8000-000000000001',
    'official_attendance_summary',
    '70730000-0000-4000-8000-000000000002',
    '70740000-0000-4000-8000-000000000002',
    1, null, date '2026-09-24', timestamptz '2026-09-24 08:00:00+00', null
  )$$,
  'P0001',
  'Official document tenant and school scope do not match',
  'cross-tenant school substitution is rejected'
);

insert into test_verifications
select 'a-r1', r.*
from app_private.register_official_document_verification(
  '70710000-0000-4000-8000-000000000001',
  '70720000-0000-4000-8000-000000000001',
  'official_attendance_summary',
  '70730000-0000-4000-8000-000000000011',
  '70740000-0000-4000-8000-000000000011',
  1, null, date '2026-09-24', timestamptz '2026-09-24 08:00:00+00', null
) r;

insert into test_verifications
select 'b-r1', r.*
from app_private.register_official_document_verification(
  '70710000-0000-4000-8000-000000000002',
  '70720000-0000-4000-8000-000000000002',
  'official_attendance_summary',
  '70730000-0000-4000-8000-000000000011',
  '70740000-0000-4000-8000-000000000021',
  1, null, date '2026-09-24', timestamptz '2026-09-24 08:05:00+00', null
) r;

select is(
  length((select verification_token from test_verifications where label = 'a-r1')),
  32,
  'verification tokens carry 192 bits encoded as 32 base64url characters'
);

select matches(
  (select verification_token from test_verifications where label = 'a-r1'),
  '^[A-Za-z0-9_-]{32}$',
  'verification tokens are URL-safe and opaque'
);

select isnt(
  (select verification_token from test_verifications where label = 'a-r1'),
  (select verification_token from test_verifications where label = 'b-r1'),
  'separate registrations receive non-enumerable random tokens'
);

select ok(
  (select token_hash = extensions.digest(verification_token, 'sha256')
   from public.official_document_verifications
   where id = (select verification_id from test_verifications where label = 'a-r1')),
  'the public lookup key is the SHA-256 token hash'
);

select matches(
  (select scolapro_reference from test_verifications where label = 'a-r1'),
  '^SP-ATT-2026-[0-9]{6}$',
  'finalized versions receive a stable ScolaPro reference'
);

select ok(
  not has_table_privilege('anon', 'public.official_document_verifications', 'SELECT')
  and not has_table_privilege('authenticated', 'public.official_document_verifications', 'SELECT'),
  'raw tokens, tenant scope, and private source links are not directly readable'
);

set local role anon;

select is(
  (select school_name || '|' || validity_status || '|' || revision::text
   from public.resolve_official_document_verification(
     (select verification_token from test_verifications where label = 'a-r1')
   )),
  'Verification School A|valid|1',
  'a valid opaque token resolves only its minimal public provenance'
);

select is(
  (select count(*)::integer from public.resolve_official_document_verification('not-a-valid-token')),
  0,
  'invalid tokens fail closed without provenance'
);

select is(
  (select school_name
   from public.resolve_official_document_verification(
     (select verification_token from test_verifications where label = 'b-r1')
   )),
  'Verification School B',
  'a token cannot be used to traverse into another tenant record'
);

reset role;

insert into test_verifications
select 'a-r2', r.*
from app_private.register_official_document_verification(
  '70710000-0000-4000-8000-000000000001',
  '70720000-0000-4000-8000-000000000001',
  'official_attendance_summary',
  '70730000-0000-4000-8000-000000000012',
  '70740000-0000-4000-8000-000000000011',
  2,
  (select verification_id from test_verifications where label = 'a-r1'),
  date '2026-09-24', timestamptz '2026-09-24 09:00:00+00', null
) r;

select is(
  (select status from public.official_document_verifications
   where id = (select verification_id from test_verifications where label = 'a-r1')),
  'superseded',
  'registering the next finalized revision explicitly supersedes its predecessor'
);

set local role anon;

select is(
  (select validity_status || '|' || revision::text
   from public.resolve_official_document_verification(
     (select verification_token from test_verifications where label = 'a-r1')
   )),
  'superseded|1',
  'a superseded revision remains independently verifiable'
);

select is(
  (select validity_status || '|' || revision::text
   from public.resolve_official_document_verification(
     (select verification_token from test_verifications where label = 'a-r2')
   )),
  'valid|2',
  'the replacement finalized revision has its own valid token'
);

reset role;

select app_private.revoke_official_document_verification(
  (select verification_id from test_verifications where label = 'a-r2'),
  'Administrative revocation test',
  null
);

set local role anon;

select is(
  (select validity_status
   from public.resolve_official_document_verification(
     (select verification_token from test_verifications where label = 'a-r2')
   )),
  'revoked',
  'revoked tokens fail safely with a minimal revoked status'
);

reset role;

select throws_ok(
  format(
    $$select * from app_private.register_official_document_verification(
      '70710000-0000-4000-8000-000000000001',
      '70720000-0000-4000-8000-000000000001',
      'official_attendance_summary',
      '70730000-0000-4000-8000-000000000013',
      '70740000-0000-4000-8000-000000000011',
      3, %L::uuid, date '2026-09-24', timestamptz '2026-09-24 10:00:00+00', null
    )$$,
    (select verification_id from test_verifications where label = 'a-r2')
  ),
  'P0001',
  'Official document revision provenance is invalid',
  'a revoked verification cannot become the parent of a new public revision'
);

select is(
  (select count(*)::integer
   from public.official_document_verifications
   where source_record_id = '70730000-0000-4000-8000-000000000001'),
  0,
  'the rejected draft left no verification record'
);

select is(
  position(
    'tenant_id' in pg_get_function_result(
      'public.resolve_official_document_verification(text)'::regprocedure
    )
  ),
  0,
  'the public resolver contract excludes tenant and private-source identifiers'
);

select * from finish();
rollback;
