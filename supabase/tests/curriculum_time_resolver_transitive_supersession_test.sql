begin;

select plan(8);

select has_function(
  'public',
  'resolve_curriculum_time_allocation',
  array['uuid','text','smallint','integer','text','smallint','uuid'],
  'exact-cycle resolver remains available'
);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values(
  'fd010000-0000-4000-8000-000000000001',
  'resolver-remediation-platform@example.test',
  'authenticated','authenticated',now(),now()
);

insert into public.platform_memberships(user_id,role_key,active_from)
values(
  'fd010000-0000-4000-8000-000000000001',
  'platform_admin',
  current_date-10
);

select set_config('request.jwt.claim.sub','fd010000-0000-4000-8000-000000000001',true);
set local role authenticated;

insert into public.curriculum_sources(
  id,authority,source_key,title,source_url,checksum,provenance,status
) values(
  'fd020000-0000-4000-8000-000000000001',
  'NIED',
  'resolver-transitive-source',
  'Resolver Transitive Supersession Source',
  'https://example.test/resolver-transitive.pdf',
  'sha256:resolver-transitive',
  '{"fixture":"resolver-transitive"}'::jsonb,
  'verified'
);

insert into public.curriculum_subjects(
  id,curriculum_key,display_name,phase_code,subject_code,authority,active
) values(
  'fd030000-0000-4000-8000-000000000001',
  'resolver-transitive-subject',
  'Resolver Transitive Subject',
  'junior_secondary',
  'RTRANS',
  'NIED',
  true
);

insert into public.curriculum_time_profiles(
  id,source_id,profile_key,title,phase_code,cycle_kind,cycle_length,period_minutes,
  effective_from_year,effective_to_year,supersedes_profile_id,status,provenance
) values
  (
    'fd040000-0000-4000-8000-000000000001',
    'fd020000-0000-4000-8000-000000000001',
    'resolver-chain-a','Resolver chain A',
    'junior_secondary','rotating',7,40,2026,2030,null,'draft',
    '{"locator":"profile A"}'::jsonb
  ),
  (
    'fd040000-0000-4000-8000-000000000002',
    'fd020000-0000-4000-8000-000000000001',
    'resolver-chain-b','Resolver chain B',
    'junior_secondary','rotating',7,40,2027,2027,
    'fd040000-0000-4000-8000-000000000001','draft',
    '{"locator":"profile B"}'::jsonb
  ),
  (
    'fd040000-0000-4000-8000-000000000003',
    'fd020000-0000-4000-8000-000000000001',
    'resolver-chain-c','Resolver chain C',
    'junior_secondary','rotating',7,40,2028,2030,
    'fd040000-0000-4000-8000-000000000002','draft',
    '{"locator":"profile C"}'::jsonb
  );

insert into public.curriculum_time_allocations(
  id,profile_id,curriculum_subject_id,allocation_key,target_kind,display_label,
  grade_from,grade_to,periods_per_cycle,rule_strength,source_locator,status
) values
  (
    'fd050000-0000-4000-8000-000000000001',
    'fd040000-0000-4000-8000-000000000001',
    'fd030000-0000-4000-8000-000000000001',
    'resolver-chain-a-g9','subject','Resolver chain A',
    9,9,4,'prescribed','Profile A Grade 9','draft'
  ),
  (
    'fd050000-0000-4000-8000-000000000002',
    'fd040000-0000-4000-8000-000000000002',
    'fd030000-0000-4000-8000-000000000001',
    'resolver-chain-b-g9','subject','Resolver chain B',
    9,9,5,'prescribed','Profile B Grade 9','draft'
  ),
  (
    'fd050000-0000-4000-8000-000000000003',
    'fd040000-0000-4000-8000-000000000003',
    'fd030000-0000-4000-8000-000000000001',
    'resolver-chain-c-g9','subject','Resolver chain C',
    9,9,6,'prescribed','Profile C Grade 9','draft'
  );

select lives_ok(
  $$update public.curriculum_time_allocations
    set status='verified'
    where id in(
      'fd050000-0000-4000-8000-000000000001',
      'fd050000-0000-4000-8000-000000000002',
      'fd050000-0000-4000-8000-000000000003'
    )$$,
  'chain allocations can be verified before profile publication'
);

select lives_ok(
  $$update public.curriculum_time_profiles
    set status='verified'
    where id in(
      'fd040000-0000-4000-8000-000000000001',
      'fd040000-0000-4000-8000-000000000002',
      'fd040000-0000-4000-8000-000000000003'
    )$$,
  'chain profiles can be verified'
);

select lives_ok(
  $$update public.curriculum_time_profiles
    set status='published'
    where id='fd040000-0000-4000-8000-000000000001'$$,
  'predecessor profile publishes'
);

select lives_ok(
  $$update public.curriculum_time_profiles
    set status='published'
    where id='fd040000-0000-4000-8000-000000000002'$$,
  'direct successor profile publishes'
);

select lives_ok(
  $$update public.curriculum_time_profiles
    set status='published'
    where id='fd040000-0000-4000-8000-000000000003'$$,
  'transitive successor profile publishes under governance closure'
);

update public.curriculum_time_allocations
set status='published'
where id in(
  'fd050000-0000-4000-8000-000000000001',
  'fd050000-0000-4000-8000-000000000002',
  'fd050000-0000-4000-8000-000000000003'
);

select is(
  (
    select resolution_status||':'||allocation_id::text||':'||periods_per_cycle::text
    from public.resolve_curriculum_time_allocation(
      'fd030000-0000-4000-8000-000000000001',
      null,
      9::smallint,
      2028,
      'rotating',
      7::smallint,
      null
    )
  ),
  'resolved:fd050000-0000-4000-8000-000000000003:6',
  '2028 resolver suppresses A through transitive A <- B <- C even though B is not effective in 2028'
);

select is(
  (
    select allocation_id::text
    from public.resolve_curriculum_time_allocation(
      'fd030000-0000-4000-8000-000000000001',
      null,
      9::smallint,
      2027,
      'rotating',
      7::smallint,
      null
    )
  ),
  'fd050000-0000-4000-8000-000000000002',
  '2027 resolver still selects the direct B successor for its own effective year'
);

select * from finish();
rollback;
