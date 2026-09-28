begin;

select plan(35);

select has_table('public','statutory_code_sets','versioned statutory code sets exist');
select has_table('public','statutory_codes','statutory codes exist');
select has_table('public','statutory_code_mappings','canonical statutory mappings exist');
select ok((select relrowsecurity from pg_class where oid='public.statutory_code_sets'::regclass),'code sets use RLS');
select ok((select relrowsecurity from pg_class where oid='public.statutory_codes'::regclass),'codes use RLS');
select ok((select relrowsecurity from pg_class where oid='public.statutory_code_mappings'::regclass),'mappings use RLS');

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('858a0000-0000-4000-8000-000000000001','registry-platform@example.test','authenticated','authenticated',now(),now()),
  ('858a0000-0000-4000-8000-000000000002','registry-school-a@example.test','authenticated','authenticated',now(),now()),
  ('858a0000-0000-4000-8000-000000000003','registry-support@example.test','authenticated','authenticated',now(),now()),
  ('858a0000-0000-4000-8000-000000000004','registry-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key,active_from) values
  ('858a0000-0000-4000-8000-000000000001','platform_admin',current_date),
  ('858a0000-0000-4000-8000-000000000003','platform_support',current_date);

insert into public.tenants(id,name,slug) values
  ('858b0000-0000-4000-8000-000000000001','Registry Tenant A','registry-tenant-a'),
  ('858b0000-0000-4000-8000-000000000002','Registry Tenant B','registry-tenant-b');

insert into public.schools(id,tenant_id,name,status) values
  ('858c0000-0000-4000-8000-000000000001','858b0000-0000-4000-8000-000000000001','Registry School A','active'),
  ('858c0000-0000-4000-8000-000000000002','858b0000-0000-4000-8000-000000000002','Registry School B','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('858b0000-0000-4000-8000-000000000001','858c0000-0000-4000-8000-000000000001','858a0000-0000-4000-8000-000000000002','school_admin',current_date),
  ('858b0000-0000-4000-8000-000000000001','858c0000-0000-4000-8000-000000000001','858a0000-0000-4000-8000-000000000004','teacher',current_date);

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status) values
  ('858d0000-0000-4000-8000-000000000001','858b0000-0000-4000-8000-000000000001','858c0000-0000-4000-8000-000000000001','BIO-A','Biology A','active'),
  ('858d0000-0000-4000-8000-000000000002','858b0000-0000-4000-8000-000000000002','858c0000-0000-4000-8000-000000000002','BIO-B','Biology B','active');

insert into public.statutory_code_sets(
  id,set_key,authority,version_key,effective_from,effective_to,status,source_reference
) values
  ('858e0000-0000-4000-8000-000000000001','TEST_AEC_SUBJECT','Test Authority','v1','2025-01-01','2025-12-31','published','pgTAP fixture v1'),
  ('858e0000-0000-4000-8000-000000000002','TEST_AEC_SUBJECT','Test Authority','v2','2026-01-01',null,'published','pgTAP fixture v2'),
  ('858e0000-0000-4000-8000-000000000003','TEST_AEC_INACTIVE','Test Authority','v1','2026-01-01',null,'published','pgTAP inactive fixture'),
  ('858e0000-0000-4000-8000-000000000004','TEST_AEC_SUPERSEDED','Test Authority','v1','2026-01-01',null,'published','pgTAP superseded fixture');

insert into public.statutory_codes(id,code_set_id,code,label,status) values
  ('858f0000-0000-4000-8000-000000000001','858e0000-0000-4000-8000-000000000001','OLD','Old Biology','active'),
  ('858f0000-0000-4000-8000-000000000002','858e0000-0000-4000-8000-000000000002','NEW','New Biology','active'),
  ('858f0000-0000-4000-8000-000000000003','858e0000-0000-4000-8000-000000000003','OFF','Inactive Biology','active'),
  ('858f0000-0000-4000-8000-000000000004','858e0000-0000-4000-8000-000000000004','OLD2','Superseded Biology','active');

insert into public.statutory_code_mappings(
  id,tenant_id,school_id,code_id,target_type,target_id,effective_from,effective_to,status
) values
  ('85900000-0000-4000-8000-000000000001','858b0000-0000-4000-8000-000000000001','858c0000-0000-4000-8000-000000000001','858f0000-0000-4000-8000-000000000001','subject','858d0000-0000-4000-8000-000000000001','2025-01-01','2025-12-31','active'),
  ('85900000-0000-4000-8000-000000000002','858b0000-0000-4000-8000-000000000001','858c0000-0000-4000-8000-000000000001','858f0000-0000-4000-8000-000000000002','subject','858d0000-0000-4000-8000-000000000001','2026-01-01',null,'active'),
  ('85900000-0000-4000-8000-000000000003','858b0000-0000-4000-8000-000000000001','858c0000-0000-4000-8000-000000000001','858f0000-0000-4000-8000-000000000003','subject','858d0000-0000-4000-8000-000000000001','2026-01-01',null,'active'),
  ('85900000-0000-4000-8000-000000000004','858b0000-0000-4000-8000-000000000001','858c0000-0000-4000-8000-000000000001','858f0000-0000-4000-8000-000000000004','subject','858d0000-0000-4000-8000-000000000001','2026-01-01',null,'active');

update public.statutory_codes set status='inactive'
where id='858f0000-0000-4000-8000-000000000003';
update public.statutory_codes set status='superseded'
where id='858f0000-0000-4000-8000-000000000004';

select is(
  (select count(*)::integer from public.statutory_codes where code_set_id='85810000-0000-4000-8000-000000000001'),
  4,
  'only the four explicitly supplied AEC subject codes are seeded'
);
select is(
  (select count(*)::integer from public.statutory_codes where code_set_id='85810000-0000-4000-8000-000000000002'),
  6,
  'only the six explicitly supplied AEC appointment codes are seeded'
);

select throws_ok(
  $$insert into public.statutory_code_sets(set_key,authority,version_key,effective_from,status,source_reference)
    values('TEST_AEC_SUBJECT','Test Authority','v2','2027-01-01','draft','duplicate version')$$,
  '23505',
  null,
  'duplicate code-set version is rejected'
);

select throws_ok(
  $$insert into public.statutory_codes(code_set_id,code,label)
    values('858e0000-0000-4000-8000-000000000002','NEW','Duplicate New Biology')$$,
  '23505',
  null,
  'duplicate code inside a version is rejected'
);

select throws_ok(
  $$insert into public.statutory_code_mappings(
      tenant_id,school_id,code_id,target_type,target_id,effective_from,status
    ) values(
      '858b0000-0000-4000-8000-000000000001',
      '858c0000-0000-4000-8000-000000000001',
      '858f0000-0000-4000-8000-000000000002',
      'subject',
      '858d0000-0000-4000-8000-000000000002',
      '2026-01-01',
      'active'
    )$$,
  'P0001',
  'Statutory mapping target does not belong to the supplied school and tenant scope',
  'cross-school and cross-tenant canonical target misuse is denied'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','858a0000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is(
  (select version_key from public.resolve_statutory_code_set('TEST_AEC_SUBJECT','2025-06-01')),
  'v1',
  'effective version resolver deterministically returns v1 for 2025'
);
select is(
  (select version_key from public.resolve_statutory_code_set('TEST_AEC_SUBJECT','2026-06-01')),
  'v2',
  'effective version resolver deterministically returns v2 for 2026'
);
select is(
  (select code from public.resolve_statutory_code(
    'TEST_AEC_SUBJECT','subject','858d0000-0000-4000-8000-000000000001',
    '858c0000-0000-4000-8000-000000000001','2025-06-01'
  )),
  'OLD',
  'canonical subject resolves to the v1 statutory code in the old effective period'
);
select is(
  (select code from public.resolve_statutory_code(
    'TEST_AEC_SUBJECT','subject','858d0000-0000-4000-8000-000000000001',
    '858c0000-0000-4000-8000-000000000001','2026-06-01'
  )),
  'NEW',
  'canonical subject mapping changes correctly with the effective code-set version'
);
select is(
  (select resolution_state from public.resolve_statutory_code(
    'TEST_AEC_INACTIVE','subject','858d0000-0000-4000-8000-000000000001',
    '858c0000-0000-4000-8000-000000000001','2026-06-01'
  )),
  'source_required',
  'inactive statutory code fails closed'
);
select is(
  (select resolution_state from public.resolve_statutory_code(
    'TEST_AEC_SUPERSEDED','subject','858d0000-0000-4000-8000-000000000001',
    '858c0000-0000-4000-8000-000000000001','2026-06-01'
  )),
  'source_required',
  'superseded statutory code fails closed'
);
select is(
  (select resolution_state from public.resolve_statutory_code(
    'UNSUPPORTED_AEC_CODE_SET','subject','858d0000-0000-4000-8000-000000000001',
    '858c0000-0000-4000-8000-000000000001','2026-06-01'
  )),
  'source_required',
  'unsupported statutory code remains explicitly source-required'
);

select throws_ok(
  $$insert into public.statutory_code_sets(set_key,authority,version_key,effective_from,status,source_reference)
    values('SCHOOL_INVENTED','Invented','v1','2026-01-01','draft','not allowed')$$,
  '42501',
  null,
  'ordinary school actor cannot mutate the platform registry'
);

reset role;

select set_config('request.jwt.claim.sub','858a0000-0000-4000-8000-000000000004',true);
set local role authenticated;
select is(
  (select code from public.resolve_statutory_code(
    'TEST_AEC_SUBJECT','subject','858d0000-0000-4000-8000-000000000001',
    '858c0000-0000-4000-8000-000000000001','2026-06-01'
  )),
  'NEW',
  'ordinary current-school teacher may resolve applicable published values'
);
reset role;

select set_config('request.jwt.claim.sub','858a0000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok(
  $$select * from public.resolve_statutory_code(
    'TEST_AEC_SUBJECT','subject','858d0000-0000-4000-8000-000000000001',
    '858c0000-0000-4000-8000-000000000001','2026-06-01'
  )$$,
  'P0001',
  'Permission denied',
  'Platform Support does not inherit statutory registry resolution authority'
);
select throws_ok(
  $$insert into public.statutory_code_sets(set_key,authority,version_key,effective_from,status,source_reference)
    values('SUPPORT_INVENTED','Invented','v1','2026-01-01','draft','not allowed')$$,
  '42501',
  null,
  'Platform Support cannot mutate the registry'
);
reset role;

select set_config('request.jwt.claim.sub','858a0000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok(
  $q$1 into public.statutory_code_sets(set_key,authority,version_key,effective_from,status,source_reference)
    values('PLATFORM_GOVERNED','Test Authority','v1','2026-01-01','draft','platform governed fixture')$q$,
  'Platform Admin may create a governed statutory code-set version'
);

select lives_ok(
  $q$1 public.statutory_code_sets
    set authority='Updated Test Authority',
        source_reference='updated draft fixture'
    where set_key='PLATFORM_GOVERNED' and version_key='v1'$q$,
  'draft statutory code-set identity and source metadata remain editable before publication'
);

select throws_ok(
  $q$1 public.statutory_codes
    set code='REWRITTEN'
    where id='858f0000-0000-4000-8000-000000000001'$q$,
  'P0001',
  'Codes in finalized statutory code-set versions have immutable set identity, code, label, and provenance',
  'published statutory code value cannot be rewritten'
);

select throws_ok(
  $q$1 public.statutory_codes
    set label='Different historical meaning'
    where id='858f0000-0000-4000-8000-000000000001'$q$,
  'P0001',
  'Codes in finalized statutory code-set versions have immutable set identity, code, label, and provenance',
  'published statutory code label and historical meaning cannot be rewritten'
);

select throws_ok(
  $q$1 public.statutory_code_sets
    set set_key='REWRITTEN_SET'
    where id='858e0000-0000-4000-8000-000000000001'$q$,
  'P0001',
  'Finalized statutory code-set identity, effective period, and provenance are immutable',
  'published statutory code-set identity cannot be rewritten'
);

select throws_ok(
  $q$1 public.statutory_code_sets
    set source_reference='rewritten historical source'
    where id='858e0000-0000-4000-8000-000000000001'$q$,
  'P0001',
  'Finalized statutory code-set identity, effective period, and provenance are immutable',
  'published statutory code-set authoritative source cannot be rewritten'
);

select throws_ok(
  $q$1 public.statutory_code_sets
    set source_metadata='{"rewritten":true}'::jsonb
    where id='858e0000-0000-4000-8000-000000000001'$q$,
  'P0001',
  'Finalized statutory code-set identity, effective period, and provenance are immutable',
  'published statutory code-set provenance metadata cannot be rewritten'
);

select throws_ok(
  $q$1 public.statutory_codes
    set status='superseded',
        superseded_by_code_id='858f0000-0000-4000-8000-000000000003'
    where id='858f0000-0000-4000-8000-000000000001'$q$,
  'P0001',
  'Replacement statutory code must belong to a later compatible finalized version of the same code set',
  'superseded_by cannot point to an unrelated code set'
);

select lives_ok(
  $q$1 public.statutory_code_sets
    set status='superseded', updated_at=now()
    where id='858e0000-0000-4000-8000-000000000001'$q$,
  'published statutory code-set may move through the controlled superseded lifecycle'
);

select is(
  (select code from public.resolve_statutory_code(
    'TEST_AEC_SUBJECT','subject','858d0000-0000-4000-8000-000000000001',
    '858c0000-0000-4000-8000-000000000001','2025-06-01'
  )),
  'OLD',
  'old effective-date resolver returns the exact historical code after version supersession'
);

reset role;

select ok(
  exists (
    select 1
    from public.audit_events
    where event_type='statutory.code_registry.insert'
      and entity_type='statutory_code_sets'
  ),
  'platform registry mutation is audit recorded'
);

select ok(
  to_regprocedure('public.certify_statutory_snapshot(uuid,text,text)') is not null
  and to_regprocedure('public.compile_statutory_mapping(uuid)') is not null
  and to_regclass('public.statutory_snapshots') is not null,
  'existing statutory snapshot and mapping engine remains intact'
);

select ok(
  not has_function_privilege('anon','public.resolve_statutory_code_set(text,date)','EXECUTE')
  and not has_function_privilege('anon','public.resolve_statutory_code(text,text,uuid,uuid,date)','EXECUTE'),
  'anonymous callers cannot resolve statutory codes'
);

select * from finish();
rollback;
