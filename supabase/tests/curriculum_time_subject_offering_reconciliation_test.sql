begin;

select plan(35);

select has_column('public','subject_offerings','curriculum_time_allocation_id','subject offerings can link one official time allocation');
select has_column('public','subject_offerings','allocation_origin','subject offerings store allocation provenance origin');
select has_column('public','subject_offerings','allocation_override_reason','subject offerings store bounded override reason');
select has_column('public','subject_offerings','allocation_acknowledged_by_user_id','subject offerings store acknowledgement actor');
select has_column('public','subject_offerings','allocation_acknowledged_at','subject offerings store acknowledgement time');

select is(
  (
    select column_default
    from information_schema.columns
    where table_schema='public'
      and table_name='subject_offerings'
      and column_name='allocation_origin'
  ),
  '''legacy''::text',
  'new and pre-feature offering rows default to legacy provenance'
);

select has_function(
  'public',
  'preview_subject_offering_time_allocation_reconciliation',
  array['uuid','integer'],
  'bounded school reconciliation preview exists'
);
select has_function(
  'public',
  'reconcile_subject_offering_time_allocation',
  array['uuid','text','uuid','smallint','smallint','text'],
  'governed offering reconciliation commit exists'
);
select is(
  has_function_privilege(
    'anon',
    'public.preview_subject_offering_time_allocation_reconciliation(uuid,integer)',
    'EXECUTE'
  ),
  false,
  'anonymous clients cannot preview school offering reconciliation'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.preview_subject_offering_time_allocation_reconciliation(uuid,integer)',
    'EXECUTE'
  ),
  true,
  'authenticated school managers can invoke the guarded preview'
);
select is(
  has_function_privilege(
    'anon',
    'public.reconcile_subject_offering_time_allocation(uuid,text,uuid,smallint,smallint,text)',
    'EXECUTE'
  ),
  false,
  'anonymous clients cannot commit school offering reconciliation'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.guard_subject_offering_time_allocation_state()',
    'EXECUTE'
  )
  and exists(
    select 1
    from pg_trigger
    where tgrelid='public.subject_offerings'::regclass
      and tgname='subject_offering_time_allocation_state_guard_trg'
      and not tgisinternal
  ),
  'provenance guard is private and physically installed'
);

insert into public.tenants(id,name,slug)
values(
  'fa500000-0000-4000-8000-000000000001',
  'Curriculum Time Reconciliation Tenant',
  'curriculum-time-reconciliation'
);

insert into public.schools(
  id,tenant_id,name,emis_number,region,town,timetable_cycle_mode,timetable_cycle_length
)
values(
  'fa510000-0000-4000-8000-000000000001',
  'fa500000-0000-4000-8000-000000000001',
  'Curriculum Time Reconciliation School',
  'CTR-001',
  'Erongo',
  'Swakopmund',
  'rotating',
  7
);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fa520000-0000-4000-8000-000000000001','time-reconcile-platform@example.test','authenticated','authenticated',now(),now()),
  ('fa520000-0000-4000-8000-000000000002','time-reconcile-admin@example.test','authenticated','authenticated',now(),now()),
  ('fa520000-0000-4000-8000-000000000003','time-reconcile-principal@example.test','authenticated','authenticated',now(),now()),
  ('fa520000-0000-4000-8000-000000000004','time-reconcile-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key,active_from)
values(
  'fa520000-0000-4000-8000-000000000001',
  'platform_admin',
  current_date-10
);

insert into public.school_memberships(
  id,tenant_id,school_id,user_id,role_key,active_from
) values
  (
    'fa521000-0000-4000-8000-000000000001',
    'fa500000-0000-4000-8000-000000000001',
    'fa510000-0000-4000-8000-000000000001',
    'fa520000-0000-4000-8000-000000000002',
    'school_admin',
    current_date-10
  ),
  (
    'fa521000-0000-4000-8000-000000000002',
    'fa500000-0000-4000-8000-000000000001',
    'fa510000-0000-4000-8000-000000000001',
    'fa520000-0000-4000-8000-000000000003',
    'principal',
    current_date-10
  ),
  (
    'fa521000-0000-4000-8000-000000000003',
    'fa500000-0000-4000-8000-000000000001',
    'fa510000-0000-4000-8000-000000000001',
    'fa520000-0000-4000-8000-000000000004',
    'teacher',
    current_date-10
  );

insert into public.subjects(
  id,tenant_id,school_id,subject_code,display_name,status
) values
  (
    'fa530000-0000-4000-8000-000000000001',
    'fa500000-0000-4000-8000-000000000001',
    'fa510000-0000-4000-8000-000000000001',
    'TIME-EXACT',
    'Time Mathematics',
    'active'
  ),
  (
    'fa530000-0000-4000-8000-000000000002',
    'fa500000-0000-4000-8000-000000000001',
    'fa510000-0000-4000-8000-000000000001',
    'TIME-DIFF',
    'Time Mathematics School Variant',
    'active'
  ),
  (
    'fa530000-0000-4000-8000-000000000003',
    'fa500000-0000-4000-8000-000000000001',
    'fa510000-0000-4000-8000-000000000001',
    'TIME-LOCAL',
    'Time Mathematics',
    'active'
  );

insert into public.grades(
  id,tenant_id,school_id,academic_year,grade_code,display_name
) values(
  'fa540000-0000-4000-8000-000000000001',
  'fa500000-0000-4000-8000-000000000001',
  'fa510000-0000-4000-8000-000000000001',
  2026,
  'G9',
  'Grade 9'
);

insert into public.subject_offerings(
  id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status
) values
  (
    'fa550000-0000-4000-8000-000000000001',
    'fa500000-0000-4000-8000-000000000001',
    'fa510000-0000-4000-8000-000000000001',
    2026,
    'fa530000-0000-4000-8000-000000000001',
    'fa540000-0000-4000-8000-000000000001',
    5,
    'active'
  ),
  (
    'fa550000-0000-4000-8000-000000000002',
    'fa500000-0000-4000-8000-000000000001',
    'fa510000-0000-4000-8000-000000000001',
    2026,
    'fa530000-0000-4000-8000-000000000002',
    'fa540000-0000-4000-8000-000000000001',
    4,
    'active'
  ),
  (
    'fa550000-0000-4000-8000-000000000003',
    'fa500000-0000-4000-8000-000000000001',
    'fa510000-0000-4000-8000-000000000001',
    2026,
    'fa530000-0000-4000-8000-000000000003',
    'fa540000-0000-4000-8000-000000000001',
    4,
    'active'
  );

select is(
  (
    select count(*)
    from public.subject_offerings
    where id in (
      'fa550000-0000-4000-8000-000000000001',
      'fa550000-0000-4000-8000-000000000002',
      'fa550000-0000-4000-8000-000000000003'
    )
      and allocation_origin='legacy'
      and curriculum_time_allocation_id is null
  ),
  3::bigint,
  'pre-feature-style offerings remain explicitly legacy and unlinked'
);

insert into public.curriculum_sources(
  id,authority,source_key,title,source_url,checksum,provenance,status
) values(
  'fa560000-0000-4000-8000-000000000001',
  'NIED',
  'slice2-time-source',
  'Slice 2 Time Source',
  'https://example.test/nied/slice2-time.pdf',
  'sha256:slice2-time',
  '{"fixture":"slice2-time-reconciliation"}'::jsonb,
  'verified'
);

insert into public.curriculum_subjects(
  id,curriculum_key,display_name,phase_code,subject_code,authority,active
) values(
  'fa570000-0000-4000-8000-000000000001',
  'slice2-time-math',
  'Time Mathematics',
  'junior_secondary',
  'S2MATH',
  'NIED',
  true
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fa520000-0000-4000-8000-000000000002',true);
set local role authenticated;

insert into public.school_subject_curriculum_mappings(
  id,tenant_id,school_id,subject_id,curriculum_subject_id,grade_code,phase_code,
  effective_from_year,effective_to_year,status,created_by_user_id
) values
  (
    'fa580000-0000-4000-8000-000000000001',
    'fa500000-0000-4000-8000-000000000001',
    'fa510000-0000-4000-8000-000000000001',
    'fa530000-0000-4000-8000-000000000001',
    'fa570000-0000-4000-8000-000000000001',
    'G9',
    'junior_secondary',
    2026,
    2026,
    'verified',
    'fa520000-0000-4000-8000-000000000002'
  ),
  (
    'fa580000-0000-4000-8000-000000000002',
    'fa500000-0000-4000-8000-000000000001',
    'fa510000-0000-4000-8000-000000000001',
    'fa530000-0000-4000-8000-000000000002',
    'fa570000-0000-4000-8000-000000000001',
    'G9',
    'junior_secondary',
    2026,
    2026,
    'verified',
    'fa520000-0000-4000-8000-000000000002'
  );

reset role;
select set_config('request.jwt.claim.sub','fa520000-0000-4000-8000-000000000001',true);
set local role authenticated;

insert into public.curriculum_time_profiles(
  id,source_id,profile_key,title,phase_code,cycle_kind,cycle_length,period_minutes,
  total_periods_per_cycle,effective_from_year,effective_to_year,status,provenance
) values(
  'fa590000-0000-4000-8000-000000000001',
  'fa560000-0000-4000-8000-000000000001',
  'slice2-js-7day',
  'Slice 2 Junior Secondary 7-day',
  'junior_secondary',
  'rotating',
  7,
  40,
  56,
  2026,
  2026,
  'draft',
  '{"locator":"Slice 2 fixture"}'::jsonb
);

update public.curriculum_time_profiles
set status='verified'
where id='fa590000-0000-4000-8000-000000000001';
update public.curriculum_time_profiles
set status='published'
where id='fa590000-0000-4000-8000-000000000001';

insert into public.curriculum_time_allocations(
  id,profile_id,curriculum_subject_id,allocation_key,target_kind,display_label,
  grade_from,grade_to,periods_per_cycle,rule_strength,source_locator,status
) values(
  'fa5a0000-0000-4000-8000-000000000001',
  'fa590000-0000-4000-8000-000000000001',
  'fa570000-0000-4000-8000-000000000001',
  'slice2-math-g9',
  'subject',
  'Time Mathematics',
  9,
  9,
  5,
  'prescribed',
  'Slice 2 source: Grade 9 Mathematics',
  'draft'
);

update public.curriculum_time_allocations
set status='verified'
where id='fa5a0000-0000-4000-8000-000000000001';
update public.curriculum_time_allocations
set status='published'
where id='fa5a0000-0000-4000-8000-000000000001';

reset role;
select set_config('request.jwt.claim.sub','fa520000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is(
  (
    select string_agg(subject_code || ':' || match_status,',' order by subject_code)
    from public.preview_subject_offering_time_allocation_reconciliation(
      'fa510000-0000-4000-8000-000000000001',
      2026
    )
  ),
  'TIME-DIFF:different_value,TIME-EXACT:exact_match,TIME-LOCAL:no_subject_mapping',
  'preview distinguishes exact, different and unmapped offerings without display-name inference'
);

select is(
  (
    select concat_ws(
      ':',
      official_periods_per_cycle::text,
      cycle_kind,
      cycle_length::text,
      rule_strength,
      source_title
    )
    from public.preview_subject_offering_time_allocation_reconciliation(
      'fa510000-0000-4000-8000-000000000001',
      2026
    )
    where subject_offering_id='fa550000-0000-4000-8000-000000000001'
  ),
  '5:rotating:7:prescribed:Slice 2 Time Source',
  'preview exposes exact-cycle official value and bounded source provenance'
);

select throws_ok(
  $$update public.subject_offerings
      set curriculum_time_allocation_id='fa5a0000-0000-4000-8000-000000000001',
          allocation_origin='official_default',
          allocation_acknowledged_by_user_id='fa520000-0000-4000-8000-000000000002',
          allocation_acknowledged_at=now()
    where id='fa550000-0000-4000-8000-000000000001'$$,
  'Reconciled subject-offering time allocation state must use the governed workflow',
  'direct official linkage cannot bypass reconciliation'
);

select is(
  (
    select concat_ws(
      ':',
      allocation_origin,
      curriculum_time_allocation_id::text,
      periods_per_cycle::text
    )
    from public.reconcile_subject_offering_time_allocation(
      'fa550000-0000-4000-8000-000000000001',
      'official_default',
      'fa5a0000-0000-4000-8000-000000000001',
      5::smallint,
      null,
      null
    )
  ),
  'official_default:fa5a0000-0000-4000-8000-000000000001:5',
  'explicit exact-match confirmation links the offering without rewriting the target'
);

select is(
  (
    select count(*)
    from public.audit_events
    where entity_id='fa550000-0000-4000-8000-000000000001'
      and event_type='subject_offering_allocation_reconciled'
  ),
  1::bigint,
  'official reconciliation emits one bounded audit event'
);

select lives_ok(
  $$select *
    from public.reconcile_subject_offering_time_allocation(
      'fa550000-0000-4000-8000-000000000001',
      'official_default',
      'fa5a0000-0000-4000-8000-000000000001',
      5::smallint,
      null,
      null
    )$$,
  'repeating the same reconciliation remains a valid idempotent operation'
);

select is(
  (
    select count(*)
    from public.audit_events
    where entity_id='fa550000-0000-4000-8000-000000000001'
      and event_type='subject_offering_allocation_reconciled'
  ),
  1::bigint,
  'repeating the same reconciliation does not duplicate audit history'
);

select throws_ok(
  $$update public.subject_offerings
      set periods_per_cycle=4
    where id='fa550000-0000-4000-8000-000000000001'$$,
  'Reconciled subject-offering time allocation state must use the governed workflow',
  'linked school target cannot drift outside the governed override workflow'
);

select throws_ok(
  $$select *
    from public.reconcile_subject_offering_time_allocation(
      'fa550000-0000-4000-8000-000000000002',
      'official_default',
      'fa5a0000-0000-4000-8000-000000000001',
      4::smallint,
      null,
      null
    )$$,
  'Official-default reconciliation requires the existing school target to already equal the official allocation',
  'a differing legacy target is never silently rewritten to the official value'
);

select throws_ok(
  $$select *
    from public.reconcile_subject_offering_time_allocation(
      'fa550000-0000-4000-8000-000000000002',
      'school_override',
      'fa5a0000-0000-4000-8000-000000000001',
      4::smallint,
      null,
      null
    )$$,
  'School override reason is required',
  'school variance requires an explicit reason'
);

select throws_ok(
  $$select *
    from public.reconcile_subject_offering_time_allocation(
      'fa550000-0000-4000-8000-000000000002',
      'school_override',
      'fa5a0000-0000-4000-8000-000000000001',
      5::smallint,
      null,
      'Keep current school target'
    )$$,
  'Reconciliation preview is stale; school target changed before commit',
  'commit is bound to the previewed school target as well as the official allocation'
);

select throws_ok(
  $$select *
    from public.reconcile_subject_offering_time_allocation(
      'fa550000-0000-4000-8000-000000000002',
      'school_override',
      'fa5a0000-0000-4000-8000-000000000099',
      4::smallint,
      null,
      'Keep current school target'
    )$$,
  'Reconciliation preview is stale; refresh before committing',
  'commit is bound to the exact previewed official allocation'
);

select is(
  (
    select concat_ws(
      ':',
      allocation_origin,
      periods_per_cycle::text,
      allocation_override_reason
    )
    from public.reconcile_subject_offering_time_allocation(
      'fa550000-0000-4000-8000-000000000002',
      'school_override',
      'fa5a0000-0000-4000-8000-000000000001',
      4::smallint,
      null,
      'Keep current school target'
    )
  ),
  'school_override:4:Keep current school target',
  'different school target is preserved and recorded as an intentional override'
);

select ok(
  (
    select
      allocation_acknowledged_by_user_id='fa520000-0000-4000-8000-000000000002'
      and allocation_acknowledged_at is not null
    from public.subject_offerings
    where id='fa550000-0000-4000-8000-000000000002'
  ),
  'override captures the school actor and acknowledgement time'
);

select is(
  (
    select count(*)
    from public.audit_events
    where entity_id='fa550000-0000-4000-8000-000000000002'
      and event_type='subject_offering_allocation_overridden'
  ),
  1::bigint,
  'school override emits one bounded audit event'
);

select ok(
  exists(
    select 1
    from public.audit_events
    where entity_id='fa550000-0000-4000-8000-000000000002'
      and event_type='subject_offering_allocation_overridden'
      and metadata->>'new_override_reason'='Keep current school target'
      and metadata->>'old_override_reason' is null
  ),
  'audit history preserves the bounded override reason transition'
);

select is(
  (
    select concat_ws(':',allocation_origin,periods_per_cycle::text)
    from public.reconcile_subject_offering_time_allocation(
      'fa550000-0000-4000-8000-000000000003',
      'school_configured',
      null,
      4::smallint,
      6::smallint,
      null
    )
  ),
  'school_configured:6',
  'unmapped offering can explicitly become a school-configured operational target'
);

select throws_ok(
  $$select *
    from public.reconcile_subject_offering_time_allocation(
      'fa550000-0000-4000-8000-000000000001',
      'school_configured',
      null,
      5::smallint,
      5::smallint,
      null
    )$$,
  'Applicable official allocation is resolved; use official_default or school_override',
  'school-configured state cannot hide an applicable resolved official rule'
);

reset role;
select set_config('request.jwt.claim.sub','fa520000-0000-4000-8000-000000000003',true);
set local role authenticated;

select lives_ok(
  $$select *
    from public.preview_subject_offering_time_allocation_reconciliation(
      'fa510000-0000-4000-8000-000000000001',
      2026
    )$$,
  'principal inherits existing school-settings authority for reconciliation preview'
);

select lives_ok(
  $$select *
    from public.reconcile_subject_offering_time_allocation(
      'fa550000-0000-4000-8000-000000000003',
      'school_configured',
      null,
      6::smallint,
      6::smallint,
      null
    )$$,
  'principal inherits existing school-settings authority for idempotent reconciliation'
);

reset role;
select set_config('request.jwt.claim.sub','fa520000-0000-4000-8000-000000000004',true);
set local role authenticated;

select throws_ok(
  $$select *
    from public.preview_subject_offering_time_allocation_reconciliation(
      'fa510000-0000-4000-8000-000000000001',
      2026
    )$$,
  'Permission denied',
  'teacher cannot run school-wide legacy reconciliation preview'
);

select throws_ok(
  $$select *
    from public.reconcile_subject_offering_time_allocation(
      'fa550000-0000-4000-8000-000000000003',
      'school_configured',
      null,
      6::smallint,
      6::smallint,
      null
    )$$,
  'Permission denied',
  'teacher cannot mutate school allocation policy'
);

select * from finish();
rollback;
